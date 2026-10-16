// The Spotify playlists every room offers in Adivina la canción's "Tus playlists", for everyone, without adding them:
// they can't be deleted, and each time one is ticked it is read again from Spotify (its public page, like a pasted
// link), so the songs Spotify changed are the ones that play. Same list as the frontend's (modes/music/MusicSettings.jsx).
export const DEFAULT_SPOTIFY = [{ kind: "playlist", id: "37i9dQZEVXbMDoHDwVN2tF", name: "Top 50: Global" }];

/** Whether a link's target ({ kind, id }) or a room playlist's id ("sp:<id>") is one of the default playlists. */
export function isDefaultSpotify(target) {
  if (typeof target === "string") return DEFAULT_SPOTIFY.some((p) => target === `sp:${p.kind === "album" ? `album:${p.id}` : p.id}`);
  return DEFAULT_SPOTIFY.some((p) => p.kind === (target?.kind || "playlist") && p.id === target?.id);
}
