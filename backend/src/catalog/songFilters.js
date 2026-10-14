// Adivina la canción's filters on the catalog: language, genre and difficulty, three lists of what's ticked (all by
// default, like Trivia's). They only apply to the catalog's songs; a room's Spotify playlists play whole.

export const SONG_LANGUAGES = ["es", "en"];
export const SONG_GENRES = ["pop", "urbano", "rock", "mexicana", "hiphop", "electronica"];
export const SONG_DIFFICULTIES = ["facil", "media", "dificil"];

// iTunes' genre names grouped in six; anything else counts as pop.
const GENRE_GROUPS = {
  urbano: ["Urbano latino", "Latin", "Latin Rap", "Música tropical", "Reggae", "Reggaeton", "Worldwide"],
  mexicana: ["Música Mexicana", "Regional Mexicano", "Ranchera", "Norteño", "Banda"],
  rock: ["Alternative", "Rock", "Hard Rock", "Rock y Alternativo", "Metal", "Indie Rock", "Blues", "Punk"],
  hiphop: ["Hip-Hop/Rap", "R&B/Soul", "Neo-Soul", "Alternative Rap", "Rap"],
  electronica: ["Dance", "Electronic", "House", "Techno", "Electronica"],
};
const GROUP_OF = new Map(Object.entries(GENRE_GROUPS).flatMap(([group, names]) => names.map((n) => [n, group])));

/** The song's genre group (one of SONG_GENRES). */
export function genreOf(song) {
  return GROUP_OF.get(song?.genre) || "pop";
}

/** The song's language, "es" or "en" (anything else counts as English). */
export function languageOf(song) {
  return song?.language === "es" ? "es" : "en";
}

// Difficulty by how well known a song is: its place in the ranking of its playlist (the catalog's playlists are
// ordered by streams), in thirds. Worked out once per catalog.
const levels = new WeakMap();
export function difficultyOf(catalog, song) {
  let map = levels.get(catalog);
  if (!map) {
    map = new Map();
    for (const p of catalog.playlists || []) {
      p.trackIds.forEach((id, i) => {
        const level = SONG_DIFFICULTIES[Math.min(2, Math.floor((i * 3) / p.trackIds.length))];
        const was = map.get(id);
        // A song in both playlists keeps the easier of its two places.
        if (!was || SONG_DIFFICULTIES.indexOf(level) < SONG_DIFFICULTIES.indexOf(was)) map.set(id, level);
      });
    }
    levels.set(catalog, map);
  }
  return map.get(song.id) || "media";
}

/** A list of what's ticked, cleaned up; a missing one (an older room) means all of them. */
export function cleanList(list, allowed) {
  return Array.isArray(list) ? allowed.filter((v) => list.includes(v)) : [...allowed];
}

/** The room's filters, every list cleaned up. */
export function songFilters(config = {}) {
  return {
    languages: cleanList(config.languages, SONG_LANGUAGES),
    genres: cleanList(config.genres, SONG_GENRES),
    difficulties: cleanList(config.difficulties, SONG_DIFFICULTIES),
  };
}

/** The catalog's songs that pass the filters. */
export function filterSongs(catalog, config) {
  const f = songFilters(config);
  return catalog.songs.filter(
    (s) => f.languages.includes(languageOf(s)) && f.genres.includes(genreOf(s)) && f.difficulties.includes(difficultyOf(catalog, s))
  );
}

/**
 * Songs per language, genre and difficulty with the other two lists' choices (for the settings' chips: one without
 * songs can't be ticked), plus the songs the filters leave in all (`total`).
 */
export function songCounts(catalog, config) {
  const f = songFilters(config);
  const out = { languages: {}, genres: {}, difficulties: {}, total: 0 };
  for (const v of SONG_LANGUAGES) out.languages[v] = 0;
  for (const v of SONG_GENRES) out.genres[v] = 0;
  for (const v of SONG_DIFFICULTIES) out.difficulties[v] = 0;
  for (const s of catalog.songs) {
    const lang = languageOf(s);
    const genre = genreOf(s);
    const level = difficultyOf(catalog, s);
    const okLang = f.languages.includes(lang);
    const okGenre = f.genres.includes(genre);
    const okLevel = f.difficulties.includes(level);
    if (okGenre && okLevel) out.languages[lang] += 1;
    if (okLang && okLevel) out.genres[genre] += 1;
    if (okLang && okGenre) out.difficulties[level] += 1;
    if (okLang && okGenre && okLevel) out.total += 1;
  }
  return out;
}
