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

/** Returns the payload of a correctly signed, unexpired token, otherwise null. */
function readToken(token, now) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.uid || typeof data.exp !== "number" || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}

/** Returns the user id inside a valid, unexpired token, otherwise null. */
export function verifySocketToken(token, now = Date.now()) {
  return readToken(token, now)?.uid || null;
}

// Some phone browsers (Safari with tracking protection, in-app browsers) don't keep our session cookie, so every
// login also hands the browser this long-lived token. The site sends it back as `Authorization: Bearer …` and the
// server treats it like the cookie (see index.js).
const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createAuthToken(userId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, kind: "auth", exp: now + AUTH_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id of a valid session token (never a socket token or a ticket), otherwise null. */
export function verifyAuthToken(token, now = Date.now()) {
  const data = readToken(token, now);
  return data?.kind === "auth" ? data.uid : null;
}
