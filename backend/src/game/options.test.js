import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

const catalog = readLocalCatalog();
const manager = new RoomManager({ catalog, store: { users: {} } });

// Build search catalog for autocomplete
const searchList = manager.buildSearchCatalog();

// Must contain all catalog songs
assert.ok(searchList.length >= catalog.songs.length, "Search catalog must contain songs");

// Every item must have id, title, and artistName for autocomplete
searchList.forEach((song) => {
  assert.ok(song.id, "Song must have id");
  assert.ok(song.title && song.title.trim(), "Song must have title");
  assert.ok(song.artistName && song.artistName.trim(), "Song must have artistName");
});

// Unique IDs
const ids = new Set(searchList.map((s) => s.id));
assert.equal(ids.size, searchList.length, "All songs in search catalog must have unique IDs");

console.log("searchCatalog.test ok");

// A song that plays but isn't in the global list (a custom track, a lyric song) still reaches the search box.
const stray = { id: "stray-song", title: "Cancion Que No Esta", artistName: "Nadie" };
const extras = manager.roomSearchExtras({ game: "musica", tracks: [stray, catalog.songs[0]], config: {} });
assert.ok(extras.some((s) => s.id === "stray-song"), "A playing song outside the global list must be in the extras");
assert.ok(!extras.some((s) => s.id === catalog.songs[0].id), "A song already in the global list is not repeated");
console.log("roomSearchExtras ok");
