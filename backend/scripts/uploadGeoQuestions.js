// Copies Geografía's questions (capitals, flags and locations, built from backend/src/geo/countries.js) to the
// Supabase table `questions`, as rows with mode "mundo". Their ids come from the kind and the country, so running it
// again updates the same rows; rows of mode "mundo" that the list no longer has are deleted. Questions of other modes
// (backend/private/questions.json, `npm run questions:upload`) are never touched.
//
//   npm run geo:upload --prefix backend
//   npm run geo:upload --prefix backend -- --check     (only validates and counts)
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { buildGeoQuestions, GEO_KINDS, GEO_MODE } = await import("../src/geo/geoQuestions.js");
const { questionErrors } = await import("../src/questions/questionSchema.js");
const { hasCountry } = await import("../src/geo/worldMap.js");

const checkOnly = process.argv.includes("--check");
const rows = buildGeoQuestions();

// Validate everything first: nothing is uploaded if any question is wrong.
const problems = [];
for (const q of rows) {
  const errors = questionErrors(q);
  for (const name of q.data.map || []) if (!hasCountry(name)) errors.push(`el mapa no tiene "${name}"`);
  if (errors.length) problems.push(`  ${q.prompt} (${q.data.country}): ${errors.join("; ")}`);
}
if (problems.length) {
  console.error(`Hay ${problems.length} preguntas con errores; no se sube nada:\n${problems.join("\n")}`);
  process.exit(1);
}

const KIND_NAMES = { capital: "Capitales", flag: "Banderas", location: "Ubicación" };
console.log(`${rows.length} preguntas de Geografía válidas`);
for (const kind of GEO_KINDS) {
  const count = (difficulty) => rows.filter((q) => q.data.kind === kind && q.difficulty === difficulty).length;
  console.log(`  ${KIND_NAMES[kind].padEnd(10)} fácil ${count("facil")}  media ${count("media")}  difícil ${count("dificil")}`);
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
    console.error(`No se pudieron subir las preguntas: ${error.message}`);
    if (/questions_type_check/.test(error.message)) {
      console.error(
        "La tabla aún no acepta el tipo 'location'. Ejecuta en Supabase -> SQL Editor:\n" +
          "  alter table public.questions drop constraint if exists questions_type_check;\n" +
          "  alter table public.questions add constraint questions_type_check\n" +
          "    check (type in ('multiple_choice', 'open', 'true_false', 'audio', 'location'));"
      );
    }
    process.exit(1);
  }
}

// Geografía rows the list no longer has (a country removed, a kind turned off): deleted.
const ids = new Set(rows.map((q) => q.id));
const stale = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("questions").select("id").eq("mode", GEO_MODE).range(from, from + 999);
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
    console.error(`No se pudieron borrar las preguntas que sobran: ${error.message}`);
    process.exit(1);
  }
}

console.log(`Subidas ${rows.length} preguntas de Geografía.${stale.length ? ` Borradas ${stale.length} que ya no estaban.` : ""}`);
