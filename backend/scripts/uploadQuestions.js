// Copies the private question bank (backend/private/questions.json, never committed: the repo is public) to the
// Supabase table `questions` (create it first with backend/supabase/schema.sql). Questions are upserted by id;
// a question without an id gets one here, written back into the file so the next upload updates it instead of
// adding a copy. Questions that are only in the database are kept and listed; pass --prune to delete them.
// Geografía's questions (mode "mundo") are uploaded by `npm run geo:upload` instead, and Historia's (mode
// "historia") by `npm run history:upload`; both are left alone here.
//
//   npm run questions:upload --prefix backend
//   npm run questions:upload --prefix backend -- --prune
//   npm run questions:upload --prefix backend -- --check     (only validates the file)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { PRIVATE_QUESTIONS_PATH, readPrivateQuestions } = await import("../src/questions/questionBank.js");
const { QUESTION_CATEGORIES, questionErrors } = await import("../src/questions/questionSchema.js");

const args = process.argv.slice(2);
const prune = args.includes("--prune");
const checkOnly = args.includes("--check");
const file = args.find((a) => !a.startsWith("--")) || PRIVATE_QUESTIONS_PATH;

const rows = readPrivateQuestions(file);
if (!rows) {
  console.error(`No existe ${file}. Crea ese archivo con la lista de preguntas (está en .gitignore).`);
  process.exit(1);
}

// Validate everything first: nothing is uploaded if any question is wrong.
const problems = [];
const prompts = new Map();
rows.forEach((q, i) => {
  const errors = questionErrors(q);
  if (q.id != null && typeof q.id !== "string") errors.push("id debe ser texto (uuid)");
  const key = `${q.language}|${String(q.prompt || "").trim().toLowerCase()}`;
  if (prompts.has(key)) errors.push(`enunciado repetido (igual que la pregunta ${prompts.get(key) + 1})`);
  else prompts.set(key, i);
  if (errors.length) problems.push(`  ${i + 1}. ${q.prompt || "(sin enunciado)"}: ${errors.join("; ")}`);
});
if (problems.length) {
  console.error(`Hay ${problems.length} preguntas con errores; no se sube nada:\n${problems.join("\n")}`);
  process.exit(1);
}

// Summary per category and difficulty.
const counts = {};
for (const q of rows) {
  counts[q.category] ||= { facil: 0, media: 0, dificil: 0 };
  counts[q.category][q.difficulty] += 1;
}
console.log(`${rows.length} preguntas válidas en ${path.relative(process.cwd(), file)}`);
for (const [id, name] of Object.entries(QUESTION_CATEGORIES)) {
  const c = counts[id] || { facil: 0, media: 0, dificil: 0 };
  console.log(`  ${name.padEnd(20)} fácil ${c.facil}  media ${c.media}  difícil ${c.dificil}`);
}
if (checkOnly) process.exit(0);

if (!supabaseEnabled()) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

// Questions without an id get one, saved back into the file.
let added = 0;
for (const q of rows) {
  if (!q.id) {
    q.id = crypto.randomUUID();
    added += 1;
  }
}
if (added) {
  fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`${added} preguntas nuevas recibieron un id (guardado en el archivo)`);
}

const db = getSupabase();
const records = rows.map((q) => ({
  id: q.id,
  type: q.type,
  mode: q.mode ?? null,
  category: q.category,
  difficulty: q.difficulty,
  language: q.language,
  prompt: q.prompt.trim(),
  data: q.data,
  active: q.active !== false,
}));
for (let i = 0; i < records.length; i += 500) {
  const { error } = await db.from("questions").upsert(records.slice(i, i + 500));
  if (error) {
    console.error(`No se pudieron subir las preguntas: ${error.message}`);
    process.exit(1);
  }
}

// What the database has that the file doesn't. Geografía's rows (mode "mundo") belong to `npm run geo:upload`, and
// Historia's (mode "historia") to `npm run history:upload`.
const OWN_SCRIPT_MODES = ["mundo", "historia"];
const inFile = new Set(records.map((r) => r.id));
const extra = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("questions").select("id, mode").range(from, from + 999);
  if (error) {
    console.error(`No se pudo comparar con la base de datos: ${error.message}`);
    process.exit(1);
  }
  extra.push(...data.filter((r) => !OWN_SCRIPT_MODES.includes(r.mode) && !inFile.has(r.id)).map((r) => r.id));
  if (data.length < 1000) break;
}
if (extra.length && prune) {
  for (let i = 0; i < extra.length; i += 200) {
    const { error } = await db.from("questions").delete().in("id", extra.slice(i, i + 200));
    if (error) {
      console.error(`No se pudieron borrar las preguntas que sobran: ${error.message}`);
      process.exit(1);
    }
  }
}

console.log(
  `Subidas ${records.length} preguntas.` +
    (extra.length
      ? prune
        ? ` Borradas ${extra.length} que ya no estaban en el archivo.`
        : ` La base de datos tiene ${extra.length} que no están en el archivo (usa --prune para borrarlas).`
      : "")
);
