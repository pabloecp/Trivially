export function selectSongs(catalog, filters = {}) {
  const {
    enabledCategories = [],
    artistIds = [],
    genreIds = [],
    albumIds = [],
    playlistIds = [],
    yearFrom,
    yearTo,
  } = filters;

  const active = new Set(enabledCategories);
  let songs = [...catalog.songs];

  const useArtists = active.has("artist") || active.has("artistSongs");
  const useGenres = active.has("genre");
  const useAlbums = active.has("album");
  const useYear = active.has("year") && (yearFrom || yearTo);
  const usePlaylists = active.has("playlist");

  if (useGenres) {
    songs = songs.filter((s) => s.genreIds?.some((g) => genreIds.includes(g)));
  }

  if (useArtists) {
    songs = songs.filter(
      (s) => artistIds.includes(s.artistId) || s.featuredArtistIds?.some((id) => artistIds.includes(id))
    );
  }

  if (useAlbums) {
    songs = songs.filter((s) => albumIds.includes(s.albumId));
  }

  if (useYear) {
    const from = Number(yearFrom || 1900);
    const to = Number(yearTo || 2100);
    songs = songs.filter((s) => s.year >= from && s.year <= to);
  }

  if (usePlaylists) {
    const allowed = new Set(
      catalog.playlists
        .filter((p) => playlistIds.includes(p.id))
        .flatMap((p) => p.trackIds)
    );
    songs = songs.filter((s) => allowed.has(s.id));
  }

  return songs;
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
