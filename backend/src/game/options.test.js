import assert from "node:assert/strict";
import { getSeedCatalog } from "../catalog/seedCatalog.js";
import { RoomManager } from "./roomManager.js";

const catalog = getSeedCatalog();
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
