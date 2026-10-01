import assert from "node:assert/strict";
import { TrackResolver, cleanTitle, scoreCandidate } from "./trackResolver.js";

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

console.log("trackResolver.test ok");
