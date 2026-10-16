import assert from "node:assert/strict";
import { forgetSpotifyLink, sanitizeUserPublic, saveSpotifyLink, savedSpotifyLinks } from "./store.js";

// The Spotify playlists and albums an account added with their link stay on it ("Mis playlists").
const store = {
  users: {
    acc: { id: "acc", name: "Pablo", email: "p@x.com" },
    gst_1: { id: "gst_1", name: "Invitado", isGuest: true },
  },
};
const a = "5KA5qtQU9zuaXpOeskKe3b";
const b = "0Pr7tJefVMQCh8hy1n8OLr";

assert.deepEqual(savedSpotifyLinks(store, "acc"), []);
saveSpotifyLink(store, "acc", { kind: "playlist", id: a, name: "Reggaeton", image: "https://i/1", total: 100 });
let list = saveSpotifyLink(store, "acc", { kind: "album", id: b, name: "Corridos Tumbados", total: 21 });
assert.deepEqual(list.map((s) => s.key), [`album:${b}`, `playlist:${a}`], "newest first");
assert.equal(list[1].name, "Reggaeton");
assert.equal(list[1].total, 100);

// Adding one again doesn't repeat it: it moves to the top with its new name.
list = saveSpotifyLink(store, "acc", { kind: "playlist", id: a, name: "Reggaeton 2026" });
assert.deepEqual(list.map((s) => s.key), [`playlist:${a}`, `album:${b}`]);
assert.equal(list[0].name, "Reggaeton 2026");

// Only real playlists and albums.
assert.equal(saveSpotifyLink(store, "acc", { kind: "artist", id: a, name: "X" }), null);
assert.equal(saveSpotifyLink(store, "acc", { kind: "playlist", id: "nope", name: "X" }), null);
assert.equal(savedSpotifyLinks(store, "acc").length, 2);

// A guest (or nobody) keeps nothing.
assert.equal(saveSpotifyLink(store, "gst_1", { kind: "playlist", id: a, name: "X" }), null);
assert.deepEqual(savedSpotifyLinks(store, "gst_1"), []);
assert.deepEqual(savedSpotifyLinks(store, "nadie"), []);
assert.throws(() => forgetSpotifyLink(store, "gst_1", `playlist:${a}`), /cuenta/);

// Deleted for good.
assert.deepEqual(forgetSpotifyLink(store, "acc", `playlist:${a}`).map((s) => s.key), [`album:${b}`]);
assert.deepEqual(savedSpotifyLinks(store, "acc").map((s) => s.key), [`album:${b}`]);

// Never on the public profile.
assert.equal(sanitizeUserPublic(store.users.acc).savedSpotify, undefined);

// At most 60, the oldest dropped.
for (let i = 0; i < 70; i += 1) saveSpotifyLink(store, "acc", { kind: "playlist", id: `${String(i).padStart(2, "0")}${"x".repeat(20)}`, name: `P${i}` });
assert.equal(savedSpotifyLinks(store, "acc").length, 60);
assert.equal(savedSpotifyLinks(store, "acc")[0].name, "P69");

console.log("savedSpotify.test ok");
