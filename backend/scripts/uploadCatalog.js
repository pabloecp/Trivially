// Copies backend/src/catalog/catalog.json to the Supabase tables `songs`, `playlists` and `playlist_songs`
// (create them first with backend/supabase/schema.sql). Songs and playlists that are no longer in the file are
// deleted, so the database ends up exactly like the file.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run catalog:upload --prefix backend
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { readLocalCatalog } = await import("../src/catalog/catalogProvider.js");

if (!supabaseEnabled()) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = getSupabase();
const catalog = readLocalCatalog();
const now = new Date().toISOString();

async function run(label, query) {
  const { error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function ids(table) {
  const { data, error } = await db.from(table).select("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.map((r) => r.id);
}

const songRows = catalog.songs.map((s) => ({
  id: s.id,
  title: s.title,
  artist_name: s.artistName,
  album_name: s.albumName || null,
  year: s.year || null,
  image: s.image || null,
  preview_url: s.previewUrl,
  genre: s.genre || null,
  language: s.language || null,
  itunes_id: s.itunesId || null,
  streams: s.streams || null,
  updated_at: now,
}));
const playlistRows = catalog.playlists.map((p, i) => ({
  id: p.id,
  name: p.name,
  description: p.description || null,
  position: i,
  is_default: Boolean(p.isDefault),
  updated_at: now,
}));
const linkRows = catalog.playlists.flatMap((p) => p.trackIds.map((songId, i) => ({ playlist_id: p.id, song_id: songId, position: i + 1 })));

await run("songs", db.from("songs").upsert(songRows));
await run("playlists", db.from("playlists").upsert(playlistRows));

// Replace every playlist's track list, then drop whatever the file no longer has.
const keepPlaylists = new Set(playlistRows.map((p) => p.id));
const keepSongs = new Set(songRows.map((s) => s.id));
await run("playlist_songs (borrar)", db.from("playlist_songs").delete().neq("playlist_id", ""));
await run("playlist_songs", db.from("playlist_songs").insert(linkRows));
const stalePlaylists = (await ids("playlists")).filter((id) => !keepPlaylists.has(id));
if (stalePlaylists.length) await run("playlists (borrar)", db.from("playlists").delete().in("id", stalePlaylists));
const staleSongs = (await ids("songs")).filter((id) => !keepSongs.has(id));
for (let i = 0; i < staleSongs.length; i += 200) {
  await run("songs (borrar)", db.from("songs").delete().in("id", staleSongs.slice(i, i + 200)));
}

console.log(
  `Catálogo subido: ${songRows.length} canciones, ${playlistRows.length} playlists, ${linkRows.length} enlaces` +
    (staleSongs.length || stalePlaylists.length ? ` (borradas ${staleSongs.length} canciones y ${stalePlaylists.length} playlists)` : "")
);
