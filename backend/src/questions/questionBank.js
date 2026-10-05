import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "../db/store.js";
import { questionErrors, toQuestion } from "./questionSchema.js";
import { sampleQuestions } from "./sampleQuestions.js";

// The question bank of the trivia modes. The real questions never live in the repo (it is public): they are in the
// Supabase table `questions` (backend/supabase/schema.sql), which only the backend can read, and in the private,
// git-ignored file below that `npm run questions:upload` copies there. Without either, the game uses a few
// placeholder questions so local development still works.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PRIVATE_QUESTIONS_PATH = path.resolve(__dirname, "../../private/questions.json");

/** Keeps the valid, active questions and warns about the rest. */
function usable(rows, source) {
  const out = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.active === false) continue;
    const errors = questionErrors(row);
    if (errors.length) {
      skipped += 1;
      console.warn(`[Preguntas] ${source}: se ignora ${row.id || row.prompt || "una pregunta"} (${errors.join("; ")})`);
      continue;
    }
    out.push(toQuestion(row));
  }
  if (skipped) console.warn(`[Preguntas] ${source}: ${skipped} preguntas ignoradas por errores`);
  return out;
}

export function readPrivateQuestions(file = PRIVATE_QUESTIONS_PATH) {
  if (!fs.existsSync(file)) return null;
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows)) throw new Error(`${file} debe contener una lista de preguntas`);
  return rows;
}

async function loadFromSupabase() {
  const db = getSupabase();
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("questions")
      .select("id, type, mode, category, difficulty, language, prompt, data, active")
      .eq("active", true)
      .order("created_at")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

/** The bank, loaded once at boot: Supabase first, then the private file, then the placeholders. */
export async function loadQuestions() {
  if (supabaseEnabled()) {
    try {
      const questions = usable(await loadFromSupabase(), "Supabase");
      if (questions.length) {
        console.log(`[Preguntas] ${questions.length} preguntas cargadas de Supabase`);
        return questions;
      }
      console.warn("[Preguntas] La tabla questions está vacía en Supabase");
    } catch (err) {
      console.warn(`[Preguntas] No se pudieron leer de Supabase (${err.message})`);
    }
  }
  try {
    const rows = readPrivateQuestions();
    if (rows) {
      const questions = usable(rows, "backend/private/questions.json");
      console.log(`[Preguntas] ${questions.length} preguntas cargadas de backend/private/questions.json`);
      return questions;
    }
  } catch (err) {
    console.warn(`[Preguntas] No se pudo leer backend/private/questions.json (${err.message})`);
  }
  console.warn("[Preguntas] Sin banco de preguntas: se usan preguntas de ejemplo");
  return sampleQuestions();
}
