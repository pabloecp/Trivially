// Copies backend/src/catalog/catalog.json to the Supabase table `songs` (create it first with
// backend/supabase/schema.sql). Songs that are no longer in the file are deleted, so the database ends up exactly like
// the file. The rankings (and so the difficulty) come from each song's language and streams; there are no playlists.
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

// Every id in a table, a page at a time (Supabase returns at most 1,000 rows per query).
async function ids(table) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("id").order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...data.map((r) => r.id));
    if (data.length < 1000) return all;
  }
}

const songRows = catalog.songs.map((s) => ({
  id: s.id,
  title: s.title,
  artist_name: s.artistName,
  artists: s.artists || null,
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
await run("songs", db.from("songs").upsert(songRows));

// Drop whatever the file no longer has.
const keepSongs = new Set(songRows.map((s) => s.id));
const staleSongs = (await ids("songs")).filter((id) => !keepSongs.has(id));
for (let i = 0; i < staleSongs.length; i += 200) {
  await run("songs (borrar)", db.from("songs").delete().in("id", staleSongs.slice(i, i + 200)));
}

console.log(`Catálogo subido: ${songRows.length} canciones` + (staleSongs.length ? ` (borradas ${staleSongs.length})` : ""));
