// Short name of a catalog playlist: "Most Streamed Songs on Spotify · Español" shows as "Top 100 Español".
// Spotify playlists the host added keep their own name.
export function playlistLabel(playlist) {
  const name = playlist?.name || "";
  if (!name.includes(" · ")) return name;
  return `Top ${playlist.trackCount || 100} ${name.split(" · ").pop()}`;
}
