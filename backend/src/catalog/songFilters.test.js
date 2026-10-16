import assert from "node:assert/strict";
import { readLocalCatalog } from "./catalogProvider.js";
import { SONG_GENRES, difficultyOf, filterSongs, genreOf, genresOf, songCounts } from "./songFilters.js";

const catalog = readLocalCatalog();

// With nothing set (an older room) or everything ticked, the whole catalog plays.
assert.equal(filterSongs(catalog, {}).length, catalog.songs.length);
assert.equal(songCounts(catalog, {}).total, catalog.songs.length);

// iTunes' genres fall in the six groups; every group has enough songs for a match.
assert.equal(genreOf({ genre: "Urbano latino" }), "urbano");
assert.equal(genreOf({ genre: "Hard Rock" }), "rock");
assert.equal(genreOf({ genre: "Dance" }), "electronica");
assert.equal(genreOf({ genre: "Algo raro" }), "pop");
for (const g of SONG_GENRES) assert.ok(filterSongs(catalog, { genres: [g] }).length >= 25, g);

// One language only.
const es = filterSongs(catalog, { languages: ["es"] });
assert.ok(es.length > 0 && es.every((s) => s.language === "es"));

// Difficulty is a third of each playlist's ranking: its first song is easy, its last one hard.
const [first] = catalog.playlists;
const byId = new Map(catalog.songs.map((s) => [s.id, s]));
assert.equal(difficultyOf(catalog, byId.get(first.trackIds[0])), "facil");
assert.equal(difficultyOf(catalog, byId.get(first.trackIds.at(-1))), "dificil");

// Nothing ticked in a list: no catalog songs. The counts of a list ignore its own choices.
assert.equal(filterSongs(catalog, { languages: [] }).length, 0);
const counts = songCounts(catalog, { languages: ["es"] });
assert.ok(counts.languages.en > 0, "English still counted for its chip");
assert.equal(counts.total, es.length);

// A song can be in two genres: it plays with either ticked and counts for both chips.
const pepas = catalog.songs.find((s) => s.artistName === "Farruko" && s.title === "Pepas");
assert.deepEqual(genresOf(pepas), ["urbano", "electronica"]);
assert.ok(filterSongs(catalog, { genres: ["electronica"] }).includes(pepas));
assert.ok(filterSongs(catalog, { genres: ["urbano"] }).includes(pepas));

// A whole list unticked doesn't lock the other lists' chips (they count as if it were all ticked), but no song plays.
const none = songCounts(catalog, { languages: [], genres: [], difficulties: [] });
assert.equal(none.total, 0);
assert.ok(Object.values(none.genres).every((n) => n > 0), "every genre chip can still be ticked");
assert.ok(none.languages.es > 0 && none.difficulties.facil > 0);

console.log("songFilters.test ok");
