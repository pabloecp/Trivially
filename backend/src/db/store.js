import { applyDaily, dailyView } from "../game/daily.js";
import { applyRank, rankDeltas } from "../game/rank.js";
import { hasLink, NAME_LINK_ERROR } from "../moderation/links.js";
import { assignUsername, changeUsername, normalizeUsername, usernameError, usernameStatus } from "../auth/username.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { effectiveRole } from "../auth/roles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const MAX_NAME_LENGTH = 24;
export const DEFAULT_AVATAR = "#FF2D55";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// The Blob's colours on the profile (frontend lib/blobColors.js): white for everyone and, for accounts, the colours of
// the games (Trivia, Canción, Mundo, Lluvia, Rango, Farsante, Minas). Older avatar colours still saved show as white.
export const BLOB_WHITE = "#FFFFFF";
export const BLOB_ACCOUNT = ["#2F6BFF", "#FF2FC0", "#00D1C1", "#00A2FF", "#FF5A1F", "#1FD24A", "#A63DFF"];
// The account colours the Blob had before (celeste, rosa, menta; then amarillo and naranja): saved ones count as their
// new colour. The owners' gold is gone: saved, it shows white.
const BLOB_RENAMED = { "#8FD3FF": "#2F6BFF", "#FFA6D2": "#FF2FC0", "#8EF0B0": "#00D1C1", "#FFD60A": "#FF5A1F", "#FF8A00": "#FF5A1F" };
const blobId = (color) => {
  const id = String(color || "").toUpperCase();
  return BLOB_RENAMED[id] || id;
};

// Why `user` can't use the Blob colour `color`, or null when it can. Anything that isn't one of the Blob's colours (an
// old colour, a Google photo) is drawn white, so it gives nothing away.
function blobColorError(user, color) {
  const id = blobId(color);
  if (BLOB_ACCOUNT.includes(id)) return user && !user.isGuest ? null : "Crea una cuenta para usar ese color";
  return null;
}

/**
 * The colour a player shows in rooms and groups: always the one saved on their account (never what their browser
 * sends), and white if they can't use it (a guest).
 */
export function playerAvatar(user) {
  if (!user?.avatar || blobColorError(user, user.avatar)) return BLOB_WHITE;
  // An old account colour as its new one; anything else as it was saved.
  return BLOB_RENAMED[String(user.avatar).toUpperCase()] || user.avatar;
}

function emptyStore() {
  return { users: {} };
}

// The Spotify link keeps its tokens on the server; clients only ever see who the account is.
function publicSpotify(spotify) {
  return spotify ? { id: spotify.id, displayName: spotify.displayName, url: spotify.url, connectedAt: spotify.connectedAt } : null;
}

/** Remove password fields — for the owner or internal use */
export function sanitizeUser(user) {
  if (!user) return null;
  // The username's history (which reserves old ones) and change dates stay on the server; the account sees the count.
  const { passwordHash, passwordSalt, spotify, usernameHistory, usernameChanges, usernameAuto, friendCode, together, ...safe } = user;
  return {
    ...safe,
    // The account's own: each match with what it answered (its "Ver respuestas").
    history: publicHistory(user.history, { answers: true }),
    // Today's challenge with its progress, and how many the account has completed (game/daily.js).
    daily: dailyView(user),
    spotify: publicSpotify(spotify),
    role: effectiveRole(user),
    ...(user.isGuest ? {} : { usernameInfo: usernameStatus(user) }),
  };
}

/**
 * A match history as it goes out: how many questions each match had, never the
 * room. Only to the account itself (`answers`), its rounds too, as its match summary shows them (prompt, right answer,
 * what it answered, points), without the questions' ids, which stay on the server.
 */
function publicHistory(history = [], { answers = false } = {}) {
  // `reported` is left out: older matches may still carry it from the "Reportar partida" that is gone.
  return history.map(({ rounds, room, reported, ...match }) => ({
    ...match,
    questions: (rounds || []).length,
    ...(answers ? { rounds: (rounds || []).map(({ questionId, ...round }) => round) } : {}),
  }));
}

/** Public profile — only safe fields for other users to see */
export function sanitizeUserPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.isGuest ? null : user.username || null,
    avatar: user.avatar,
    isGuest: Boolean(user.isGuest),
    stats: user.stats || {},
    // Competitivo's rank (game/rank.js), null before the first competitive match.
    rank: user.rank || null,
    // The elo of each game ({ rating, games, best }), from the public matches.
    elo: user.elo || {},
    // How many daily challenges the account has completed.
    dailyDone: user.dailyDone || 0,
    // The last matches, like the stats: shown on the profile.
    history: publicHistory(user.history),
    googleLinked: Boolean(user.googleId),
    spotifyLinked: Boolean(user.spotify),
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

// Test scripts (*.test.js) never touch Supabase, even when its variables are set: they only use fake users.
const RUNNING_TEST = /\.test\.js$/.test(process.argv[1] || "");

export function supabaseEnabled() {
  return !RUNNING_TEST && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabase() {
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

/** A fresh account id that no other user has. Ids are permanent: profiles, roles and stats hang off them. */
export function newUserId(store) {
  let id;
  do {
    id = `usr_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  } while (store.users[id]);
  return id;
}

function validateName(name) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("El nombre no puede estar vacío");
  if (clean.length > MAX_NAME_LENGTH) throw new Error(`El nombre no puede superar ${MAX_NAME_LENGTH} caracteres`);
  if (hasLink(clean)) throw new Error(NAME_LINK_ERROR);
  return clean;
}

export function upsertUser(store, user) {
  const current = store.users[user.id] || {
    id: user.id,
    name: user.name,
    avatar: DEFAULT_AVATAR,
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
  // The colour comes from the browser here, so one it can't use (gold for a guest) is left out.
  if (user.avatar && !blobColorError(current, user.avatar)) current.avatar = user.avatar;
  if (user.email) current.email = user.email;
  if (user.isGuest !== undefined) current.isGuest = user.isGuest;
  if (user.passwordHash) current.passwordHash = user.passwordHash;
  if (user.passwordSalt) current.passwordSalt = user.passwordSalt;
  if (user.googleId) current.googleId = user.googleId;
  store.users[user.id] = current;
  saveStore(store);
  return current;
}

export function registerWithPassword(store, { name, username, email, password, avatar, guestId }) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanName = validateName(name);
  const cleanUsername = normalizeUsername(username);
  const usernameProblem = usernameError(store, cleanUsername);
  if (usernameProblem) throw new Error(usernameProblem);
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
  const userId = newUserId(store);
  const user = upsertUser(store, {
    id: userId,
    name: cleanName,
    email: cleanEmail,
    avatar: avatar || DEFAULT_AVATAR,
    isGuest: false,
    passwordHash: hash,
    passwordSalt: salt,
  });
  store.users[user.id].username = cleanUsername;
  saveStore(store);

  if (guestId) {
    claimGuestStats(store, user.id, guestId);
  }

  return sanitizeUser(store.users[user.id]);
}

export function loginWithPassword(store, { identifier, password, guestId }) {
  if (!identifier || !identifier.trim()) throw new Error("Introduce tu correo o usuario");
  if (!password) throw new Error("Introduce tu contraseña");
  const clean = identifier.trim().toLowerCase();
  const asUsername = normalizeUsername(clean);

  // By email or by @username (names for the games aren't unique, so they can't identify anyone).
  const user = Object.values(store.users).find(
    (u) => !u.isGuest && ((u.email && u.email.toLowerCase() === clean) || (u.username && u.username === asUsername))
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
    // The Google photo becomes the avatar the first time; after that it only refreshes it if the player is
    // still using the photo (a color they picked is kept).
    const usingPhoto = !existing.googleId || !HEX_COLOR.test(existing.avatar || "");
    existing.googleId = googleId;
    if (avatar) {
      existing.googlePhoto = avatar;
      if (usingPhoto) existing.avatar = avatar;
    }
    if (!existing.name) existing.name = name;
    existing.isGuest = false;
    assignUsername(store, existing);
    store.users[existing.id] = existing;
    saveStore(store);
    if (guestId && guestId !== existing.id) {
      claimGuestStats(store, existing.id, guestId);
    }
    return sanitizeUser(store.users[existing.id]);
  }

  const userId = id && !store.users[id] ? id : newUserId(store);
  const newUser = upsertUser(store, {
    id: userId,
    name: name || "Jugador Google",
    email: cleanEmail,
    avatar: avatar || DEFAULT_AVATAR,
    isGuest: false,
    googleId,
  });
  if (avatar) store.users[newUser.id].googlePhoto = avatar;
  // A first sign-in with Google gets a username made from its name.
  assignUsername(store, store.users[newUser.id]);
  saveStore(store);

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
  if (conflict) throw new Error("Esta cuenta de Google ya está vinculada a otro usuario de Trivially");

  user.googleId = googleId;
  if (email && !user.email) user.email = email.trim().toLowerCase();
  if (avatar) {
    user.avatar = avatar;
    user.googlePhoto = avatar;
  }
  store.users[userId] = user;
  saveStore(store);
  return sanitizeUser(user);
}

/** Saves a Spotify link (profile + tokens) on the account. One Spotify account per Trivially account. */
export function linkSpotify(store, userId, spotify) {
  const user = store.users[userId];
  if (!user || user.isGuest) throw new Error("Usuario no encontrado");
  const conflict = Object.values(store.users).find((u) => u.spotify?.id === spotify.id && u.id !== userId);
  if (conflict) throw new Error("Esta cuenta de Spotify ya está conectada a otro usuario");
  user.spotify = spotify;
  saveStore(store);
  return sanitizeUser(user);
}

export function unlinkSpotify(store, userId) {
  const user = store.users[userId];
  if (!user) throw new Error("Usuario no encontrado");
  delete user.spotify;
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
  delete user.googlePhoto;
  if (!HEX_COLOR.test(user.avatar || "")) user.avatar = DEFAULT_AVATAR;
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

/** Removes a guest record (no-op for registered accounts). Guests are only kept while they are signed in. */
export function deleteGuest(store, userId) {
  const user = store.users[userId];
  if (!user?.isGuest) return false;
  delete store.users[userId];
  saveStore(store);
  return true;
}

/** Sets the avatar to a color ("#rrggbb") or, with "google", to the player's Google photo. */
export function updateUserAvatar(store, userId, choice) {
  const user = store.users[userId];
  if (!user) throw new Error("Usuario no encontrado");
  if (choice === "google") {
    const photo = user.googlePhoto || (user.googleId && !HEX_COLOR.test(user.avatar || "") ? user.avatar : null);
    if (!photo) throw new Error("Inicia sesión con Google para usar tu foto de perfil");
    user.avatar = photo;
  } else {
    const color = blobId(choice);
    if (color !== BLOB_WHITE && !BLOB_ACCOUNT.includes(color)) throw new Error("Color no válido");
    const problem = blobColorError(user, color);
    if (problem) throw new Error(problem);
    user.avatar = color;
  }
  saveStore(store);
  return sanitizeUser(user);
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

// How many matches each account keeps in its history (the profile's "Historial"), newest first.
export const MATCH_HISTORY_LIMIT = 10;

/**
 * A finished match: adds it to every registered player's stats and at the front of their match history
 * (`user.history`): which game, when, the place they finished in, how many played, their points, who they played
 * against, the room and their rounds (each question with its answer, for "Reportar partida": reportHistoryMatch).
 * `players` come in final position (a tiebreak's winner first); `game` is the game's id ("playlist" for a playlist).
 * `public` is a public match (for "Reto del día"). `rank` ({ rounds, winnerId, discount }) only for a Competitivo match: each account's rank points move by its place
 * (game/rank.js), and the history entry keeps how many (`rank`).
 */
export function applyMatchStats(store, players, { game = null, at = new Date().toISOString(), room = null, rank = null, public: isPublic = false } = {}) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const order = players.map((p) => p.id);
  const deltas = rank ? rankDeltas(players, rank) : null;
  // Rivals that no longer count (game/elo.js TOGETHER_LIMIT) take their share off an account's points.
  if (deltas && rank.discount) for (const [id, share] of rank.discount) deltas.set(id, Math.round((deltas.get(id) || 0) * share));
  const [first, second] = players;
  const soleWinner = first && second && (first.score > second.score || first.id === rank?.winnerId) ? first.id : null;
  players.forEach((player, index) => {
    if (player.isGuest || player.id?.startsWith("gst_")) return;
    const user = store.users[player.id];
    if (!user || user.isGuest) return;
    if (deltas) applyRank(user, deltas.get(player.id) || 0, player.id === soleWinner);
    const entry = {
      at,
      game,
      position: index + 1,
      players: order.length,
      score: player.score,
      opponents: players.filter((p) => p.id !== player.id).slice(0, 7).map((p) => p.name),
      room,
      rounds: (player.rounds || []).map((r) => ({ ...r })),
      ...(deltas ? { rank: deltas.get(player.id) || 0 } : {}),
    };
    user.history = [entry, ...(user.history || [])].slice(0, MATCH_HISTORY_LIMIT);
    // The day's challenge moves with every match (game/daily.js).
    applyDaily(user, { game, public: isPublic, position: index + 1, players: order.length, score: player.score || 0, correct: player.correct || 0, bestStreak: player.bestStreak || 0 });
  });
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

// Spotify playlists and albums an account added with their link (the "Agregar de Spotify" box of Adivina la canción),
// kept on the account so they can be added again with one tap from any room ("Mis playlists"). Newest first, at most
// MAX_SAVED_SPOTIFY. Guests keep nothing: they have no account to keep it on.
const MAX_SAVED_SPOTIFY = 60;
const SPOTIFY_KINDS = ["playlist", "album"];

function savableAccount(store, userId) {
  const user = store.users[userId];
  return user && !user.isGuest ? user : null;
}

/** The account's saved Spotify playlists and albums ([] for a guest or nobody). */
export function savedSpotifyLinks(store, userId) {
  return savableAccount(store, userId)?.savedSpotify || [];
}

/** Keeps a playlist or album on the account (moved to the top if it was there). Returns the list, or null for a guest. */
export function saveSpotifyLink(store, userId, { kind, id, name, image = null, total = 0 }) {
  const user = savableAccount(store, userId);
  if (!user || !SPOTIFY_KINDS.includes(kind) || !/^[A-Za-z0-9]{22}$/.test(String(id))) return null;
  const key = `${kind}:${id}`;
  const item = { key, kind, id, name: String(name || "").slice(0, 120) || "Playlist", image, total: Number(total) || 0, addedAt: new Date().toISOString() };
  user.savedSpotify = [item, ...(user.savedSpotify || []).filter((s) => s.key !== key)].slice(0, MAX_SAVED_SPOTIFY);
  saveStore(store);
  return user.savedSpotify;
}

/** Deletes one for good from the account. Returns the list left. */
export function forgetSpotifyLink(store, userId, key) {
  const user = savableAccount(store, userId);
  if (!user) throw new Error("Necesitas una cuenta para guardar playlists");
  user.savedSpotify = (user.savedSpotify || []).filter((s) => s.key !== key);
  saveStore(store);
  return user.savedSpotify;
}

/** Gives every account without a username one made from its name (at boot). Returns how many it assigned. */
export function ensureUsernames(store) {
  let assigned = 0;
  for (const user of Object.values(store.users)) {
    if (!user.isGuest && assignUsername(store, user)) assigned += 1;
  }
  if (assigned) saveStore(store);
  return assigned;
}

/** An account changes its username (see auth/username.js for the rules). */
export function updateUsername(store, userId, username) {
  const user = store.users[userId];
  if (!user) throw new Error("Usuario no encontrado");
  changeUsername(store, user, username);
  saveStore(store);
  return sanitizeUser(user);
}
