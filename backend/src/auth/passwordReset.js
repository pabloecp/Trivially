import crypto from "node:crypto";

// "¿Olvidaste tu contraseña?": a link by email to choose a new one. Each link carries a random token that works once
// and for RESET_TTL_MS. Only its hash is kept, in memory: a restart of the server (or a newer link for the same
// account) makes the old ones stop working, which is fine for a link that lasts half an hour.

export const RESET_TTL_MS = 30 * 60 * 1000;
// One email per account every so often, so the form can't be used to flood someone's inbox.
export const RESET_EMAIL_GAP_MS = 2 * 60 * 1000;

const pending = new Map(); // hash → { userId, exp }
const lastSent = new Map(); // userId → when its last link was sent

const hashOf = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

/** The account (not a guest) with this email, or null. */
export function accountByEmail(store, email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return null;
  return Object.values(store.users).find((u) => !u.isGuest && u.email && u.email.toLowerCase() === clean) || null;
}

/**
 * A new reset token for this account (any older one stops working), or null if one was sent too recently.
 */
export function createResetToken(userId, now = Date.now()) {
  if (now - (lastSent.get(userId) || 0) < RESET_EMAIL_GAP_MS) return null;
  for (const [hash, entry] of pending) {
    if (entry.userId === userId || entry.exp < now) pending.delete(hash);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  pending.set(hashOf(token), { userId, exp: now + RESET_TTL_MS });
  lastSent.set(userId, now);
  return token;
}

/** The account a token belongs to, using it up; null if it doesn't exist, was used or expired. */
export function consumeResetToken(token, now = Date.now()) {
  if (typeof token !== "string" || token.length < 20) return null;
  const hash = hashOf(token);
  const entry = pending.get(hash);
  if (!entry) return null;
  pending.delete(hash);
  return entry.exp >= now ? entry.userId : null;
}

/** Whether a token is still good, without using it (the page asks before showing the form). */
export function resetTokenValid(token, now = Date.now()) {
  if (typeof token !== "string") return false;
  const entry = pending.get(hashOf(token));
  return Boolean(entry && entry.exp >= now);
}

/** For the tests. */
export function clearResetTokens() {
  pending.clear();
  lastSent.clear();
}
