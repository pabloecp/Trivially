// Adivina la canción's filters on the catalog: language, genre and difficulty, three lists of what's ticked (all by
// default, like Trivia's). They only apply to the catalog's songs; a room's Spotify playlists play whole.

export const SONG_LANGUAGES = ["es", "en"];
export const SONG_GENRES = ["pop", "urbano", "rock", "mexicana", "hiphop", "electronica"];
export const SONG_DIFFICULTIES = ["facil", "media", "dificil"];

// iTunes' genre names grouped in six; anything else counts as pop.
const GENRE_GROUPS = {
  urbano: ["Urbano latino", "Latin", "Música tropical", "Reggae", "Reggaeton", "Worldwide", "Afrobeats", "Afro-Beat", "Dancehall"],
  mexicana: ["Música Mexicana", "Regional Mexicano", "Ranchera", "Norteño", "Banda"],
  rock: ["Alternative", "Rock", "Hard Rock", "Rock y Alternativo", "Metal", "Indie Rock", "Blues", "Punk"],
  hiphop: ["Hip-Hop/Rap", "R&B/Soul", "Neo-Soul", "Alternative Rap", "Rap", "Latin Rap"],
  electronica: ["Dance", "Electronic", "House", "Techno", "Electronica"],
};
const GROUP_OF = new Map(Object.entries(GENRE_GROUPS).flatMap(([group, names]) => names.map((n) => [n, group])));

// iTunes gets some wrong (a corrido tagged "Dance", Billie Eilish as "Alternative", reggaeton as "Pop Latino"), so these
// come first. By artist: the song's credited artists start with the name (lower case). By song: "artist|title", and a
// song may be in several genres (a list): "One Dance" is rap and dancehall, "Pepas" reggaeton and guaracha (EDM).
const ARTIST_GENRE = {
  // Corridos and regional Mexican tagged "Latin" or "Urbano latino".
  "natanael cano": "mexicana",
  "junior h": "mexicana",
  "carín león": "mexicana",
  "peso pluma": "mexicana",
  "luis r conriquez": "mexicana",
  "neton vega": "mexicana",
  "oscar maydon": "mexicana",
  "victor mendivil": "mexicana",
  "omar camacho": "mexicana",
  "fuerza regida": "mexicana",
  "grupo frontera": "mexicana",
  // Reggaeton tagged "Pop Latino" or "Hip-Hop/Rap".
  "myke towers": "urbano",
  "alleh": "urbano",
  "arcángel": "urbano",
  "bizarrap & quevedo": "urbano",
  // Rap and trap in Spanish.
  "nanpa básico": "hiphop",
  "luar la l": "hiphop",
  "eladio carrion": "hiphop",
  // Pop in Spanish tagged "Latin".
  "luis miguel": "pop",
  shakira: "pop",
  "kali uchis": "pop",
  "mon laferte": "pop",
  "jarabe de palo": "rock",
  "manu chao": "pop",
  // English: each artist in one place.
  "billie eilish": "pop",
  "taylor swift": "pop",
  "bruno mars": "pop",
  rihanna: "pop",
  "lady gaga": "pop",
  "lewis capaldi": "pop",
  d4vd: "pop",
  halsey: "pop",
  "tones and i": "pop",
  "cyndi lauper": "pop",
  gotye: "pop",
  "ben e. king": "pop",
  "marvin gaye": "pop",
  "earth, wind & fire": "pop",
  "amy winehouse": "pop",
  "john legend": "pop",
  coldplay: "rock",
  queen: "rock",
  "måneskin": "rock",
  keane: "rock",
  "the verve": "rock",
  "the goo goo dolls": "rock",
  "the weeknd": "hiphop",
  xxxtentacion: "hiphop",
  eminem: "hiphop",
  "snoop dogg": "hiphop",
  "frank ocean": "hiphop",
  "g-eazy": "hiphop",
  kygo: "electronica",
  marshmello: "electronica",
};
const SONG_GENRE = {
  "anitta|envolver": "urbano",
  "becky g|mayores": "urbano",
  "blessd|medallo": "urbano",
  "rosalía|con altura": "urbano",
  "rosalía|la perla": "pop",
  "dj snake|taki taki": "urbano",
  "dj snake|loco contigo": "urbano",
  "maluma & carín león|según quién": "mexicana",
  "gera mx|botella tras botella": "mexicana",
  // Reggaeton and cuarteto iTunes files as "Latin Rap".
  "big one|un finde | crossover #2": "urbano",
  "tiago pzk|entre nosotros": "urbano",
  "bizarrap|shakira: bzrp music sessions, vol. 53": ["pop", "electronica"],
  "mike posner|i took a pill in ibiza": "electronica",
  // In two genres.
  "drake|one dance": ["hiphop", "urbano"],
  "farruko|pepas": ["urbano", "electronica"],
  "omi|cheerleader (felix jaehn remix)": ["pop", "urbano"],
  "magic!|rude": ["pop", "urbano"],
  "major lazer & nyla|light it up": ["electronica", "urbano"],
  "daft punk & pharrell williams|get lucky": ["electronica", "pop"],
  // English: dancehall/afrobeats pop, EDM pop, rap with rock or pop.
  "rihanna|work": ["pop", "urbano"],
  "rihanna|only girl (in the world)": ["pop", "electronica"],
  "rihanna|don't stop the music": ["pop", "electronica"],
  "sia|cheap thrills": ["pop", "urbano"],
  "doja cat|woman": ["pop", "urbano"],
  "justin bieber|sorry": ["pop", "electronica"],
  "justin bieber|what do you mean?": ["pop", "electronica"],
  "black eyed peas|i gotta feeling": ["pop", "electronica"],
  "pitbull|give me everything": ["pop", "electronica"],
  "pitbull|timber": ["pop", "electronica"],
  "nicki minaj|starships": ["pop", "electronica"],
  "elton john & dua lipa|cold heart": ["pop", "electronica"],
  "clean bandit|rockabye": ["electronica", "urbano"],
  "major lazer|lean on": ["electronica", "urbano"],
  "coldplay|a sky full of stars": ["rock", "electronica"],
  "the weeknd|blinding lights": ["pop", "electronica"],
  "the weeknd|i feel it coming": ["pop", "electronica"],
  "the weeknd|save your tears": "pop",
  "the weeknd|can't feel my face": "pop",
  "the weeknd|starboy": ["hiphop", "pop"],
  "the weeknd, jennie & lily rose depp|one of the girls": ["hiphop", "pop"],
  "post malone & swae lee|sunflower": ["hiphop", "pop"],
  "post malone|circles": "pop",
  "eminem|love the way you lie": ["hiphop", "pop"],
  "lil nas x|old town road": ["hiphop", "pop"],
  "lil nas x|montero (call me by your name)": ["pop", "hiphop"],
  "gym class heroes|stereo hearts": ["pop", "hiphop"],
  "nelly furtado|promiscuous": ["pop", "hiphop"],
  "beyoncé|crazy in love": ["pop", "hiphop"],
  "cardi b|i like it": ["hiphop", "urbano"],
  "linkin park|in the end": ["rock", "hiphop"],
  "twenty one pilots|stressed out": ["rock", "hiphop"],
  "gorillaz|feel good inc": ["rock", "hiphop"],
  "papa roach|last resort": ["rock", "hiphop"],
  // Spanish: reggaeton pop, Latin trap, reggaeton with corrido or EDM.
  "luis fonsi|despacito": ["pop", "urbano"],
  "shakira|chantaje": ["pop", "urbano"],
  "enrique iglesias|subeme la radio": ["pop", "urbano"],
  "enrique iglesias|duele el corazon": ["pop", "urbano"],
  "sebastian yatra|traicionera": ["pop", "urbano"],
  "sebastian yatra|chica ideal": ["urbano", "pop"],
  "camilo|tutu": ["pop", "urbano"],
  "pedro capó|calma": ["pop", "urbano"],
  "piso 21|me llamas": ["pop", "urbano"],
  "ricky martin|vente pa' ca": ["pop", "urbano"],
  "mau y ricky|desconocidos": ["pop", "urbano"],
  "sofía reyes|1, 2, 3": ["pop", "urbano"],
  "anitta|downtown": ["pop", "urbano"],
  "rosalía|despechá": ["pop", "urbano"],
  "danny ocean|me rehúso": ["urbano", "pop"],
  "cnco|reggaetón lento (bailemos)": ["urbano", "pop"],
  "jarabe de palo|la flaca": ["rock", "pop"],
  "anuel aa|sola (remix)": ["urbano", "hiphop"],
  "anuel aa|ella quiere beber": ["urbano", "hiphop"],
  "arcángel|la jumpa": ["urbano", "hiphop"],
  "paulo londra|adan y eva": ["urbano", "hiphop"],
  "paulo londra|tal vez": ["urbano", "hiphop"],
  "lit killah|los del espacio": ["urbano", "hiphop"],
  "bizarrap|tiago pzk: bzrp music sessions, vol. 48": ["urbano", "hiphop"],
  "bizarrap & quevedo|quevedo: bzrp music sessions, vol. 52": ["urbano", "electronica"],
  "marshmello|el merengue": ["electronica", "urbano"],
  "karol g & peso pluma|qlona": ["urbano", "mexicana"],
  "peso pluma|bellakeo": ["mexicana", "urbano"],
  "natanael cano & steve aoki|nataaoki": ["mexicana", "electronica"],
  // iTunes calls these "Pop".
  "swedish house mafia & john martin|don't you worry child": "electronica",
  "tiësto|the business": "electronica",
  "calvin harris & frank ocean|slide": "pop",
  "shaggy & rikrok|it wasn't me": "urbano",
};
const ARTIST_RULES = Object.entries(ARTIST_GENRE);

/** The song's genre groups (one or more of SONG_GENRES): our corrections first, else iTunes' genre grouped. */
export function genresOf(song) {
  const artist = String(song?.artistName || "").toLowerCase();
  const bySong = SONG_GENRE[`${artist}|${String(song?.title || "").toLowerCase()}`];
  const byArtist = !bySong && ARTIST_RULES.find(([name]) => artist.startsWith(name));
  const found = bySong || (byArtist && byArtist[1]) || GROUP_OF.get(song?.genre) || "pop";
  return Array.isArray(found) ? found : [found];
}

/** The song's first genre group. */
export function genreOf(song) {
  return genresOf(song)[0];
}

/** The song's language, "es" or "en" (anything else counts as English). */
export function languageOf(song) {
  return song?.language === "es" ? "es" : "en";
}

// Difficulty by how well known a song is: its place in the ranking of its language (catalogProvider's withRankings,
// by Spotify streams), in thirds. Worked out once per catalog.
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
    (s) =>
      f.languages.includes(languageOf(s)) &&
      genresOf(s).some((g) => f.genres.includes(g)) &&
      f.difficulties.includes(difficultyOf(catalog, s))
  );
}

/**
 * Songs per language, genre and difficulty with the other two lists' choices (for the settings' chips: one without
 * songs can't be ticked), plus the songs the filters leave in all (`total`). For a chip, an empty other list counts as
 * all of it ticked: otherwise unticking a whole list would lock every chip of the other two.
 */
export function songCounts(catalog, config) {
  const f = songFilters(config);
  const chip = {
    languages: f.languages.length ? f.languages : SONG_LANGUAGES,
    genres: f.genres.length ? f.genres : SONG_GENRES,
    difficulties: f.difficulties.length ? f.difficulties : SONG_DIFFICULTIES,
  };
  const out = { languages: {}, genres: {}, difficulties: {}, total: 0 };
  for (const v of SONG_LANGUAGES) out.languages[v] = 0;
  for (const v of SONG_GENRES) out.genres[v] = 0;
  for (const v of SONG_DIFFICULTIES) out.difficulties[v] = 0;
  for (const s of catalog.songs) {
    const lang = languageOf(s);
    const genres = genresOf(s);
    const level = difficultyOf(catalog, s);
    // A song in two genres counts for both genre chips.
    if (genres.some((g) => chip.genres.includes(g)) && chip.difficulties.includes(level)) out.languages[lang] += 1;
    if (chip.languages.includes(lang) && chip.difficulties.includes(level)) for (const g of genres) out.genres[g] += 1;
    if (chip.languages.includes(lang) && genres.some((g) => chip.genres.includes(g))) out.difficulties[level] += 1;
    if (f.languages.includes(lang) && genres.some((g) => f.genres.includes(g)) && f.difficulties.includes(level)) out.total += 1;
  }
  return out;
}
