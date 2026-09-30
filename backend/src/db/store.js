import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { assertCanSetRole, effectiveRole } from "../auth/roles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const MAX_NAME_LENGTH = 24;

function emptyStore() {
  return { users: {} };
}

/** Remove password fields — for the owner or internal use */
export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  return { ...safe, role: effectiveRole(user) };
}

/** Public profile — only safe fields for other users to see */
export function sanitizeUserPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    isGuest: Boolean(user.isGuest),
    stats: user.stats || {},
    googleLinked: Boolean(user.googleId),
    role: effectiveRole(user),
  };
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}

// ---------------------------------------------------------------------------
// Persistence. The store is an in-memory object (`{ users }`) that every function below mutates and then
// passes to saveStore(). With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, saveStore() also writes the
// changed users to the Supabase `users` table (see backend/supabase/schema.sql). Without them it keeps
// using data/store.json, so local development works with no setup.
// ---------------------------------------------------------------------------
let supabase = null;
const synced = new Map(); // user id -> JSON last written to Supabase
let flushTimer = null;
let flushing = Promise.resolve();
let pendingStore = null;

export function supabaseEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

function toRow(user) {
  return {
    id: user.id,
    email: user.email || null,
    google_id: user.googleId || null,
    name: user.name || null,
    avatar: user.avatar || null,
    is_guest: false,
    stats: user.stats || {},
    data: user,
    updated_at: new Date().toISOString(),
  };
}

function readLocalStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return emptyStore();
  }
}

/** Sync loader (local JSON only). Prefer initStore(), which also reads from Supabase. */
export function loadStore() {
  return readLocalStore();
}

/** Loads the store at startup: from Supabase when configured, otherwise from data/store.json. */
export async function initStore() {
  if (!supabaseEnabled()) return readLocalStore();

  const db = getSupabase();
  const store = emptyStore();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from("users").select("id, data").range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase: no se pudieron cargar los usuarios (${error.message})`);
    for (const row of data) {
      store.users[row.id] = row.data;
      synced.set(row.id, JSON.stringify(row.data));
    }
    if (data.length < pageSize) break;
  }

  // First run against an empty database: bring over the accounts from the old local file.
  if (Object.keys(store.users).length === 0) {
    const local = readLocalStore();
    const accounts = Object.values(local.users || {}).filter((u) => !u.isGuest);
    if (accounts.length) {
      for (const u of accounts) store.users[u.id] = u;
      await flushToSupabase(store);
      console.log(`[Supabase] ${accounts.length} usuarios migrados desde data/store.json`);
    }
  }
  console.log(`[Supabase] ${Object.keys(store.users).length} usuarios cargados`);
  return store;
}

async function flushToSupabase(store) {
  const db = getSupabase();
  const upserts = [];
  const seen = new Set();
  for (const user of Object.values(store.users)) {
    if (user.isGuest) continue; // guests live only in memory
    seen.add(user.id);
    const json = JSON.stringify(user);
    if (synced.get(user.id) !== json) upserts.push({ row: toRow(user), json });
  }
  const removed = [...synced.keys()].filter((id) => !seen.has(id));

  if (upserts.length) {
    const { error } = await db.from("users").upsert(upserts.map((u) => u.row), { onConflict: "id" });
    if (error) throw error;
    for (const u of upserts) synced.set(u.row.id, u.json);
  }
  if (removed.length) {
    const { error } = await db.from("users").delete().in("id", removed);
    if (error) throw error;
    for (const id of removed) synced.delete(id);
  }
}

function scheduleFlush(store) {
  pendingStore = store;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushing = flushing
      .then(() => flushToSupabase(pendingStore))
      .catch((err) => console.error("[Supabase] No se pudo guardar:", err.message));
  }, 200);
}

/** Writes any pending changes now (call before the process exits). */
export async function flushStore() {
  if (!supabaseEnabled() || !pendingStore) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushing = flushing
    .then(() => flushToSupabase(pendingStore))
    .catch((err) => console.error("[Supabase] No se pudo guardar:", err.message));
  await flushing;
}

export function saveStore(store) {
  if (supabaseEnabled()) {
    scheduleFlush(store);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function validateName(name) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("El nombre no puede estar vacío");
  if (clean.length > MAX_NAME_LENGTH) throw new Error(`El nombre no puede superar ${MAX_NAME_LENGTH} caracteres`);
  return clean;
}

export function upsertUser(store, user) {
  const current = store.users[user.id] || {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    isGuest: Boolean(user.isGuest),
    email: user.email || null,
    role: "user",
    stats: {
      totalScore: 0,
      bestScore: 0,
      gamesPlayed: 0,
      wins: 0,
      bestStreak: 0,
      correctAnswers: 0,
      artistHits: {},
    },
  };
  current.name = user.name || current.name;
  current.avatar = user.avatar || current.avatar;
  if (user.email) current.email = user.email;
  if (user.isGuest !== undefined) current.isGuest = user.isGuest;
  if (user.passwordHash) current.passwordHash = user.passwordHash;
  if (user.passwordSalt) current.passwordSalt = user.passwordSalt;
  if (user.googleId) current.googleId = user.googleId;
  store.users[user.id] = current;
  saveStore(store);
  return current;
}

export function registerWithPassword(store, { name, email, password, avatar, guestId }) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanName = validateName(name);
  if (!cleanEmail) throw new Error("Correo electrónico requerido");
  if (!password || password.length < 2) throw new Error("La contraseña debe tener al menos 2 caracteres");

  // Check if email already registered
  const existing = Object.values(store.users).find(
    (u) => u.email && u.email.toLowerCase() === cleanEmail && !u.isGuest
  );
  if (existing) {
    throw new Error("Ya existe una cuenta con este correo electrónico. Inicia sesión.");
  }

  const { salt, hash } = hashPassword(password);
  const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const user = upsertUser(store, {
    id: userId,
    name: cleanName,
    email: cleanEmail,
    avatar: avatar || "#1DB954",
    isGuest: false,
    passwordHash: hash,
    passwordSalt: salt,
  });

  if (guestId) {
    claimGuestStats(store, user.id, guestId);
  }

  return sanitizeUser(store.users[user.id]);
}

export function loginWithPassword(store, { identifier, password, guestId }) {
  if (!identifier || !identifier.trim()) throw new Error("Introduce tu correo o nombre");
  if (!password) throw new Error("Introduce tu contraseña");
  const clean = identifier.trim().toLowerCase();

  const user = Object.values(store.users).find(
    (u) =>
      !u.isGuest &&
      ((u.email && u.email.toLowerCase() === clean) ||
        (u.name && u.name.toLowerCase() === clean))
  );

  if (!user) {
    throw new Error("Usuario o correo no encontrado. ¿Deseas crear una cuenta?");
  }

  if (user.passwordHash && user.passwordSalt) {
    const valid = verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!valid) throw new Error("Contraseña incorrecta");
  } else if (user.googleId) {
    throw new Error("Esta cuenta fue creada con Google. Por favor usa 'Continuar con Google'.");
  } else {
    throw new Error("Esta cuenta no tiene contraseña. Crea una cuenta nueva o entra con Google.");
  }

  if (guestId && guestId !== user.id) {
    claimGuestStats(store, user.id, guestId);
  }

  return sanitizeUser(store.users[user.id]);
}

export function upsertGoogleUser(store, { id, email, name, avatar, googleId }, guestId) {
  const cleanEmail = (email || "").trim().toLowerCase();
  // Find by googleId or by matching email
  let existing = Object.values(store.users).find(
    (u) => (u.googleId && u.googleId === googleId) || (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
  );

  if (existing) {
    existing.googleId = googleId;
    if (avatar) existing.avatar = avatar;
    if (!existing.name) existing.name = name;
    existing.isGuest = false;
    store.users[existing.id] = existing;
    saveStore(store);
    if (guestId && guestId !== existing.id) {
      claimGuestStats(store, existing.id, guestId);
    }
    return sanitizeUser(store.users[existing.id]);
  }

  const userId = id || `usr_g_${Date.now()}`;
  const newUser = upsertUser(store, {
    id: userId,
    name: name || "Jugador Google",
    email: cleanEmail,
    avatar: avatar || "#1DB954",
    isGuest: false,
    googleId,
  });

  if (guestId) {
    claimGuestStats(store, newUser.id, guestId);
  }

  return sanitizeUser(store.users[newUser.id]);
}


/** Link Google to an existing account */
export function linkGoogle(store, userId, { googleId, email, avatar }) {
  const user = store.users[userId];
  if (!user) throw new Error("Usuario no encontrado");
  if (user.googleId) throw new Error("Ya tienes Google vinculado");

  // Check that this googleId isn't linked to another account
  const conflict = Object.values(store.users).find((u) => u.googleId === googleId && u.id !== userId);
  if (conflict) throw new Error("Esta cuenta de Google ya está vinculada a otro usuario de YOAVLLY");

  user.googleId = googleId;
  if (email && !user.email) user.email = email.trim().toLowerCase();
  if (avatar) user.avatar = avatar;
  store.users[userId] = user;
  saveStore(store);
  return sanitizeUser(user);
}

/** Unlink Google — must have at least one other auth method */
export function unlinkGoogle(store, userId) {
  const user = store.users[userId];
  if (!user) throw new Error("Usuario no encontrado");
  if (!user.googleId) throw new Error("No tienes Google vinculado");

  const hasPassword = Boolean(user.passwordHash && user.passwordSalt);
  if (!hasPassword) {
    throw new Error("No puedes desvincular Google porque es tu único método de inicio de sesión. Establece una contraseña primero.");
  }

  delete user.googleId;
  store.users[userId] = user;
  saveStore(store);
  return sanitizeUser(user);
}

/** Delete user account permanently */
export function deleteUser(store, userId, confirmName) {
  const user = store.users[userId];
  if (!user) throw new Error("Usuario no encontrado");
  if (!confirmName || confirmName.trim() !== user.name) {
    throw new Error("El nombre de confirmación no coincide. Escribe tu nombre de usuario exacto para confirmar.");
  }

  delete store.users[userId];
  saveStore(store);
  return true;
}

export function updateUserName(store, userId, newName) {
  const user = store.users[userId];
  if (!user) throw new Error("Usuario no encontrado");
  const clean = validateName(newName);
  user.name = clean;
  store.users[userId] = user;
  saveStore(store);
  return sanitizeUser(user);
}

export function claimGuestStats(store, targetUserId, guestId) {
  if (!targetUserId || !guestId || targetUserId === guestId) return null;
  const guest = store.users[guestId];
  const user = store.users[targetUserId];
  // Only real guest records can be merged (and deleted); never another registered account.
  if (!guest || !user || !guest.isGuest || user.isGuest) return null;

  user.stats.totalScore += guest.stats.totalScore || 0;
  user.stats.bestScore = Math.max(user.stats.bestScore || 0, guest.stats.bestScore || 0);
  user.stats.gamesPlayed += guest.stats.gamesPlayed || 0;
  user.stats.wins += guest.stats.wins || 0;
  user.stats.bestStreak = Math.max(user.stats.bestStreak || 0, guest.stats.bestStreak || 0);
  user.stats.correctAnswers += guest.stats.correctAnswers || 0;

  if (guest.stats.artistHits) {
    user.stats.artistHits = user.stats.artistHits || {};
    for (const [artistId, count] of Object.entries(guest.stats.artistHits)) {
      user.stats.artistHits[artistId] = (user.stats.artistHits[artistId] || 0) + count;
    }
  }

  delete store.users[guestId];
  saveStore(store);
  return user;
}

export function applyMatchStats(store, players) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  ranked.forEach((player, index) => {
    // Only registered users get stats saved (never guests)
    if (player.isGuest || player.id?.startsWith("gst_")) return;

    const user = store.users[player.id];
    if (!user || user.isGuest) return;

    const s = user.stats;
    if (!s) return;
    s.gamesPlayed += 1;
    s.totalScore += player.score;
    s.bestScore = Math.max(s.bestScore, player.score);
    s.bestStreak = Math.max(s.bestStreak, player.bestStreak || 0);
    s.correctAnswers += player.correct || 0;
    if (index === 0 && ranked.length > 1) s.wins += 1;
    if (index === 0 && ranked.length === 1 && player.score > 0) s.wins += 1;

    if (player.artistHits) {
      s.artistHits = s.artistHits || {};
      for (const [aId, cnt] of Object.entries(player.artistHits)) {
        s.artistHits[aId] = (s.artistHits[aId] || 0) + cnt;
      }
    }
  });
  saveStore(store);
}

/** Changes a user's role. `actorId` must outrank both the target's current role and the new one. */
export function setUserRole(store, actorId, targetId, role) {
  const actor = store.users[actorId];
  const target = store.users[targetId];
  if (!target) throw new Error("Usuario no encontrado");
  assertCanSetRole(actor, target, role);
  target.role = role;
  saveStore(store);
  return sanitizeUser(target);
}

/** Registered users for the admin panel, most active first. */
export function listUsers(store, { search = "", role = "" } = {}) {
  const q = search.trim().toLowerCase();
  return Object.values(store.users)
    .filter((u) => !u.isGuest)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email || null,
      avatar: u.avatar,
      role: effectiveRole(u),
      googleLinked: Boolean(u.googleId),
      gamesPlayed: u.stats?.gamesPlayed || 0,
    }))
    .filter((u) => !role || u.role === role)
    .filter((u) => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed || (a.name || "").localeCompare(b.name || ""));
}

export function leaderboard(store, sort = "totalScore") {
  const allowed = {
    totalScore: (a, b) => b.stats.totalScore - a.stats.totalScore,
    bestScore: (a, b) => b.stats.bestScore - a.stats.bestScore,
    wins: (a, b) => b.stats.wins - a.stats.wins,
    gamesPlayed: (a, b) => b.stats.gamesPlayed - a.stats.gamesPlayed,
    bestStreak: (a, b) => b.stats.bestStreak - a.stats.bestStreak,
  };
  const cmp = allowed[sort] || allowed.totalScore;
  return Object.values(store.users)
    .filter((u) => !u.isGuest && u.stats && u.stats.gamesPlayed > 0)
    .sort(cmp)
    .map((u, i) => ({
      position: i + 1,
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      isGuest: false,
      ...u.stats,
    }));
}
