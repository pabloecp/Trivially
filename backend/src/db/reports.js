import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "./store.js";

// Reports of a question that looked wrong during a match (RoomManager.questionReport builds them), or of a whole
// match from the profile's history (store.js reportHistoryMatch, `kind: "partida"`, every round). They go to
// the Supabase table `question_reports` (see backend/supabase/schema.sql); without Supabase, or if the table isn't
// there yet, to backend/private/question-reports.jsonl, one report per line (that folder is never committed).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = path.join(__dirname, "../../private/question-reports.jsonl");

function saveLocally(report) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.appendFileSync(LOCAL_PATH, `${JSON.stringify(report)}\n`);
}

/**
 * What a report adds when it's saved, to help tell what was wrong (`report.context`): how many times the same question
 * was reported before (and when the last one was), and how it has done so far in every match (`stats`, from
 * question_stats: db/questionStats.js), e.g. a "fácil" question almost nobody gets right. Never throws.
 */
export async function reportContext(report, { stats = null, db = supabaseEnabled() ? getSupabase() : null } = {}) {
  const context = { earlierReports: null, lastReportAt: null, stats: null };
  const questionId = report.question?.id ?? null;
  if (db && questionId != null) {
    try {
      const { data, count, error } = await db
        .from("question_reports")
        .select("created_at", { count: "exact" })
        .eq("game", report.game)
        .eq("question_id", questionId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!error) {
        context.earlierReports = count ?? 0;
        context.lastReportAt = data?.[0]?.created_at ?? null;
      }
    } catch {
      // Without the table yet: nothing to add.
    }
  }
  if (stats && report.statsKey) {
    try {
      context.stats = await stats.lookup(report.statsKey.game, report.statsKey.questionId);
    } catch {
      context.stats = null;
    }
  }
  return context;
}

/** Keeps a report. Never throws for the storage itself: a failed insert falls back to the local file. */
export async function saveQuestionReport(report, { stats = null } = {}) {
  if (report.kind !== "partida") report.context = await reportContext(report, { stats });
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
