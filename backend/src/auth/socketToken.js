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
