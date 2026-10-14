import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "./store.js";

// Owners' reports of a question that looked wrong during a match (RoomManager.questionReport builds them). They go to
// the Supabase table `question_reports` (see backend/supabase/schema.sql); without Supabase, or if the table isn't
// there yet, to backend/private/question-reports.jsonl, one report per line (that folder is never committed).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = path.join(__dirname, "../../private/question-reports.jsonl");

function saveLocally(report) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.appendFileSync(LOCAL_PATH, `${JSON.stringify(report)}\n`);
}

/** Keeps a report. Never throws for the storage itself: a failed insert falls back to the local file. */
export async function saveQuestionReport(report) {
  if (supabaseEnabled()) {
    const { error } = await getSupabase()
      .from("question_reports")
      .insert({
        game: report.game,
        question_id: report.question?.id ?? null,
        prompt: report.prompt ?? null,
        reporter_id: report.reporter.id,
        room_code: report.room.code,
        data: report,
      });
    if (!error) return "supabase";
    console.warn(`[Reportes] No se pudo guardar en Supabase (${error.message}); queda en ${LOCAL_PATH}`);
  }
  saveLocally(report);
  return "local";
}
