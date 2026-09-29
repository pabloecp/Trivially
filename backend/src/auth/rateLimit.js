/**
 * Simple in-memory rate limiter for auth endpoints.
 * Limits requests by IP to prevent brute-force attacks.
 */
const hits = new Map();

const WINDOW_MS = 60_000; // 1 minute
const MAX_HITS = 10; // max requests per window

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of hits.entries()) {
    if (now - data.windowStart > WINDOW_MS * 2) hits.delete(key);
  }
}, 300_000).unref();

export function authRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();

  let entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    hits.set(ip, entry);
  }

  entry.count += 1;

  if (entry.count > MAX_HITS) {
    return res.status(429).json({
      error: "Demasiados intentos. Espera un minuto antes de volver a intentar.",
    });
  }

  next();
}
