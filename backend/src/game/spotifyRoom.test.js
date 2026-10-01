import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// Owners come from OWNER_IDS.
process.env.OWNER_IDS = "owner";

// A resolver that answers when told to, like iTunes taking its time.
const waiting = [];
const resolver = { resolve: async (tracks, job) => waiting.push({ tracks, job }) };
const store = {
  users: {
    owner: { id: "owner", name: "Owner", email: "o@x.com", spotify: { id: "s" } },
    user: { id: "user", name: "User", email: "u@x.com", spotify: { id: "u" } },
  },
};
const mgr = new RoomManager({ catalog: readLocalCatalog(), store, resolver });
const playlist = {
  id: "abc",
  name: "Mi playlist",
  image: null,
  tracks: Array.from({ length: 6 }, (_, i) => ({ spotifyId: `t${i}`, title: `Canción ${i}`, artists: ["Artista"] })),
};
const song = (i) => ({ id: `sp-t${i}`, title: `Canción ${i}`, artistName: "Artista", previewUrl: "https://audio-ssl.itunes.apple.com/x.m4a" });

// Only an owner who is the host can add Spotify playlists.
const other = mgr.create({ host: { id: "user", name: "User", socketId: "s0" }, game: "musica" });
assert.throws(() => mgr.addSpotifyPlaylist(other, "user", playlist), /solo para owners/);
const room = mgr.create({ host: { id: "owner", name: "Owner", socketId: "s1" }, game: "musica" });
mgr.addPlayer(room, { id: "user", name: "User", socketId: "s2" });
assert.throws(() => mgr.addSpotifyPlaylist(room, "user", playlist), /Solo el host/);
// …and nobody can sneak one in through the normal settings.
mgr.updateConfig(room, "owner", { playlistIds: ["top-es", "sp:other"] });
assert.deepEqual(room.config.playlistIds, ["top-es"]);

mgr.addSpotifyPlaylist(room, "owner", playlist);
mgr.updateConfig(room, "owner", { playlistIds: ["sp:abc"], rounds: 5 });
assert.deepEqual(room.config.playlistIds, ["sp:abc"]);
assert.equal(mgr.publicState(room).customPlaylists[0].loading, true);
// The whole playlist is in the autocomplete even before it is found on iTunes.
assert.equal(mgr.buildSearchCatalog(room).filter((s) => s.id.startsWith("sp-")).length, 6);

// With only the Spotify playlist chosen, the autocomplete has only its songs; adding Inglés adds that playlist's songs.
assert.equal(mgr.buildSearchCatalog(room).length, 6);
mgr.updateConfig(room, "owner", { playlistIds: ["sp:abc", "top-en"] });
const english = mgr.catalog.playlists.find((p) => p.id === "top-en").trackIds;
const search = mgr.buildSearchCatalog(room);
assert.equal(search.length, 6 + english.length);
assert.ok(search.every((s) => s.id.startsWith("sp-") || english.includes(s.id)), "no songs from playlists not chosen");
mgr.updateConfig(room, "owner", { playlistIds: ["sp:abc"] });

// Nothing playable yet: the match can't start.
assert.throws(() => mgr.start(room, "owner"), /se están cargando/);

// Two songs found: the match starts with what there is and takes the rest as they arrive.
const { job } = waiting[0];
job.onResult("t0", song(0));
job.onResult("t1", null);
job.onResult("t2", song(2));
mgr.start(room, "owner");
assert.equal(mgr.publicState(room).totalRounds, 5);
assert.ok(room.tracks.every((t) => ["sp-t0", "sp-t2"].includes(t.id)));
assert.ok(room.tracks.length <= 3, "rounds are picked a few at a time");
for (let i = 3; i < 6; i += 1) job.onResult(`t${i}`, song(i));
const ids = new Set();
for (let r = 0; r < 5; r += 1) {
  ids.add(room.tracks[room.currentRound].id);
  if (r < 4) mgr.advance(room);
}
assert.equal(ids.size, 5, "no song repeats while there are others");
assert.equal(mgr.publicState(room).customPlaylists[0].ready, 5);
mgr.advance(room);
assert.equal(room.phase, "finished");
for (const r of [room, other]) mgr.destroy(r);

console.log("spotifyRoom.test ok");
