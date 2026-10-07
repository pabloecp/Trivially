// Builds backend/src/catalog/catalog.json: the two playlists of most-streamed songs on Spotify, in Spanish and in
// English (500 each), with their 30 s preview and cover from iTunes.
//
//   NODE_USE_ENV_PROXY=1 node scripts/buildCatalog.js [--size 500] [--cache cache.json] [--out otro.json]
//
// Where the songs come from (kworb.net, total Spotify streams):
//   - English: the global all-time ranking, in order.
//   - Spanish: the Spanish songs of the global ranking first, then the all-time rankings of Spanish-speaking
//     countries added up, to reach the size (the global one has too few).
// The language comes from the iTunes genre ("Urbano latino", "Música Mexicana"... = Spanish), as before. Songs are
// matched with the game's own TrackResolver (title, artist and, for remixes, the remix and not the original), and
// songs already in catalog.json are reused without asking iTunes again. iTunes allows ~20 requests a minute, so a
// full run takes about an hour; with --cache, the found songs are saved as it goes and a new run picks up from there.
// Afterwards, `npm run catalog:upload` copies the new catalog.json to Supabase.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TrackResolver, cleanTitle } from "../src/catalog/trackResolver.js";
import { normalizeAnswer } from "../src/game/answers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, "../src/catalog/catalog.json");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const SIZE = Number(arg("size", 500));
const CACHE_PATH = arg("cache", null);
const OUT_PATH = arg("out", CATALOG_PATH);
const SPANISH_COUNTRIES = ["mx", "es", "ar", "co", "cl", "pe", "ec"];
const LATIN_GENRE = /latin|urbano|mexican|regional|tropical|salsa|bachata|reggaet|cumbia|banda|norte|corrido|flamenco|en espa|rock y alternativo|cantautor/i;
const OTHER_LANGUAGE_GENRE = /k-pop|j-pop|brazil|sertanejo|mpb|funk carioca|pagode|samba|ax[eé]|french|german|italian|bollywood|indian|arab|turk|afro/i;
const SPANISH_WORDS = new Set("el la los las de del que mi mis tu tus te me yo con sin por para y un una lo se es muy mas más amor corazon corazón noche todo toda nada como cómo que qué quien quién donde dónde si ti mí nos ella el él otra vez".split(" "));
const ENGLISH_WORDS = new Set("the you your i me my love to of in on it and a is be we all don't dont i'm im can for with like it's this that just what".split(" "));

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
const num = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function page(url) {
  for (let i = 0; i < 3; i += 1) {
    const res = await fetch(url);
    if (res.ok) return res.text();
    await wait(2000);
  }
  throw new Error(`No se pudo leer ${url}`);
}

/** "Bad Bunny - DÁKITI (with JHAYCO)" → artist, title, and the guests named in the title. */
function splitEntry(text, extra = {}) {
  const at = text.indexOf(" - ");
  if (at < 0) return null;
  const artist = text.slice(0, at).trim();
  const title = text.slice(at + 3).trim();
  const guests = [...title.matchAll(/[([](?:feat\.?|ft\.?|with|con)\s+([^)\]]+)[)\]]/gi)].flatMap((m) =>
    m[1].split(/\s*(?:,|&|\sand\s|\sy\s)\s*/i).filter(Boolean)
  );
  return { artist, title, artists: [artist, ...guests], key: `${normalizeAnswer(artist)}|${normalizeAnswer(cleanTitle(title))}|${/remix/i.test(title) ? "r" : ""}`, ...extra };
}

async function kworbGlobal() {
  const html = await page("https://kworb.net/spotify/songs.html");
  const rows = [...html.matchAll(/<tr><td class="text"><div>(.*?)<\/div><\/td><td>([\d,]+)<\/td>/g)];
  return rows.map(([, text, streams]) => splitEntry(decode(text), { streams: num(streams) })).filter(Boolean);
}

async function kworbCountry(cc) {
  const html = await page(`https://kworb.net/spotify/country/${cc}_weekly_totals.html`);
  const rows = [...html.matchAll(/<td class="text mp"><div>(.*?)<\/div><\/td>([\s\S]*?)<\/tr>/g)];
  return rows
    .map(([, cell, rest]) => {
      const total = [...rest.matchAll(/<td>([\d,]+)<\/td>/g)].pop();
      const spotifyId = (cell.match(/track\/([A-Za-z0-9]+)\.html/) || [])[1] || null;
      return splitEntry(decode(cell), { total: num(total?.[1]), spotifyId });
    })
    .filter(Boolean);
}

const artistsOf = (name = "") => name.split(/\s*(?:,|&|\s+feat\.?\s+|\s+x\s+)\s*/i).map((a) => normalizeAnswer(a)).filter(Boolean);
const words = (title) => normalizeAnswer(cleanTitle(title)).split(" ");

const isLatin = (song) => song.language === "es" || LATIN_GENRE.test(song.genre || "");
const SPANISH_MARKS = /[ñáéíóú¿¡]/i;

/** Distinct Spanish and English words in a title ("La La La" has one Spanish word, not three). */
function titleWords(title) {
  const w = new Set(words(title));
  return { es: [...w].filter((x) => SPANISH_WORDS.has(x)).length, en: [...w].filter((x) => ENGLISH_WORDS.has(x)).length };
}

/** "La Isla Bonita" or "La Grange" are not in Spanish: it takes 2 Spanish words, or one plus an accent or ñ. */
function spanishTitle(title) {
  const { es, en } = titleWords(title);
  return es > en && (es >= 2 || (es >= 1 && SPANISH_MARKS.test(title)));
}

/**
 * Spanish when iTunes files it under a Latin genre. When the genre says nothing about the language ("Pop",
 * "Hip-Hop/Rap", "Dance"…): Spanish if its main artist mostly sings in Spanish (see spanishArtistsFrom) and the title
 * has no English words, or if the title itself is clearly Spanish. Accents alone don't count: "Señorita" (Shawn
 * Mendes) is in English and "APT." by ROSÉ is not in Spanish.
 */
function language(song, entry, spanishArtists) {
  if (song.language) return song.language;
  const genre = song.genre || "";
  if (LATIN_GENRE.test(genre)) return "es";
  if (OTHER_LANGUAGE_GENRE.test(genre)) return "other";
  if (spanishTitle(entry.title)) return "es";
  if (spanishArtists.has(artistsOf(song.artistName)[0])) {
    // An artist who mostly sings in Spanish also has songs in English ("Shower" by Becky G): with nothing in the
    // title saying which, the song is left out of both lists rather than risk the wrong one.
    const { es, en } = titleWords(entry.title);
    if (!en && (es || SPANISH_MARKS.test(entry.title))) return "es";
    return en ? "en" : "other";
  }
  return "en";
}

/**
 * Artists who mostly sing in Spanish: most (60%+) of the songs where they are the main artist are Latin. A single
 * Latin collaboration doesn't make Marshmello or Selena Gomez Spanish-language artists.
 */
function spanishArtistsFrom(songs) {
  const tally = new Map();
  for (const song of songs) {
    if (!song?.artistName) continue;
    const main = artistsOf(song.artistName)[0];
    const t = tally.get(main) || { latin: 0, all: 0 };
    t.all += 1;
    if (isLatin(song)) t.latin += 1;
    tally.set(main, t);
  }
  return new Set([...tally].filter(([, t]) => t.latin / t.all >= 0.6).map(([a]) => a));
}

async function main() {
  const old = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const cache = CACHE_PATH && fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : {};
  const resolver = new TrackResolver({ catalog: old, useDb: false });
  // Artists who mostly sing in Spanish, from every song known so far (old catalog + songs found in earlier runs),
  // recomputed as new songs are found.
  const knownSongs = [...old.songs, ...Object.values(cache).filter(Boolean)];
  let spanishArtists = spanishArtistsFrom(knownSongs);
  const noteArtists = (song) => {
    if (!song) return;
    knownSongs.push(song);
    spanishArtists = spanishArtistsFrom(knownSongs);
  };
  for (const [key, song] of Object.entries(cache)) resolver.known.set(key, song);

  console.log("Leyendo kworb…");
  const global = await kworbGlobal();
  const latin = new Map();
  for (const cc of SPANISH_COUNTRIES) {
    for (const e of await kworbCountry(cc)) {
      const cur = latin.get(e.key) || { ...e, total: 0 };
      cur.total += e.total;
      latin.set(e.key, cur);
    }
    await wait(800);
  }
  const globalStreams = new Map(global.map((e) => [e.key, e.streams]));
  // Spanish order: first the songs of the global ranking, by their worldwide streams (country totals only count the
  // weeks a song was on that country's chart, so older hits like "Danza Kuduro" would fall behind); then, to reach
  // the size, the rest by their total in Spanish-speaking countries. English songs among them are skipped later.
  for (const e of global) if (!latin.has(e.key)) latin.set(e.key, { ...e, total: 0 });
  const rank = (e) => (globalStreams.has(e.key) ? 1e12 + globalStreams.get(e.key) : e.total);
  // Of the global songs not looked up yet, only those likely in Spanish (an artist known to sing in Spanish, or Spanish
  // words in the title) are searched: finding out the language of 2,000 English hits would take hours.
  const likelySpanish = (e) =>
    resolver.known.has(e.key) ||
    !globalStreams.has(e.key) ||
    e.artists.some((a) => spanishArtists.has(normalizeAnswer(a))) ||
    spanishTitle(e.title);
  const spanishCandidates = [...latin.values()].filter(likelySpanish).sort((a, b) => rank(b) - rank(a));
  console.log(`${global.length} canciones globales, ${spanishCandidates.length} de países hispanohablantes`);

  /** Finds a batch of songs on iTunes (cached ones at once) and returns them in the same order. */
  async function find(entries) {
    const results = new Map();
    const tracks = entries.map((e) => ({ spotifyId: e.key, title: e.title, artists: e.artists, albumName: "", durationMs: 0 }));
    await resolver.resolve(tracks, {
      onResult: (id, song) => {
        results.set(id, song);
        noteArtists(song);
      },
    });
    while (resolver.running || resolver.queue.length) await wait(200);
    if (CACHE_PATH) {
      for (const [id, song] of results) cache[id] = song;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
    }
    return entries.map((e) => results.get(e.key) || null);
  }

  async function build(candidates, lang, streamsOf) {
    const picked = [];
    const seen = new Set();
    for (let i = 0; i < candidates.length && picked.length < SIZE; i += 25) {
      const batch = candidates.slice(i, i + 25);
      const songs = await find(batch);
      batch.forEach((entry, j) => {
        const song = songs[j];
        if (!song || picked.length >= SIZE) return;
        if (language(song, entry, spanishArtists) !== lang) return;
        // The same recording can come twice under two kworb names ("… Vol. 52" and "… Vol. 52/66").
        const sameTitle = normalizeAnswer(song.title.replace(/\/\d+\b/, ""));
        const dedupe = [`${sameTitle}|${normalizeAnswer(artistsOf(song.artistName)[0] || "")}`, song.itunesId && `it${song.itunesId}`, song.previewUrl];
        if (dedupe.some((k) => k && seen.has(k))) return;
        dedupe.forEach((k) => k && seen.add(k));
        picked.push({ entry, song: { ...song, language: lang, streams: streamsOf(entry) } });
      });
      console.log(`  ${lang}: ${picked.length}/${SIZE} (revisadas ${Math.min(i + 25, candidates.length)})`);
    }
    return picked;
  }

  // Spanish first: by the time the English list is built, every artist who sings in Spanish is known.
  console.log("Español…");
  const spanish = await build(spanishCandidates, "es", (e) => globalStreams.get(e.key) || e.total);
  console.log("Inglés…");
  const english = await build(global, "en", (e) => e.streams);

  // Songs keep their old id when they were already in the catalog (stats and rooms point at it).
  const songs = new Map();
  const ids = (picked) =>
    picked.map(({ song }) => {
      let id = song.id && !song.id.startsWith("sp-") ? song.id : slug(`${song.artistName.split(/,|&/)[0]} ${song.title}`);
      while (songs.has(id) && songs.get(id).previewUrl !== song.previewUrl) id = `${id}-2`;
      songs.set(id, {
        id,
        title: song.title,
        artistName: song.artistName,
        albumName: song.albumName || "",
        year: song.year || null,
        image: song.image,
        previewUrl: song.previewUrl,
        genre: song.genre || null,
        language: song.language,
        itunesId: song.itunesId || null,
        streams: song.streams || null,
      });
      return id;
    });
  const esIds = ids(spanish);
  const enIds = ids(english);

  const catalog = {
    source: old.source,
    playlists: [
      {
        id: "top-es",
        name: "Most Streamed Songs on Spotify · Español",
        description: `Las ${esIds.length} canciones en español más escuchadas de la historia de Spotify.`,
        isDefault: true,
        trackIds: esIds,
      },
      {
        id: "top-en",
        name: "Most Streamed Songs on Spotify · Inglés",
        description: `Las ${enIds.length} canciones en inglés más escuchadas de la historia de Spotify.`,
        isDefault: false,
        trackIds: enIds,
      },
    ],
    songs: [...songs.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(catalog, null, 1)}\n`);
  console.log(`Listo: ${esIds.length} en español, ${enIds.length} en inglés, ${catalog.songs.length} canciones en ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
