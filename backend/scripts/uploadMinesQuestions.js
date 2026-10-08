// Copies Campo de minas' boards (backend/src/mines/boards/) to the Supabase table `questions`, as rows with mode
// "minas" and type "minefield". Their ids come from each board's prompt, so running it again updates the same rows;
// rows of mode "minas" that the boards no longer have are deleted. Questions of other modes are never touched.
//
//   npm run mines:upload --prefix backend
//   npm run mines:upload --prefix backend -- --check     (only validates and counts)
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { buildMinesQuestions, MINES_MODE } = await import("../src/mines/minesQuestions.js");
const { QUESTION_CATEGORIES, questionErrors } = await import("../src/questions/questionSchema.js");

const checkOnly = process.argv.includes("--check");
const rows = buildMinesQuestions();

// Validate everything first: nothing is uploaded if any board is wrong.
const problems = [];
const ids = new Set();
for (const q of rows) {
  const errors = questionErrors(q);
  if (ids.has(q.id)) errors.push("tablero repetido");
  ids.add(q.id);
  if (errors.length) problems.push(`  ${q.prompt}: ${errors.join("; ")}`);
}
if (problems.length) {
  console.error(`Hay ${problems.length} tableros con errores; no se sube nada:\n${problems.join("\n")}`);
  process.exit(1);
}

console.log(`${rows.length} tableros de Campo de minas válidos`);
for (const [id, name] of Object.entries(QUESTION_CATEGORIES)) {
  const count = (difficulty) => rows.filter((q) => q.category === id && q.difficulty === difficulty).length;
  console.log(`  ${name.padEnd(20)} fácil ${count("facil")}  media ${count("media")}  difícil ${count("dificil")}`);
}
if (checkOnly) process.exit(0);

if (!supabaseEnabled()) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = getSupabase();
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from("questions").upsert(rows.slice(i, i + 500));
  if (error) {
    console.error(`No se pudieron subir los tableros: ${error.message}`);
    if (/questions_type_check/.test(error.message)) {
      console.error(
        "La tabla aún no acepta el tipo 'minefield'. Ejecuta en Supabase -> SQL Editor:\n" +
          "  alter table public.questions drop constraint if exists questions_type_check;\n" +
          "  alter table public.questions add constraint questions_type_check\n" +
          "    check (type in ('multiple_choice', 'open', 'true_false', 'audio', 'location', 'year', 'minefield'));"
      );
    }
    process.exit(1);
  }
}

// Campo de minas rows the boards no longer have (a board removed or its prompt reworded): deleted.
const stale = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("questions").select("id").eq("mode", MINES_MODE).range(from, from + 999);
  if (error) {
    console.error(`No se pudo comparar con la base de datos: ${error.message}`);
    process.exit(1);
  }
  stale.push(...data.map((r) => r.id).filter((id) => !ids.has(id)));
  if (data.length < 1000) break;
}
for (let i = 0; i < stale.length; i += 200) {
  const { error } = await db.from("questions").delete().in("id", stale.slice(i, i + 200));
  if (error) {
    console.error(`No se pudieron borrar los tableros que sobran: ${error.message}`);
    process.exit(1);
  }
}

console.log(`Subidos ${rows.length} tableros de Campo de minas.${stale.length ? ` Borrados ${stale.length} que ya no estaban.` : ""}`);
