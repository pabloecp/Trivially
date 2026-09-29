import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  return safe;
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

export function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return emptyStore();
  }
}

export function saveStore(store) {
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
    avatar: avatar || "#7B73F6",
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
    avatar: avatar || "#7B73F6",
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
  if (!guest || !user) return null;

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
