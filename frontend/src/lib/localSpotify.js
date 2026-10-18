// The Spotify playlists and albums a guest (no account) added by link, kept in this browser only: the server keeps
// them for accounts (user.savedSpotify, "Mis playlists"), never for guests. Same shape as the server's list:
// { key: "<kind>:<id>", kind, id, name, image, total, addedAt }, newest first, no repeats, at most 60.
const KEY = "trivially_spotify_saved";
const MAX = 60;

export function loadLocalSpotify() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.key === "string" && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}

function store(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Without storage (a private window) nothing is kept.
  }
  return list;
}

/** Keeps a playlist of the room ({ id: "sp:<id>" or "sp:album:<id>", name, image, total }); returns the new list. */
export function saveLocalSpotify(playlist) {
  if (!playlist?.id?.startsWith("sp:")) return loadLocalSpotify();
  const rest = playlist.id.slice(3);
  const kind = rest.startsWith("album:") ? "album" : "playlist";
  const id = kind === "album" ? rest.slice(6) : rest;
  const key = `${kind}:${id}`;
  const entry = { key, kind, id, name: playlist.name || "Playlist", image: playlist.image || null, total: playlist.total || 0, addedAt: Date.now() };
  return store([entry, ...loadLocalSpotify().filter((p) => p.key !== key)].slice(0, MAX));
}

/** Deletes one for good (by its key, "<kind>:<id>"); returns the new list. */
export function forgetLocalSpotify(key) {
  return store(loadLocalSpotify().filter((p) => p.key !== key));
}
