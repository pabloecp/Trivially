import assert from "node:assert/strict";
import { CatalogGrowth, MIN_STREAMS, artistIdFromEmbed, guessLanguage, parseArtistPage } from "./catalogGrowth.js";
import { withRankings } from "./catalogProvider.js";
import { difficultyOf } from "./songFilters.js";

const ARTIST = "1Xyo4u8uXC1ZmMpatF05PJ";
const row = (id, title, plays) =>
  `<tr><td class="text"><div><a href="https://open.spotify.com/track/${id}">${title}</a></div></td><td>${plays}</td><td>1</td></tr>`;
const artistPage = [
  row("A".repeat(22), "Muy Escuchada", "900,000,000"),
  row("B".repeat(22), "Poco Escuchada", "12,000,000"),
  row("C".repeat(22), "Otra Version", "300,000,000"),
  row("D".repeat(22), "Otra Version - Remix", "5,000,000"),
].join("");
const embed = `{"artists":[{"name":"Artista","uri":"spotify:artist:${ARTIST}"},{"name":"Invitado","uri":"spotify:artist:${"Z".repeat(22)}"}]}`;

// Reading kworb and Spotify's embed page.
const page = parseArtistPage(artistPage);
assert.equal(page.byId.get("A".repeat(22)), 900_000_000);
assert.equal(page.byTitle.get("otra version|"), 300_000_000);
assert.equal(artistIdFromEmbed(embed), ARTIST);

// The language: the genre first, then the artist's other songs in the catalog.
const base = { songs: [{ id: "x1", title: "Una", artistName: "Cantante", language: "es", streams: 5 }] };
assert.equal(guessLanguage(base, { genre: "Urbano latino", artistName: "Nadie" }), "es");
assert.equal(guessLanguage(base, { genre: "Pop", artistName: "Cantante" }), "es");
assert.equal(guessLanguage(base, { genre: "Pop", artistName: "Nadie" }), "en");

const fetchImpl = async (url) => ({ ok: true, text: async () => (url.includes("kworb") ? artistPage : embed) });
const catalog = withRankings([{ id: "x1", title: "Una", artistName: "Cantante", language: "es", previewUrl: "p0", itunesId: 1, streams: 5 }]);
const saved = [];
const growth = new CatalogGrowth({ catalog, fetchImpl, save: async (s) => saved.push(s), gapMs: 0 });
const until = async () => {
  while (growth.running || growth.queue.length) await new Promise((r) => setTimeout(r, 5));
};
const song = (n, extra = {}) => ({ id: `sp-${n}`, title: `Cancion ${n}`, artistName: "Artista", previewUrl: `p${n}`, itunesId: 100 + n, genre: "Pop", ...extra });

difficultyOf(catalog, catalog.songs[0]); // the difficulties are worked out before the catalog grows

// Played a lot and not in the catalog: it joins it, saved and ranked.
growth.consider({ spotifyId: "A".repeat(22), title: "Muy Escuchada", artists: ["Artista"] }, song(1, { title: "Muy Escuchada" }));
// Not played enough: left out.
growth.consider({ spotifyId: "B".repeat(22), title: "Poco Escuchada" }, song(2, { title: "Poco Escuchada" }));
// Found by its title when kworb lists another version's id; a remix never takes the original's plays.
growth.consider({ spotifyId: "E".repeat(22), title: "Otra Version" }, song(3, { title: "Otra Version" }));
growth.consider({ spotifyId: "F".repeat(22), title: "Otra Version - Remix" }, song(4, { title: "Otra Version - Remix" }));
// Already in the catalog (same title and artist): not checked.
growth.consider({ spotifyId: "G".repeat(22), title: "Una" }, song(5, { title: "Una", artistName: "Cantante" }));
// Not found on iTunes (no iTunes id): not checked.
growth.consider({ spotifyId: "H".repeat(22), title: "Muy Escuchada" }, song(6, { itunesId: null }));
await until();

assert.deepEqual(saved.map((s) => s.title), ["Muy Escuchada", "Otra Version"]);
assert.equal(saved[0].id, `sp-${"A".repeat(22)}`);
assert.equal(saved[0].streams, 900_000_000);
assert.ok(saved.every((s) => s.streams >= MIN_STREAMS));
assert.equal(catalog.songs.length, 3);
const english = catalog.playlists.find((p) => p.id === "top-en");
assert.deepEqual(english.trackIds, [`sp-${"A".repeat(22)}`, `sp-${"E".repeat(22)}`]);
assert.equal(difficultyOf(catalog, saved[0]), "facil"); // worked out again with the new songs

// The same song again (another room): nothing more.
growth.consider({ spotifyId: "A".repeat(22), title: "Muy Escuchada" }, song(1, { title: "Muy Escuchada" }));
await until();
assert.equal(saved.length, 2);

console.log("catalogGrowth.test ok");
