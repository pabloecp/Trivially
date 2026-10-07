import assert from "node:assert/strict";
import { TrackResolver, cleanTitle, displayTitle, isRemix, scoreCandidate } from "./trackResolver.js";

assert.equal(cleanTitle("Bohemian Rhapsody - Remastered 2011"), "Bohemian Rhapsody");
assert.equal(cleanTitle("Tusa (feat. Nicki Minaj)"), "Tusa");
assert.equal(cleanTitle("Me Porto Bonito"), "Me Porto Bonito");

const track = { spotifyId: "sp1", title: "Ojitos Lindos", artists: ["Bad Bunny", "Bomba Estéreo"], albumName: "Un Verano Sin Ti", durationMs: 258000 };
const right = { trackId: 1, trackName: "Ojitos Lindos", artistName: "Bad Bunny & Bomba Estéreo", previewUrl: "https://audio-ssl.itunes.apple.com/a.m4a", trackTimeMillis: 258300, artworkUrl100: "https://is1-ssl.mzstatic.com/x/100x100bb.jpg" };
// Same title, other artist and other length: a different song.
assert.equal(scoreCandidate(track, { ...right, artistName: "Otro", trackTimeMillis: 190000 }), 0);
assert.ok(scoreCandidate(track, right) > 0);
// Same title and same length but another artist: not the song (De La Rose's "NUBES" is not Rauw Alejandro's).
const nubes = { spotifyId: "n", title: "NUBES", artists: ["De La Rose", "Omar Courtz"], durationMs: 180000 };
assert.equal(scoreCandidate(nubes, { ...right, trackName: "Nubes", artistName: "Rauw Alejandro", trackTimeMillis: 179000 }), 0);
// Same title and artist but a clearly different length (another version): not the song either.
assert.equal(scoreCandidate(track, { ...right, trackTimeMillis: 240000 }), 0);
// Instrumental versions are never used.
assert.equal(scoreCandidate(track, { ...right, trackName: "Ojitos Lindos (Instrumental)" }), 0);
// A remix only matches a remix: "Loca - Remix" is not the original "Loca", and the original is not a remix.
const loca = { spotifyId: "l", title: "Loca - Remix", artists: ["KHEA", "Bad Bunny"], durationMs: 0 };
const locaRemix = { ...right, trackName: "Loca (feat. Cazzu) [Remix]", artistName: "KHEA, Bad Bunny & Duki", trackTimeMillis: null };
assert.ok(scoreCandidate(loca, locaRemix) > 0);
assert.equal(scoreCandidate(loca, { ...locaRemix, trackName: "Loca" }), 0);
assert.equal(scoreCandidate({ ...loca, title: "Loca" }, locaRemix), 0);
assert.ok(isRemix("Mayores (Remix)") && isRemix("X - Bad Bunny Remix") && !isRemix("Remixed Feelings"));
assert.equal(displayTitle("Loca - Remix"), "Loca (Remix)");
assert.equal(displayTitle("Mayores (Remix)"), "Mayores (Remix)");
assert.equal(displayTitle("Tusa (feat. Nicki Minaj)"), "Tusa");

// iTunes censors some titles: "F**K THAT" is "FUCK THAT".
assert.ok(scoreCandidate({ ...track, title: "FUCK THAT", artists: ["Nicki Nicole"] }, { ...right, trackName: "F**K THAT", artistName: "Nicki Nicole" }) > 0);
assert.equal(scoreCandidate({ ...track, title: "LUCK THAT", artists: ["Nicki Nicole"] }, { ...right, trackName: "F**K THAT", artistName: "Nicki Nicole" }), 0);
// Small differences in the title still match.
assert.ok(scoreCandidate({ ...track, title: "Lo Siento BB:/" }, { ...right, trackName: "Lo Siento BB" }) > 0);

// Catalog songs are used as they are; the rest are searched once on iTunes and then remembered.
const catalog = { songs: [{ id: "bad-bunny-dakiti", title: "DÁKITI", artistName: "Bad Bunny & JHAYCO" }] };
let searches = 0;
const fetchImpl = async () => {
  searches += 1;
  return { ok: true, status: 200, json: async () => ({ results: [right] }) };
};
const resolver = new TrackResolver({ catalog, fetchImpl, searchGapMs: 0, useDb: false });
const results = new Map();
const tracks = [track, { spotifyId: "sp2", title: "Dákiti", artists: ["Bad Bunny"], durationMs: 205000 }];
await resolver.resolve(tracks, { onResult: (id, song) => results.set(id, song) });
while (resolver.running || resolver.queue.length) await new Promise((r) => setTimeout(r, 5));
assert.equal(results.get("sp2").id, "bad-bunny-dakiti");
assert.equal(results.get("sp1").id, "sp-sp1");
assert.equal(results.get("sp1").title, "Ojitos Lindos");
assert.equal(results.get("sp1").image, "https://is1-ssl.mzstatic.com/x/600x600bb.jpg");
assert.equal(searches, 1);
await resolver.resolve([track], { onResult: () => {} });
assert.equal(searches, 1, "no second search for the same song");

// A song only on another country's store: the first pass misses it, the deeper second pass finds it.
const onlyMx = async (url) => ({
  ok: true,
  status: 200,
  json: async () => ({ results: new URL(url).searchParams.get("country") === "MX" ? [{ ...right, trackName: "Hoy" }] : [] }),
});
const deepResolver = new TrackResolver({ catalog: { songs: [] }, fetchImpl: onlyMx, searchGapMs: 0, useDb: false });
const hoy = { ...track, spotifyId: "hoy", title: "Hoy" };
const got = [];
const settle = async () => {
  while (deepResolver.running || deepResolver.queue.length) await new Promise((r) => setTimeout(r, 5));
};
await deepResolver.resolve([hoy], { onResult: (id, song) => got.push(song) });
await settle();
assert.equal(got[0], null, "first pass: not found");
await deepResolver.resolve([hoy], { deep: true, onResult: (id, song) => got.push(song) });
await settle();
assert.equal(got[1]?.title, "Hoy", "second pass: found on the MX store");
// …and from then on it is known.
await deepResolver.resolve([hoy], { onResult: (id, song) => got.push(song) });
assert.equal(got[2]?.title, "Hoy");

// The first pass does a single search per song; the others wait for the second pass.
let firstPassSearches = 0;
const none = async () => (firstPassSearches += 1, { ok: true, status: 200, json: async () => ({ results: [] }) });
const quick = new TrackResolver({ catalog: { songs: [] }, fetchImpl: none, searchGapMs: 0, useDb: false });
await quick.resolve([{ ...track, spotifyId: "zz" }], { onResult: () => {} });
while (quick.running || quick.queue.length) await new Promise((r) => setTimeout(r, 5));
// The title search plus looking up each of its two artists (none exists in this fake iTunes).
assert.ok(firstPassSearches <= 3, "first pass: the title search and at most one lookup per artist");

// Songs that share an album are found through it: the artist and the album are looked up once for all of them.
const calls = [];
const albumFetch = async (url) => {
  const u = new URL(url);
  const p = Object.fromEntries(u.searchParams);
  calls.push(u.pathname + " " + (p.entity || ""));
  let results = [];
  if (u.pathname === "/search" && p.entity === "musicArtist") results = [{ artistId: 7, artistName: "Bad Bunny" }];
  if (u.pathname === "/lookup" && p.entity === "album") results = [{ wrapperType: "collection", collectionId: 70, collectionName: "Un Verano Sin Ti" }];
  if (u.pathname === "/lookup" && p.entity === "song") {
    results = [
      { wrapperType: "collection", collectionId: 70 },
      { ...right, wrapperType: "track", trackNumber: 1, trackName: "Moscow Mule", trackTimeMillis: 245000 },
      { ...right, wrapperType: "track", trackNumber: 16, trackName: "Ojitos Lindos", trackTimeMillis: 258300 },
    ];
  }
  return { ok: true, status: 200, json: async () => ({ results }) };
};
const albums = new TrackResolver({ catalog: { songs: [] }, fetchImpl: albumFetch, searchGapMs: 0, useDb: false });
const fromAlbum = new Map();
const album = { albumId: "uvst", albumName: "Un Verano Sin Ti", albumType: "album", albumArtist: "Bad Bunny" };
await albums.resolve(
  [
    { ...track, ...album, spotifyId: "mm", title: "Moscow Mule", artists: ["Bad Bunny"], durationMs: 245500, trackNumber: 1 },
    { ...track, ...album, spotifyId: "ol", trackNumber: 16 },
  ],
  { onResult: (id, song) => fromAlbum.set(id, song) }
);
while (albums.running || albums.queue.length) await new Promise((r) => setTimeout(r, 5));
assert.equal(fromAlbum.get("mm")?.title, "Moscow Mule");
assert.equal(fromAlbum.get("ol")?.title, "Ojitos Lindos");
assert.deepEqual(calls, ["/search musicArtist", "/lookup album", "/lookup song"], "one lookup each, shared by both songs");

// The playlist chosen last is searched first.
const order = [];
const lifo = new TrackResolver({ catalog: { songs: [] }, fetchImpl: none, searchGapMs: 0, useDb: false });
lifo.running = true; // hold the queue while both playlists are added
await lifo.resolve([{ ...track, spotifyId: "old1" }, { ...track, spotifyId: "old2" }], { onResult: (id) => order.push(id) });
await lifo.resolve([{ ...track, spotifyId: "new1" }], { onResult: (id) => order.push(id) });
lifo.running = false;
await lifo.run();
assert.deepEqual(order, ["new1", "old1", "old2"]);

// A failure with one song never stops the queue for the rest.
const sturdy = new TrackResolver({ catalog: { songs: [] }, fetchImpl, searchGapMs: 0, useDb: false });
const after = [];
await sturdy.resolve([{ ...track, spotifyId: "boom" }], { onResult: () => { throw new Error("falla"); } });
await sturdy.resolve([{ ...track, spotifyId: "next" }], { onResult: (id, song) => after.push(song) });
while (sturdy.running || sturdy.queue.length) await new Promise((r) => setTimeout(r, 5));
assert.equal(after[0]?.title, "Ojitos Lindos");

console.log("trackResolver.test ok");
