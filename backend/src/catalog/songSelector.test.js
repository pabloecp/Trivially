import assert from "node:assert/strict";
import { readLocalCatalog } from "./catalogProvider.js";
import { pickRoundTracks, selectSongs } from "./songSelector.js";

const catalog = readLocalCatalog();
const [first, second] = catalog.playlists;

// One playlist: exactly its songs.
const one = selectSongs(catalog, { playlistIds: [first.id] });
assert.equal(one.length, new Set(first.trackIds).size);
assert.ok(one.every((s) => first.trackIds.includes(s.id)));

// Several playlists: their union, each song once.
const both = selectSongs(catalog, { playlistIds: [first.id, second.id] });
assert.equal(both.length, new Set([...first.trackIds, ...second.trackIds]).size);

// No valid playlist: the default one.
const fallback = selectSongs(catalog, { playlistIds: ["no-existe"] });
const def = catalog.playlists.find((p) => p.isDefault);
assert.equal(fallback.length, new Set(def.trackIds).size);

// Every song can be played and every playlist has 100 of them.
assert.ok(catalog.songs.every((s) => s.id && s.title && s.artistName && s.previewUrl));
assert.ok(catalog.playlists.every((p) => p.trackIds.length === 100));
assert.equal(pickRoundTracks(catalog, { playlistIds: [first.id] }, 5).length, 5);

console.log("songSelector.test ok");
