// Uploads Completa la letra's rounds from backend/private/lyric-rounds.json (made by `npm run lyrics:build`) to the
// Supabase table `lyric_rounds` (create it first with backend/supabase/schema.sql): one row per song, tied to its audio
// (preview_url, preview_etag), with only the minimum in data (null for a song that can't be a round). Only the songs
// new or changed since the table's copy go up (with `--all`, every one), so the server re-reads only those; rows are
// upserted by song id and nothing is deleted. Wrong options already corrected in the table (`wrongChecked`, written by hand to fit
// the line) are kept when the file has the same round (same answer and cut): the file's are made by the build and
// often make no sense in the sentence. Then the songs of `lyric_queue` uploaded with the same audio leave the queue.
//
//   npm run lyrics:upload --prefix backend
//   npm run lyrics:upload --prefix backend -- --check     (only reads the file)
//   npm run lyrics:upload --prefix backend -- --all       (every song of the file, changed or not)
//
// At the end it says which rounds still have their wrong options unchecked (they play only with Abiertas until then)
// and writes them all to backend/private/lyrics-por-revisar.txt. Checking one: in lyric-rounds.json, rewrite its
// "wrong" so the three fit the line and add "wrongChecked": true; then upload again.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { LYRIC_ROUNDS_FILE, LYRIC_ROUNDS_TABLE, readRoundsFile, rowsToUpload } = await import("../src/lyrics/lyricRounds.js");

const saved = readRoundsFile();
const rows = Object.entries(saved).map(([song_id, r]) => ({
  song_id,
  spotify_id: r.spotify_id || null,
  preview_url: r.preview_url,
  preview_etag: r.preview_etag || null,
  data: r.data || null,
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
const checked = new Map();
// The table as it is: to keep the options already corrected there, and to upload only what differs.
const table = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from(LYRIC_ROUNDS_TABLE)
    .select("song_id, spotify_id, preview_url, preview_etag, data")
    .order("song_id", { ascending: true })
    .range(from, from + 999);
  if (error) {
    console.error(`No se pudo leer la tabla ${LYRIC_ROUNDS_TABLE}: ${error.message}`);
    process.exit(1);
  }
  for (const r of data) {
    table.set(r.song_id, r);
    if (r.data?.wrongChecked) checked.set(r.song_id, r.data);
  }
  if (data.length < 1000) break;
}
let kept = 0;
for (const row of rows) {
  const before = checked.get(row.song_id);
  if (!row.data || !before || before.answer !== row.data.answer || before.cut !== row.data.cut) continue;
  row.data = { ...row.data, wrong: before.wrong, wrongChecked: true };
  kept += 1;
}
if (kept) console.log(`${kept} canciones conservan las opciones incorrectas ya corregidas en la tabla.`);
const all = process.argv.includes("--all");
const diff = all ? { rows, added: 0, changed: 0, same: 0 } : rowsToUpload(rows, table);
// They all get this moment as their `updated_at`: the server reads the rows changed after the newest it read.
const now = new Date().toISOString();
const toSend = diff.rows.map((r) => ({ ...r, updated_at: now }));
for (let i = 0; i < toSend.length; i += 500) {
  const { error } = await db.from(LYRIC_ROUNDS_TABLE).upsert(toSend.slice(i, i + 500));
  if (error) {
    console.error(`No se pudieron subir: ${error.message}`);
    process.exit(1);
  }
}
console.log(
  all
    ? `Subidas las ${toSend.length} canciones del archivo a la tabla ${LYRIC_ROUNDS_TABLE}.`
    : toSend.length
      ? `Subidas ${toSend.length} canciones (${diff.added} nuevas, ${diff.changed} cambiadas); ${diff.same} ya estaban igual.`
      : `No hay nada nuevo que subir: las ${diff.same} canciones ya estaban igual en la tabla.`
);

// The songs of the queue now in the table with the same audio (ready or left out) leave it (lyrics/lyricQueue.js).
const { LYRIC_QUEUE_TABLE } = await import("../src/lyrics/lyricQueue.js");
const uploaded = new Map(rows.map((r) => [r.song_id, r.preview_url]));
const { data: waiting, error: queueError } = await db.from(LYRIC_QUEUE_TABLE).select("song_id, preview_url");
if (queueError) {
  console.warn(`No se pudo leer la cola ${LYRIC_QUEUE_TABLE}: ${queueError.message}`);
} else {
  const done = waiting.filter((q) => uploaded.get(q.song_id) === q.preview_url).map((q) => q.song_id);
  for (let i = 0; i < done.length; i += 200) {
    const { error } = await db.from(LYRIC_QUEUE_TABLE).delete().in("song_id", done.slice(i, i + 200));
    if (error) {
      console.warn(`No se pudieron quitar de la cola: ${error.message}`);
      break;
    }
  }
  console.log(`${done.length} canciones salen de la cola; quedan ${waiting.length - done.length} esperando.`);
}

// ---- What's left to check ----
// Rounds whose three wrong options nobody checked (the build proposes rhymes that often don't fit the sentence): they
// play only with Abiertas until they are. Newest first, so the ones just made come first.
const uploadedData = new Map(rows.map((row) => [row.song_id, row.data]));
const unchecked = Object.entries(saved)
  .filter(([id, r]) => r?.data && !uploadedData.get(id)?.wrongChecked)
  .sort(([, a], [, b]) => String(b.built || "").localeCompare(String(a.built || "")));
const REVIEW_FILE = path.resolve(__dirname, "../private/lyrics-por-revisar.txt");
if (!unchecked.length) {
  fs.rmSync(REVIEW_FILE, { force: true });
  console.log("\nNo te falta ninguna por revisar: todas las rondas tienen sus opciones de Cerradas revisadas.");
} else {
  const lineOf = ([id, r]) => `${id}  «${String(r.data.lines.at(-1).text)}» → ${r.data.answer}  (incorrectas: ${(r.data.wrong || []).join(", ")})`;
  fs.writeFileSync(REVIEW_FILE, `${unchecked.map(lineOf).join("\n")}\n`);
  console.log(`\nTe faltan ${unchecked.length} canciones por revisar: solo salen con Abiertas hasta que sus opciones de Cerradas estén revisadas.`);
  for (const entry of unchecked.slice(0, 15)) console.log(`  ${lineOf(entry)}`);
  if (unchecked.length > 15) console.log(`  … y ${unchecked.length - 15} más.`);
  console.log(`La lista completa está en ${path.relative(process.cwd(), REVIEW_FILE)}.`);
  console.log(`Para revisar una: en ${path.relative(process.cwd(), LYRIC_ROUNDS_FILE)} cambia su "wrong" para que las tres tengan sentido en la frase, agrega "wrongChecked": true y vuelve a correr npm run lyrics:upload.`);
}
