import { getSeedCatalog } from "./seedCatalog.js";

export async function loadCatalog() {
  return getSeedCatalog();
}

export function findArtist(catalog, id) {
  return catalog.artists.find((a) => a.id === id) || null;
}

export function findAlbum(catalog, id) {
  return catalog.albums.find((a) => a.id === id) || null;
}

export function findSong(catalog, id) {
  return catalog.songs.find((s) => s.id === id) || null;
}

export function hydrateSong(catalog, song) {
  const artist = findArtist(catalog, song.artistId);
  const album = findAlbum(catalog, song.albumId);
  return {
    ...song,
    artistName: song.artistName || artist?.name || "Artista",
    albumName: song.albumName || album?.name || "Álbum",
  };
}
