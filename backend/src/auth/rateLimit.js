// Limits on how often the account routes can be asked (entering, registering, recovering a password, checking a
// username), kept in memory.
//
// Who is asking: the site's requests come through Vercel (it passes /api and /auth on to this server), so the address
// this server sees is Vercel's, the same for every player; a limit by it alone would be one limit shared by everybody.
// The player's own address is the one Vercel writes down (`clientAddress`). Someone talking to this server directly
// could write any address there, so each limit has a second, much higher one by the address the server really sees.

const first = (value) => String(value || "").split(",")[0].trim();

/** The address of the player behind a request: what Vercel wrote down, else the one the server sees. */
export function clientAddress(req) {
  return first(req.headers?.["x-vercel-forwarded-for"]) || first(req.headers?.["x-forwarded-for"]) || req.ip || "unknown";
}

/**
 * A limit of `max` requests per `windowMs` for each player, and of `maxShared` for each address the server sees (Vercel's,
 * shared by everyone; or one attacker's). Past either, the request is answered with `message` and goes no further.
 */
export function rateLimit({ windowMs = 60_000, max, maxShared, message }) {
  const hits = new Map(); // key -> { windowStart, count }
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now - entry.windowStart > windowMs * 2) hits.delete(key);
  }, 300_000).unref();

  const over = (key, limit, now) => {
    let entry = hits.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { windowStart: now, count: 0 };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count > limit;
  };

  return (req, res, next) => {
    const now = Date.now();
    const tooMany = over(`c:${clientAddress(req)}`, max, now);
    const tooManyShared = over(`s:${req.ip || req.connection?.remoteAddress || "unknown"}`, maxShared, now);
    if (tooMany || tooManyShared) return res.status(429).json({ error: message });
    next();
  };
}

/** Entering, registering and recovering a password: 10 tries a minute each player. */
export const authRateLimit = rateLimit({
  max: 10,
  maxShared: 300,
  message: "Demasiados intentos. Espera un minuto antes de volver a intentar.",
});

/** Checking a username as it's typed is cheap, but could be used to list them. */
export const usernameCheckLimit = rateLimit({
  max: 60,
  maxShared: 1500,
  message: "Demasiadas comprobaciones. Espera un momento.",
});

// Wrong passwords for one account, whoever sends them and from wherever: after LOGIN_FAILS in LOGIN_FAIL_WINDOW_MS the
// account can't be entered with a password until the window passes, so guessing it takes forever.
export const LOGIN_FAILS = 10;
export const LOGIN_FAIL_WINDOW_MS = 10 * 60 * 1000;
const fails = new Map(); // identifier -> { start, count }

const failKey = (identifier) => String(identifier || "").trim().toLowerCase().replace(/^@/, "");

/** Whether this account (by the email or username typed) has had too many wrong passwords lately. */
export function loginLocked(identifier, now = Date.now()) {
  const entry = fails.get(failKey(identifier));
  if (!entry) return false;
  if (now - entry.start > LOGIN_FAIL_WINDOW_MS) {
    fails.delete(failKey(identifier));
    return false;
  }
  return entry.count >= LOGIN_FAILS;
}

/** A wrong password for this account. */
export function loginFailed(identifier, now = Date.now()) {
  const key = failKey(identifier);
  const entry = fails.get(key);
  if (!entry || now - entry.start > LOGIN_FAIL_WINDOW_MS) fails.set(key, { start: now, count: 1 });
  else entry.count += 1;
  // Typed names that were never accounts would pile up: the old ones go when the list gets long.
  if (fails.size > 5000) for (const [k, e] of fails) if (now - e.start > LOGIN_FAIL_WINDOW_MS) fails.delete(k);
}

/** The account was entered: its count starts again. */
export function loginSucceeded(identifier) {
  fails.delete(failKey(identifier));
}
