// Each round's audio preview and album cover, kept in memory once downloaded. A match asks for all of its rounds
// as soon as it starts (prefetchMedia), so when a round begins its audio, and when it is revealed its cover, are
// already here and the proxies answer at once. Only the server knows the upcoming songs: players still get each
// preview just before its round and each cover only at the reveal.

const MAX_ENTRIES = 240; // ~120 previews of ~1 MB plus their small covers
const cache = new Map(); // url -> Promise<Buffer>; Map keeps insertion order, so the first key is the oldest

export function isPreviewUrl(url) {
  return typeof url === "string" && (url.startsWith("https://audio-ssl.itunes.apple.com/") || isSpotifyPreviewUrl(url));
}

/** Spotify's own 30 s previews (MP3), which come with the public playlists pasted as a link. */
export function isSpotifyPreviewUrl(url) {
  return typeof url === "string" && url.startsWith("https://p.scdn.co/mp3-preview/");
}

export function isCoverUrl(url) {
  return typeof url === "string" && /^https:\/\/is\d+-ssl\.mzstatic\.com\//.test(url);
}

/** The cover size the reveal screen shows (iTunes serves any size from the same path). Keep in step with Game.jsx. */
export function revealCoverUrl(url) {
  return isCoverUrl(url) ? url.replace(/\/\d+x\d+bb\./, "/300x300bb.") : url;
}

// Each downloaded file's ETag, as its server gave it (quotes taken off): Completa la letra's rounds were measured on
// one version of a preview, and a preview that changed (another ETag) no longer fits them.
const etags = new Map();

/** The ETag of a file already downloaded (null when unknown). */
export function etagOf(url) {
  return etags.get(url) || null;
}

/** An ETag without its quotes or its weak mark (W/"abc" → abc). */
export const cleanEtag = (value) => (value ? String(value).replace(/^W\//, "").replace(/"/g, "") : null);

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Respuesta ${res.status}`);
  const etag = cleanEtag(res.headers?.get?.("etag"));
  if (etag) etags.set(url, etag);
  return Buffer.from(await res.arrayBuffer());
}

/** The file's bytes, downloading it only the first time. */
export function getMedia(url) {
  let entry = cache.get(url);
  if (entry) {
    cache.delete(url); // most recently used goes last
  } else {
    entry = download(url);
    entry.catch(() => cache.delete(url)); // a failed download is retried next time
  }
  cache.set(url, entry);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return entry;
}

/** Starts downloading a match's previews and reveal covers in the background. */
export function prefetchMedia(tracks) {
  const urls = new Set();
  for (const t of tracks) {
    if (isPreviewUrl(t.previewUrl)) urls.add(t.previewUrl);
    if (isCoverUrl(t.image)) urls.add(revealCoverUrl(t.image));
  }
  for (const url of urls) getMedia(url).catch(() => {});
}
