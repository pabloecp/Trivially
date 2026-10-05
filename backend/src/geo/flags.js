import { randomBytes } from "node:crypto";

// Flags of the "Banderas" questions. Players get the image from /api/geo/flag/<token>: a flagcdn.com address would
// carry the country code ("…/fr.png") and give the answer away. Each token is made when a match draws the question,
// and the images are downloaded once and kept in memory.

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const tokens = new Map();
const images = new Map();

export function flagToken(code) {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (now - entry.at > TOKEN_TTL_MS) tokens.delete(token);
  }
  const token = randomBytes(12).toString("base64url");
  tokens.set(token, { code, at: now });
  return token;
}

/** The flag (lowercase ISO code) behind a token, or null if it doesn't exist or expired. */
export function flagForToken(token) {
  const entry = tokens.get(String(token || ""));
  if (!entry || Date.now() - entry.at > TOKEN_TTL_MS) return null;
  return entry.code;
}

export function flagUrl(token) {
  return `/api/geo/flag/${token}`;
}

/** The PNG of a flag (a Buffer), downloaded the first time. */
export function getFlag(code) {
  if (!/^[a-z]{2}$/.test(code)) return Promise.reject(new Error("Bandera desconocida"));
  if (!images.has(code)) {
    const download = fetch(`https://flagcdn.com/w640/${code}.png`)
      .then((res) => {
        if (!res.ok) throw new Error(`flagcdn respondió ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => Buffer.from(data));
    // A failed download is tried again next time.
    download.catch(() => images.delete(code));
    images.set(code, download);
  }
  return images.get(code);
}

/** Downloads the flags of a match's questions as it starts, so none makes a round wait. */
export function prefetchFlags(tracks) {
  for (const t of tracks || []) {
    if (t.flag) getFlag(t.flag).catch(() => {});
  }
}
