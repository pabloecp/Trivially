// Songs a match can draw from: every song in the chosen playlists, or in the default playlist when none of the
// chosen ids exists (e.g. an old room config).
export function selectSongs(catalog, { playlistIds = [] } = {}) {
  const chosen = catalog.playlists.filter((p) => playlistIds.includes(p.id));
  const lists = chosen.length ? chosen : catalog.playlists.filter((p) => p.isDefault);
  if (!lists.length) return [...catalog.songs];
  const ids = new Set(lists.flatMap((p) => p.trackIds));
  return catalog.songs.filter((s) => ids.has(s.id));
}

export function pickRoundTracks(catalog, filters, rounds) {
  const pool = selectSongs(catalog, filters);
  if (!pool.length) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked = [];
  for (let i = 0; i < rounds; i += 1) {
    picked.push(shuffled[i % shuffled.length]);
  }
  return picked;
}
