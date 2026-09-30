import crypto from "node:crypto";

// The socket connects straight to the backend (Railway) while the HTTP API goes through Vercel, so the socket
// never sees the session cookie. Instead the browser asks the API for a short-lived signed token that says who
// it is, and hands it to Socket.IO when connecting. Players can only act as the account the token names.

const TTL_MS = 12 * 60 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || "yoavlly-dev-secret";
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSocketToken(userId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Short-lived, single-use tickets that carry a user id across the Google round trip, from whichever domain the
// callback landed on to the site's own domain (see /auth/google/finish), or into a "link Google" flow.
const usedTickets = new Map(); // nonce -> expiry

export function createTicket(userId, kind, ttlMs = 2 * 60 * 1000, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, kind, exp: now + ttlMs, n: crypto.randomBytes(9).toString("base64url") })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id of a valid ticket of this kind and burns it, otherwise null. */
export function consumeTicket(ticket, kind, now = Date.now()) {
  if (typeof ticket !== "string") return null;
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (data.kind !== kind || !data.uid || typeof data.exp !== "number" || data.exp < now) return null;
  for (const [n, exp] of usedTickets) if (exp < now) usedTickets.delete(n);
  if (usedTickets.has(data.n)) return null;
  usedTickets.set(data.n, data.exp);
  return data.uid;
}

/** Returns the user id inside a valid, unexpired token, otherwise null. */
export function verifySocketToken(token, now = Date.now()) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!uid || typeof exp !== "number" || exp < now) return null;
    return uid;
  } catch {
    return null;
  }
}
