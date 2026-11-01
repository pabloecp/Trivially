// Uploads Completa la letra's rounds from backend/private/lyric-rounds.json (made by `npm run lyrics:build`) to the
// Supabase table `lyric_rounds` (create it first with backend/supabase/schema.sql): one row per song, tied to its audio
// (preview_url, preview_etag), with only the minimum in data (null for a song that can't be a round). Rows are upserted
// by song id; nothing is deleted.
//
//   npm run lyrics:upload --prefix backend
//   npm run lyrics:upload --prefix backend -- --check     (only reads the file)
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { LYRIC_ROUNDS_FILE, LYRIC_ROUNDS_TABLE, readRoundsFile } = await import("../src/lyrics/lyricRounds.js");

const saved = readRoundsFile();
const rows = Object.entries(saved).map(([song_id, r]) => ({
  song_id,
  spotify_id: r.spotify_id || null,
  preview_url: r.preview_url,
  preview_etag: r.preview_etag || null,
  data: r.data || null,
  updated_at: new Date().toISOString(),
}));
if (!rows.length) {
  console.error(`No hay rondas en ${LYRIC_ROUNDS_FILE}. Créalas con npm run lyrics:build.`);
  process.exit(1);
}
const ready = rows.filter((r) => r.data).length;
const spotify = rows.filter((r) => r.data && r.song_id.startsWith("sp-")).length;
console.log(`${rows.length} canciones en el archivo: ${ready} listas (${spotify} de Spotify) y ${rows.length - ready} que no sirven.`);
if (process.argv.includes("--check")) process.exit(0);

if (!supabaseEnabled()) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = getSupabase();
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from(LYRIC_ROUNDS_TABLE).upsert(rows.slice(i, i + 500));
  if (error) {
    console.error(`No se pudieron subir: ${error.message}`);
    process.exit(1);
  }
}
console.log(`Subidas ${rows.length} canciones a la tabla ${LYRIC_ROUNDS_TABLE}.`);
