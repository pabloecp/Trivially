// Accounts have two names, like on Twitter: the name for the games ("Pepe", `user.name`: anything, as often as you
// like, never unique) and the username ("@pepe_23", `user.username`): the one people find you by, unique, and it can
// only change a few times a month. The usernames of an account are looked up here; nothing in this file saves.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_CHANGES = 3; // changes allowed in each window
export const USERNAME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// A username someone left is kept for them this long, so nobody can take it to pass themselves off as them.
export const USERNAME_RESERVE_MS = 30 * 24 * 60 * 60 * 1000;

const FORMAT = /^[a-z0-9_]+$/;
const RESERVED = new Set([
  "admin", "administrador", "administrator", "trivially", "playtrivially", "soporte", "support", "ayuda", "help",
  "moderador", "moderator", "mod", "owner", "root", "sistema", "system", "staff", "equipo", "team", "oficial",
  "official", "invitado", "guest", "usuario", "user", "null", "undefined", "api", "www",
]);

/** What was typed as a username, in its stored form: no "@" in front, lower case, no spaces around. */
export const normalizeUsername = (input) => String(input ?? "").trim().replace(/^@+/, "").toLowerCase();

/** Why this can't be a username (in Spanish), or null when its format is fine. */
export function usernameFormatError(input) {
  const name = normalizeUsername(input);
  if (name.length < USERNAME_MIN) return `El usuario debe tener al menos ${USERNAME_MIN} caracteres`;
  if (name.length > USERNAME_MAX) return `El usuario no puede superar ${USERNAME_MAX} caracteres`;
  if (!FORMAT.test(name)) return "Usa solo letras sin tilde, números y guion bajo (_)";
  if (!/[a-z]/.test(name)) return "El usuario debe tener al menos una letra";
  if (RESERVED.has(name)) return "Ese usuario no está disponible";
  return null;
}

/** A registered account (guests aren't kept: no username, no friends). */
export const isAccount = (u) => Boolean(u) && !u.isGuest;

/** The account with this username, or null. */
export function findByUsername(store, input) {
  const name = normalizeUsername(input);
  if (!name) return null;
  return Object.values(store.users).find((u) => isAccount(u) && u.username === name) || null;
}

/** Someone else holds this username, or left it less than USERNAME_RESERVE_MS ago. `exceptId`: the asker. */
export function usernameTaken(store, input, exceptId = null, now = Date.now()) {
  const name = normalizeUsername(input);
  return Object.values(store.users).some(
    (u) =>
      isAccount(u) &&
      u.id !== exceptId &&
      (u.username === name || (u.usernameHistory || []).some((h) => h.username === name && now - h.at < USERNAME_RESERVE_MS))
  );
}

/** Why this username can't be taken by `exceptId` (in Spanish), or null when it is free. */
export function usernameError(store, input, exceptId = null, now = Date.now()) {
  return usernameFormatError(input) || (usernameTaken(store, input, exceptId, now) ? "Ese usuario ya está en uso" : null);
}

/** A free username made from a name ("María José!" → "maria_jose", then "maria_jose2", ...). */
export function suggestUsername(store, name, exceptId = null) {
  let base = String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!/[a-z]/.test(base)) base = `jugador${base}`;
  base = base.slice(0, USERNAME_MAX - 4);
  while (base.length < USERNAME_MIN) base += "0";
  let candidate = base;
  for (let n = 2; usernameError(store, candidate, exceptId); n += 1) candidate = `${base}${n}`;
  return candidate;
}

/** The changes the account still has in the window, and when the next one opens up if none are left. */
export function usernameStatus(user, now = Date.now()) {
  const recent = (user?.usernameChanges || []).filter((t) => now - t < USERNAME_WINDOW_MS).sort((a, b) => a - b);
  const free = Boolean(user?.usernameAuto); // an assigned username can be changed once, for free
  const left = Math.max(0, USERNAME_CHANGES - recent.length);
  return {
    username: user?.username || null,
    free,
    changesLeft: free ? Math.max(1, left) : left,
    nextChangeAt: !free && left === 0 ? recent[0] + USERNAME_WINDOW_MS : null,
  };
}

/** Gives an account a username made from its name, when it has none (migration, and Google's first sign-in). */
export function assignUsername(store, user) {
  if (user.username) return false;
  user.username = suggestUsername(store, user.name, user.id);
  user.usernameAuto = true;
  return true;
}

/**
 * Changes an account's username. Throws (in Spanish) when it is not valid, taken, or the account has no changes left.
 * The old one is kept as the account's history, which reserves it for a while.
 */
export function changeUsername(store, user, input, now = Date.now()) {
  const name = normalizeUsername(input);
  if (!isAccount(user)) throw new Error("Solo las cuentas tienen usuario");
  if (name === user.username) throw new Error("Ese ya es tu usuario");
  const error = usernameError(store, name, user.id, now);
  if (error) throw new Error(error);
  const status = usernameStatus(user, now);
  if (!status.changesLeft) {
    const when = new Date(status.nextChangeAt).toLocaleDateString("es", { day: "numeric", month: "long" });
    throw new Error(`Ya cambiaste tu usuario ${USERNAME_CHANGES} veces este mes. Podrás cambiarlo otra vez el ${when}.`);
  }
  if (user.username) user.usernameHistory = [...(user.usernameHistory || []).filter((h) => now - h.at < USERNAME_RESERVE_MS), { username: user.username, at: now }];
  // The first change of an assigned username is free; the others count.
  if (user.usernameAuto) user.usernameAuto = false;
  else user.usernameChanges = [...(user.usernameChanges || []).filter((t) => now - t < USERNAME_WINDOW_MS), now];
  user.username = name;
  return user;
}

/** Accounts whose username starts with `query` (or has it inside), best matches first. Never includes `exceptId`. */
export function searchUsernames(store, query, { limit = 8, exceptId = null } = {}) {
  const q = normalizeUsername(query);
  if (q.length < USERNAME_MIN) return [];
  return Object.values(store.users)
    .filter((u) => isAccount(u) && u.username && u.id !== exceptId && u.username.includes(q))
    .sort((a, b) => Number(b.username === q) - Number(a.username === q) || Number(b.username.startsWith(q)) - Number(a.username.startsWith(q)) || a.username.length - b.username.length || a.username.localeCompare(b.username))
    .slice(0, limit);
}
