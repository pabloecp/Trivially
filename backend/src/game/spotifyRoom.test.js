import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// Owners come from OWNER_IDS.
process.env.OWNER_IDS = "owner,owner2";

// A resolver that answers when told to, like iTunes taking its time.
const waiting = [];
const resolver = { resolve: async (tracks, job) => waiting.push({ tracks, job }) };
const store = {
  users: {
    owner: { id: "owner", name: "Owner", email: "o@x.com", spotify: { id: "s" } },
    user: { id: "user", name: "User", email: "u@x.com", spotify: { id: "u" } },
    owner2: { id: "owner2", name: "Owner 2", email: "o2@x.com", spotify: { id: "s2" } },
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

// Only owners who may change the settings (the host, or with the host's permission) can add Spotify playlists.
const other = mgr.create({ host: { id: "user", name: "User", socketId: "s0" }, game: "musica" });
assert.throws(() => mgr.addSpotifyPlaylist(other, "user", playlist), /solo para owners/);
const room = mgr.create({ host: { id: "owner", name: "Owner", socketId: "s1" }, game: "musica" });
mgr.addPlayer(room, { id: "user", name: "User", socketId: "s2" });
assert.throws(() => mgr.addSpotifyPlaylist(room, "user", playlist), /Necesitas permiso/);
mgr.addPlayer(room, { id: "owner2", name: "Owner 2", socketId: "s3" });
assert.throws(() => mgr.addSpotifyPlaylist(room, "owner2", playlist), /Necesitas permiso/, "an owner without permission can't");
mgr.toggleConfigPermission(room, "owner", "owner2");
mgr.addSpotifyPlaylist(room, "owner2", { ...playlist, id: "fromOwner2" });
assert.ok(room.config.playlistIds.includes("sp:fromOwner2"), "an owner with permission can");
mgr.toggleConfigPermission(room, "owner", "user");
assert.throws(() => mgr.addSpotifyPlaylist(room, "user", playlist), /solo para owners/, "permission alone isn't enough");
waiting.length = 0;
// …and nobody can sneak one in through the normal settings.
mgr.updateConfig(room, "owner", { playlistIds: ["top-es", "sp:other"] });
assert.deepEqual(room.config.playlistIds, ["top-es"]);

mgr.addSpotifyPlaylist(room, "owner", playlist);
mgr.updateConfig(room, "owner", { playlistIds: ["sp:abc"], rounds: 5 });
assert.deepEqual(room.config.playlistIds, ["sp:abc"]);
assert.equal(mgr.publicState(room).customPlaylists.find((p) => p.id === "sp:abc").loading, true);
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

// Two songs found: not enough for 5 rounds (the same songs would keep coming back), so it can't start yet.
const { job } = waiting[0];
job.onResult("t0", song(0));
job.onResult("t1", null);
job.onResult("t2", song(2));
assert.equal(mgr.publicState(room).songsReady, 2);
assert.throws(() => mgr.start(room, "owner"), /Solo hay 2 canciones listas para 5 rondas/);

// With one song per round it starts; rounds are picked a few at a time.
for (let i = 3; i < 6; i += 1) job.onResult(`t${i}`, song(i));
mgr.start(room, "owner");
assert.equal(mgr.publicState(room).totalRounds, 5);
assert.ok(room.tracks.length <= 3, "rounds are picked a few at a time");
const ids = new Set();
for (let r = 0; r < 5; r += 1) {
  ids.add(room.tracks[room.currentRound].id);
  if (r < 4) mgr.advance(room);
}
assert.equal(ids.size, 5, "no song repeats while there are others");
assert.equal(mgr.publicState(room).customPlaylists.find((p) => p.id === "sp:abc").ready, 5);
mgr.advance(room);
assert.equal(room.phase, "finished");
for (const r of [room, other]) mgr.destroy(r);

// When every song was searched once, the ones not found (t1) get a second, deeper search.
const deepCall = waiting.find((w) => w.job.deep);
assert.ok(deepCall, "second pass started");
assert.deepEqual(deepCall.tracks.map((t) => t.spotifyId), ["t1"]);
assert.equal(mgr.publicState(room).customPlaylists.find((p) => p.id === "sp:abc").loading, true, "still loading during the second pass");
deepCall.job.onResult("t1", song(1));
assert.equal(mgr.publicState(room).customPlaylists.find((p) => p.id === "sp:abc").ready, 6);
assert.equal(mgr.publicState(room).customPlaylists.find((p) => p.id === "sp:abc").loading, false);

// Only selected playlists load: unselecting one drops its pending searches, selecting it again resumes them.
waiting.length = 0;
const lobby = mgr.create({ host: { id: "owner", name: "Owner", socketId: "s5" }, game: "musica" });
const one = { ...playlist, id: "one" };
const two = { ...playlist, id: "two", tracks: playlist.tracks.map((t) => ({ ...t, spotifyId: `two-${t.spotifyId}` })) };
mgr.addSpotifyPlaylist(lobby, "owner", one);
mgr.addSpotifyPlaylist(lobby, "owner", two);
assert.equal(waiting.length, 2);
mgr.updateConfig(lobby, "owner", { playlistIds: ["sp:two"] });
assert.equal(waiting[0].job.isCancelled(), true, "playlist 1 stops loading");
assert.equal(waiting[1].job.isCancelled(), false, "playlist 2 keeps loading");
waiting[0].job.onResult("t0", song(0));
mgr.updateConfig(lobby, "owner", { playlistIds: ["sp:two", "sp:one"] });
assert.equal(waiting.length, 3, "playlist 1 starts loading again");
assert.equal(waiting[2].tracks.length, 5, "only the songs it didn't have yet");
assert.equal(waiting[2].job.isCancelled(), false);
mgr.destroy(lobby);

console.log("spotifyRoom.test ok");
