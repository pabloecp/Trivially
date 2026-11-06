import { randomBytes } from "node:crypto";

// The pictures of Trivia's "Imágenes" questions (`data.image`, an https address). Like the flags (geo/flags.js),
// players get them from /api/quiz/image/<token>: the original address could name the answer ("…/titanic.jpg"). Each
// token is made when a match draws the question, and the images are downloaded once and kept in memory.

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
// Bigger pictures are refused rather than kept in memory.
const MAX_BYTES = 5 * 1024 * 1024;
// How many downloaded pictures are kept; the oldest go first.
const MAX_IMAGES = 300;
// Wikimedia (where most pictures come from) slows down or refuses clients that don't say who they are and where to
// find them (its User-Agent policy): the name of the game and its address.
const USER_AGENT = "Trivially/1.0 (https://triviallyonline.vercel.app; trivia game image proxy)";
// When Wikimedia answers "too many requests" (429) or "busy" (503): how many more times, and the longest wait.
const RETRIES = 3;
const MAX_WAIT_MS = 4000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if ((res.status === 429 || res.status === 503) && attempt < RETRIES) {
      await res.arrayBuffer().catch(() => {});
      const asked = Number(res.headers.get("retry-after")) * 1000;
      await sleep(Math.min(MAX_WAIT_MS, asked > 0 ? asked : 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`La imagen respondió ${res.status}`);
    const type = res.headers.get("content-type") || "";
    // No SVG: it can carry scripts, and it would be served from the game's own address.
    if (!/^image\/(png|jpeg|webp|gif|avif)/.test(type)) throw new Error("La dirección no es una imagen PNG, JPEG, WebP, GIF o AVIF");
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_BYTES) throw new Error("La imagen es demasiado grande");
    return { type, data };
  }
}
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
    const pending = download(url);
    // A failed download is tried again next time.
    pending.catch(() => images.delete(url));
    images.set(url, pending);
    if (images.size > MAX_IMAGES) images.delete(images.keys().next().value);
  }
  return images.get(url);
}

/**
 * Downloads the pictures of a match's questions as it starts, so none makes a round wait: one after another, never all
 * at once (Wikimedia answers "too many requests" to a burst). The first round's picture goes first.
 */
export async function prefetchImages(tracks) {
  for (const t of tracks || []) {
    if (t.image) await getImage(t.image).catch(() => {});
  }
}
