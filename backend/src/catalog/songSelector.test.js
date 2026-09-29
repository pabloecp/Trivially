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
  yearFrom: 2020,
  yearTo: 2026,
});
assert.ok(combo.length > 0 && combo.every((s) => s.artistId === "bad-bunny" && s.year >= 2020 && s.year <= 2026));

const firstAlbum = catalog.albums[0];
if (firstAlbum) {
  const albumSongs = selectSongs(catalog, {
    enabledCategories: ["album"],
    albumIds: [firstAlbum.id],
  });
  assert.ok(albumSongs.every((s) => s.albumId === firstAlbum.id));
}

console.log("songSelector.test ok");
