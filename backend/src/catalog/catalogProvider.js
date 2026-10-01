import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "../db/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The songs and playlists, also kept in the repo so local development works without Supabase.
// `npm run catalog:upload` copies this file to the Supabase tables (see backend/supabase/schema.sql).
export const LOCAL_CATALOG_PATH = path.join(__dirname, "catalog.json");

export function readLocalCatalog() {
  return JSON.parse(fs.readFileSync(LOCAL_CATALOG_PATH, "utf8"));
}

function songFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    artistName: row.artist_name,
    albumName: row.album_name,
    year: row.year,
    image: row.image,
    previewUrl: row.preview_url,
    genre: row.genre,
    language: row.language,
  };
}

async function selectAll(db, table, columns, order) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from(table).select(columns).order(order).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function loadFromSupabase() {
  const db = getSupabase();
  const [songs, playlists, links] = await Promise.all([
    selectAll(db, "songs", "*", "id"),
    selectAll(db, "playlists", "*", "position"),
    selectAll(db, "playlist_songs", "playlist_id, song_id, position", "position"),
  ]);
  return {
    songs: songs.map(songFromRow),
    playlists: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isDefault: p.is_default,
      trackIds: links.filter((l) => l.playlist_id === p.id).map((l) => l.song_id),
    })),
  };
}

/** The catalog: from Supabase when it is configured and has playlists, otherwise from catalog.json. */
export async function loadCatalog() {
  if (supabaseEnabled()) {
    try {
      const catalog = await loadFromSupabase();
      if (catalog.playlists.length) {
        console.log(`[Supabase] ${catalog.songs.length} canciones y ${catalog.playlists.length} playlists cargadas`);
        return catalog;
      }
      console.warn("[Supabase] No hay playlists en la base de datos; uso backend/src/catalog/catalog.json");
    } catch (err) {
      console.warn(`[Supabase] No se pudo cargar el catálogo (${err.message}); uso backend/src/catalog/catalog.json`);
    }
  }
  return readLocalCatalog();
}

export function findSong(catalog, id) {
  return catalog.songs.find((s) => s.id === id) || null;
}

export function hydrateSong(catalog, song) {
  return {
    ...song,
    artistName: song.artistName || "Artista",
    albumName: song.albumName || "",
  };
}
