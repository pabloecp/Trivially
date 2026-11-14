// Copies Trivia's questions in English (backend/private/questions.en.json, outside the repo like the Spanish ones) to
// the `questions` table, next to their originals: one row per question with `language: "en"`, `active: false` (they are
// only read to show the question to English players, so they never come up as questions of their own) and
// `data.translation_of` with the id of the Spanish row. Same options in the same order and the same `correct`.
//
// Each entry of the file: { "of": "<id of the Spanish question>", "prompt": "…", "data": { "options": ["…", "…", "…", "…"],
// "aliases": ["…"] } } (open questions: "answer", "aliases", "reject"). Uploading again updates the same rows.
//
//   npm run questions:upload-en --prefix backend
//   npm run questions:upload-en --prefix backend -- --check     (only validates)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "../src/db/store.js";
import { stableId } from "../src/geo/geoQuestions.js";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../private/questions.en.json");
const checkOnly = process.argv.includes("--check");
if (!fs.existsSync(file)) {
  console.error(`No existe ${file}`);
  process.exit(1);
}
const entries = JSON.parse(fs.readFileSync(file, "utf8"));
if (!supabaseEnabled()) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = getSupabase();

// The Spanish rows these translate.
const originals = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("questions").select("id, type, mode, category, difficulty, data").neq("language", "en").range(from, from + 999);
  if (error) {
    console.error(`No se pudieron leer las preguntas: ${error.message}`);
    process.exit(1);
  }
  for (const row of data) originals.set(row.id, row);
  if (data.length < 1000) break;
}

const records = [];
const problems = [];
for (const e of entries) {
  const es = originals.get(e.of);
  if (!es) {
    problems.push(`${e.of}: no hay pregunta en español con ese id`);
    continue;
  }
  const options = e.data?.options;
  if (es.type === "multiple_choice" && !(Array.isArray(options) && options.length === es.data.options.length && options.every((o) => typeof o === "string" && o.trim()))) {
    problems.push(`${e.of}: las opciones deben ser ${es.data.options.length} textos`);
    continue;
  }
  if (typeof e.prompt !== "string" || !e.prompt.trim()) {
    problems.push(`${e.of}: falta el texto`);
    continue;
  }
  records.push({
    id: stableId(`en:${e.of}`),
    type: es.type,
    mode: es.mode,
    category: es.category,
    difficulty: es.difficulty,
    language: "en",
    prompt: e.prompt.trim(),
    data: { ...e.data, ...(es.type === "multiple_choice" ? { correct: es.data.correct } : {}), translation_of: e.of },
    active: false,
  });
}
console.log(`${records.length} traducciones válidas de ${entries.length}`);
for (const p of problems.slice(0, 20)) console.warn(`  ${p}`);
if (problems.length) {
  console.error(`${problems.length} con problemas: no se sube nada.`);
  process.exit(1);
}
if (checkOnly) process.exit(0);
for (let i = 0; i < records.length; i += 500) {
  const { error } = await db.from("questions").upsert(records.slice(i, i + 500));
  if (error) {
    console.error(`No se pudieron subir las traducciones: ${error.message}`);
    process.exit(1);
  }
}
console.log("Listo: filas language=en, active=false.");
