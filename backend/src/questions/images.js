import { randomBytes } from "node:crypto";

// The pictures of Trivia's "Imágenes" questions (`data.image`, an https address). Like the flags (geo/flags.js),
// players get them from /api/quiz/image/<token>: the original address could name the answer ("…/titanic.jpg"). Each
// token is made when a match draws the question, and the images are downloaded once and kept in memory.

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
// Bigger pictures are refused rather than kept in memory.
const MAX_BYTES = 5 * 1024 * 1024;
// How many downloaded pictures are kept; the oldest go first.
const MAX_IMAGES = 300;
// Wikimedia (where most pictures come from) refuses requests without a User-Agent of their own.
const USER_AGENT = "Trivially/1.0 (trivia game image proxy)";
const tokens = new Map();
const images = new Map();

export function imageToken(url) {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (now - entry.at > TOKEN_TTL_MS) tokens.delete(token);
  }
  const token = randomBytes(12).toString("base64url");
  tokens.set(token, { url, at: now });
  return token;
}

/** The picture's address behind a token, or null if it doesn't exist or expired. */
export function imageForToken(token) {
  const entry = tokens.get(String(token || ""));
  if (!entry || Date.now() - entry.at > TOKEN_TTL_MS) return null;
  return entry.url;
}

export function imageUrl(token) {
  return `/api/quiz/image/${token}`;
}

/** A question's picture ({ type, data: Buffer }), downloaded the first time. */
export function getImage(url) {
  if (!/^https:\/\//.test(url || "")) return Promise.reject(new Error("Imagen desconocida"));
  if (!images.has(url)) {
    const download = fetch(url, { headers: { "User-Agent": USER_AGENT } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`La imagen respondió ${res.status}`);
        const type = res.headers.get("content-type") || "";
        // No SVG: it can carry scripts, and it would be served from the game's own address.
        if (!/^image\/(png|jpeg|webp|gif|avif)/.test(type)) throw new Error("La dirección no es una imagen PNG, JPEG, WebP, GIF o AVIF");
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > MAX_BYTES) throw new Error("La imagen es demasiado grande");
        return { type, data };
      });
    // A failed download is tried again next time.
    download.catch(() => images.delete(url));
    images.set(url, download);
    if (images.size > MAX_IMAGES) images.delete(images.keys().next().value);
  }
  return images.get(url);
}

/** Downloads the pictures of a match's questions as it starts, so none makes a round wait. */
export function prefetchImages(tracks) {
  for (const t of tracks || []) {
    if (t.image) getImage(t.image).catch(() => {});
  }
}
