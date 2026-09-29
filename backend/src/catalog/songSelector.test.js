import assert from "node:assert/strict";
import { getSeedCatalog } from "../catalog/seedCatalog.js";
import { selectSongs } from "./songSelector.js";

const catalog = getSeedCatalog();

const mora = selectSongs(catalog, {
  enabledCategories: ["artist"],
  artistIds: ["mora"],
});
assert.ok(mora.length && mora.every((s) => s.artistId === "mora"));

const combo = selectSongs(catalog, {
  enabledCategories: ["genre", "artist", "year"],
  genreIds: ["reggaeton"],
  artistIds: ["bad-bunny"],
  yearFrom: 2022,
  yearTo: 2025,
});
assert.ok(combo.every((s) => s.artistId === "bad-bunny" && s.year >= 2022 && s.year <= 2025));
assert.ok(combo.some((s) => s.id === "bb-neverita"));
assert.ok(!combo.some((s) => s.id === "bb-si-veo"));

const album = selectSongs(catalog, {
  enabledCategories: ["album"],
  albumIds: ["estrella"],
});
assert.ok(album.every((s) => s.albumId === "estrella"));

const playlist = selectSongs(catalog, {
  enabledCategories: ["playlist"],
  playlistIds: ["mora-essentials"],
});
assert.equal(playlist.length, 5);

console.log("songSelector.test ok");
