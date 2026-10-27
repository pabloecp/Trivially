import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "../db/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The songs, also kept in the repo so local development works without Supabase.
// `npm run catalog:upload` copies this file to the Supabase table `songs` (see backend/supabase/schema.sql).
export const LOCAL_CATALOG_PATH = path.join(__dirname, "catalog.json");

// The catalog is only songs. Its two rankings, the most-streamed songs in Spanish and in English, are worked out from
// each song's language and Spotify streams, as the playlists the rest of the code reads (difficulty is a song's third
// of its ranking; `top-es` is the default one).
const RANKINGS = [
  { id: "top-es", language: "es", name: "Most Streamed Songs on Spotify · Español", isDefault: true, what: "en español" },
  { id: "top-en", language: "en", name: "Most Streamed Songs on Spotify · Inglés", isDefault: false, what: "en inglés" },
];

export function withRankings(songs) {
  const playlists = RANKINGS.map(({ id, language, name, isDefault, what }) => {
    const trackIds = songs
      .filter((s) => (language === "es" ? s.language === "es" : s.language !== "es"))
      .sort((a, b) => (b.streams || 0) - (a.streams || 0))
      .map((s) => s.id);
    return { id, name, description: `Las ${trackIds.length} canciones ${what} más escuchadas de la historia de Spotify.`, isDefault, trackIds };
  });
  return { songs, playlists };
}

export function readLocalCatalog() {
  return withRankings(JSON.parse(fs.readFileSync(LOCAL_CATALOG_PATH, "utf8")).songs);
}

function songFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    artistName: row.artist_name,
    artists: row.artists || null,
    albumName: row.album_name,
    year: row.year,
    image: row.image,
    previewUrl: row.preview_url,
    genre: row.genre,
    language: row.language,
    itunesId: row.itunes_id,
    streams: row.streams,
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
  return withRankings((await selectAll(getSupabase(), "songs", "*", "id")).map(songFromRow));
}

/** The catalog: from Supabase when it is configured and has songs, otherwise from catalog.json. */
export async function loadCatalog() {
  if (supabaseEnabled()) {
    try {
      const catalog = await loadFromSupabase();
      if (catalog.songs.length) {
        console.log(`[Supabase] ${catalog.songs.length} canciones cargadas`);
        return catalog;
      }
      console.warn("[Supabase] No hay canciones en la base de datos; uso backend/src/catalog/catalog.json");
    } catch (err) {
      console.warn(`[Supabase] No se pudo cargar el catálogo (${err.message}); uso backend/src/catalog/catalog.json`);
    }
  }
  return readLocalCatalog();
}

export function hydrateSong(catalog, song) {
  return {
    ...song,
    artistName: song.artistName || "Artista",
    albumName: song.albumName || "",
  };
}
