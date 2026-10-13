// A public Spotify playlist or album read from the page Spotify serves for embedding it in other sites
// (open.spotify.com/embed/playlist/<id>, /embed/album/<id>), so anyone can paste its link without connecting a Spotify
// account. The page carries its name and cover and, for up to its first 100 songs, each one's title, artists, length
// and a short preview (15–22 s) of the song itself. It is not Spotify's official API: if they change the page, this is
// what has to follow. A private playlist (or one that doesn't exist) answers "not found".

const EMBED_URL = "https://open.spotify.com/embed/";
// Spotify serves the page to browsers; a plain server request may be turned away.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};
const NOT_FOUND = {
  playlist: "No encontramos esa playlist. Revisa que sea pública en Spotify y vuelve a pegar el link.",
  album: "No encontramos ese álbum. Revisa el link y vuelve a pegarlo.",
};
const NOT_A_LINK = "Eso no parece un link de una playlist o un álbum de Spotify";

/**
 * What was pasted, as { kind: "playlist" | "album", id }: an open.spotify.com link (with "?si=…", "/intl-es/" and so
 * on), a "spotify:playlist:…" or "spotify:album:…" address, or a playlist's bare id. A short link (spotify.link,
 * spoti.fi) is opened to see where it goes.
 */
export async function spotifyLinkFrom(input, fetchImpl = fetch) {
  const text = String(input || "").trim();
  const read = (value) => {
    const m = value.match(/(playlist|album)[/:]([A-Za-z0-9]{22})(?![A-Za-z0-9])/);
    return m ? { kind: m[1], id: m[2] } : null;
  };
  const found = read(text) || (/^[A-Za-z0-9]{22}$/.test(text) ? { kind: "playlist", id: text } : null);
  if (found) return found;
  if (/^https?:\/\/(spotify\.link|spoti\.fi)\//i.test(text)) {
    try {
      const res = await fetchImpl(text, { redirect: "follow", headers: HEADERS, signal: AbortSignal.timeout(10_000) });
      const target = read(res.url) || read(((await res.text()).match(/open\.spotify\.com\/(?:playlist|album)\/[A-Za-z0-9]{22}/) || [""])[0]);
      if (target) return target;
    } catch {
      // Falls through to the message below.
    }
  }
  throw new Error(NOT_A_LINK);
}

/**
 * The playlist or album as the room keeps it (see RoomManager.addSpotifyPlaylist), from the embed page's HTML. An
 * album's id gets "album:" in front, so it never mixes with a playlist's; its songs carry the album's name and cover.
 */
export function parseEmbedPage(html, id, kind = "playlist") {
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
  if (!entity) throw new Error(NOT_FOUND[kind] || NOT_FOUND.playlist);
  if (entity.type && entity.type !== kind) throw new Error(NOT_A_LINK);
  const album = kind === "album";
  // A playlist's cover is in coverArt; an album's, in visualIdentity (the biggest first).
  const covers = [...(entity.coverArt?.sources || []), ...(entity.visualIdentity?.image || []), ...(entity.images || [])]
    .filter((c) => c?.url)
    .sort((a, b) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0));
  const name = entity.name || entity.title || (album ? "Álbum" : "Playlist");

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
      albumName: album ? name : "",
      albumType: "",
      albumArtist: "",
      trackNumber: null,
      discNumber: 1,
      year: album ? Number(String(entity.releaseDate?.isoString || entity.releaseDate || "").slice(0, 4)) || null : null,
      durationMs: Number(t.duration) || 0,
      previewUrl: typeof t.audioPreview?.url === "string" && t.audioPreview.url.startsWith("https://") ? t.audioPreview.url : null,
    });
  }
  return {
    id: album ? `album:${entity.id || id}` : entity.id || id,
    kind,
    name,
    image: covers[0]?.url || null,
    tracks,
  };
}

/** Reads a public playlist or album ({ kind, id }). Throws a Spanish message when it is private, gone or unreadable. */
export async function readPublicSpotify({ kind = "playlist", id }, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${EMBED_URL}${kind}/${encodeURIComponent(id)}`, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("Spotify no respondió. Inténtalo otra vez.");
  }
  if (res.status === 404) throw new Error(NOT_FOUND[kind] || NOT_FOUND.playlist);
  if (!res.ok) throw new Error("Spotify no respondió. Inténtalo otra vez.");
  return parseEmbedPage(await res.text(), id, kind);
}
