// A public Spotify playlist read from the page Spotify serves for embedding it in other sites
// (open.spotify.com/embed/playlist/<id>), so anyone can paste a playlist's link without connecting a Spotify account.
// The page carries the playlist's name and cover and, for up to its first 100 songs, each one's title, artists,
// length and a 30 s preview of the song itself. It is not Spotify's official API: if they change the page, this is
// what has to follow. A private playlist (or one that doesn't exist) answers "not found".

const EMBED_URL = "https://open.spotify.com/embed/playlist/";
// Spotify serves the page to browsers; a plain server request may be turned away.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};
const PRIVATE_MESSAGE = "No encontramos esa playlist. Revisa que sea pública en Spotify y vuelve a pegar el link.";

/**
 * The playlist id of what was pasted: an open.spotify.com link (with "?si=…", "/intl-es/" and so on), a
 * "spotify:playlist:…" address or the bare id. A short link (spotify.link, spoti.fi) is opened to see where it goes.
 */
export async function playlistIdFromLink(input, fetchImpl = fetch) {
  const text = String(input || "").trim();
  const found = text.match(/playlist[/:]([A-Za-z0-9]{22})(?![A-Za-z0-9])/) || text.match(/^([A-Za-z0-9]{22})$/);
  if (found) return found[1];
  if (/^https?:\/\/(spotify\.link|spoti\.fi)\//i.test(text)) {
    try {
      const res = await fetchImpl(text, { redirect: "follow", headers: HEADERS, signal: AbortSignal.timeout(10_000) });
      const target = res.url.match(/playlist\/([A-Za-z0-9]{22})/) || (await res.text()).match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]{22})/);
      if (target) return target[1];
    } catch {
      // Falls through to the message below.
    }
  }
  throw new Error("Eso no parece un link de una playlist de Spotify");
}

/** The playlist as the room keeps it (see RoomManager.addSpotifyPlaylist), from the embed page's HTML. */
export function parseEmbedPage(html, playlistId) {
  const json = String(html || "").match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!json) throw new Error("No se pudo leer esa playlist de Spotify. Inténtalo otra vez.");
  let data;
  try {
    data = JSON.parse(json[1]);
  } catch {
    throw new Error("No se pudo leer esa playlist de Spotify. Inténtalo otra vez.");
  }
  const props = data?.props?.pageProps || {};
  const entity = props.state?.data?.entity;
  if (!entity) throw new Error(PRIVATE_MESSAGE);
  if (entity.type && entity.type !== "playlist") throw new Error("Eso no parece un link de una playlist de Spotify");

  const tracks = [];
  for (const t of entity.trackList || []) {
    const spotifyId = String(t?.uri || "").match(/^spotify:track:([A-Za-z0-9]+)$/)?.[1];
    if (!spotifyId || !t.title || t.entityType === "episode") continue;
    if (tracks.some((x) => x.spotifyId === spotifyId)) continue;
    tracks.push({
      spotifyId,
      title: t.title,
      // "Becky G, NATTI NATASHA" → ["Becky G", "NATTI NATASHA"]
      artists: String(t.subtitle || "")
        .split(/,[\s ]*/)
        .map((a) => a.trim())
        .filter(Boolean),
      albumId: null,
      albumName: "",
      albumType: "",
      albumArtist: "",
      trackNumber: null,
      discNumber: 1,
      year: null,
      durationMs: Number(t.duration) || 0,
      previewUrl: typeof t.audioPreview?.url === "string" && t.audioPreview.url.startsWith("https://") ? t.audioPreview.url : null,
    });
  }
  const covers = entity.coverArt?.sources || entity.images || [];
  return {
    id: entity.id || playlistId,
    name: entity.name || entity.title || "Playlist",
    image: covers.find((c) => c?.url)?.url || null,
    tracks,
  };
}

/** Reads a public playlist by its id. Throws a Spanish message when it is private, gone or can't be read. */
export async function readPublicPlaylist(playlistId, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${EMBED_URL}${encodeURIComponent(playlistId)}`, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("Spotify no respondió. Inténtalo otra vez.");
  }
  if (res.status === 404) throw new Error(PRIVATE_MESSAGE);
  if (!res.ok) throw new Error("Spotify no respondió. Inténtalo otra vez.");
  return parseEmbedPage(await res.text(), playlistId);
}
