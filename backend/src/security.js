// Who may use this server from a browser, and the secret that signs sessions. Kept apart from index.js so they can
// be tested (security.test.js).

// The secrets written in the public code or in .env.example: fine on a developer's computer, never in production
// (with them anyone could sign a session or a socket token and pass for another player).
const KNOWN_SECRETS = ["trivially-dev-secret", "trivially-dev-secret-key"];
export const DEV_SECRET = KNOWN_SECRETS[0];

// Vercel's previews of this project ("trivially-<hash>-pabloecp.vercel.app", "trivially-git-<rama>-pabloecp.vercel.app"):
// the "-pabloecp" ending is the team's own, so no one else can make an address like it.
const PREVIEW_ORIGIN = /^https:\/\/trivially-[a-z0-9-]+-pabloecp\.vercel\.app$/;
// A developer's own computer, on any port.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const clean = (url) => String(url || "").trim().replace(/\/$/, "");

/**
 * The checker of a request's Origin: the site itself (`clientOrigin`), the addresses in `extra` (ALLOWED_ORIGINS,
 * comma-separated: the own domain when there is one), Vercel's previews and localhost. A request without Origin
 * (not from a web page: the server itself, a health check, a phone app) is let through; cookies and tokens still
 * decide who it is.
 */
export function originChecker(clientOrigin, extra = "") {
  const allowed = new Set([clean(clientOrigin), ...String(extra).split(",").map(clean)].filter(Boolean));
  return (origin) => !origin || allowed.has(clean(origin)) || PREVIEW_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin);
}

/** The site's own addresses, from the server's settings (CLIENT_ORIGIN, ALLOWED_ORIGINS). */
export function siteOriginChecker(env = process.env) {
  return originChecker(env.CLIENT_ORIGIN || "https://triviallyonline.vercel.app", env.ALLOWED_ORIGINS);
}

/**
 * Where a login may send the player back: `candidate` (an address, or a page's whole URL) only if it is one of our
 * own sites, else `fallback`. A login ends with a ticket in the address, so another page must never receive it.
 */
export function siteOrigin(candidate, fallback, isAllowed = siteOriginChecker()) {
  let origin;
  try {
    origin = new URL(String(candidate || "")).origin;
  } catch {
    return fallback;
  }
  return origin && origin !== "null" && isAllowed(origin) ? origin : fallback;
}

/**
 * The secret that signs sessions and socket tokens. In production (`production`) a missing one, or one of those in
 * the public code, stops the server: better down than letting players be impersonated.
 */
export function sessionSecret(env = process.env, { production }) {
  const secret = String(env.SESSION_SECRET || "").trim();
  if (production && (!secret || KNOWN_SECRETS.includes(secret))) {
    throw new Error(
      "Falta SESSION_SECRET (o es la de ejemplo). Ponla en las variables del servidor con un texto largo y secreto; sin ella el servidor no arranca."
    );
  }
  return secret || DEV_SECRET;
}
