import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// How each question does, added up (game/questionStats.js makes the entries at every reveal). The server keeps them in
// memory and adds them to the Supabase table `question_stats` (see backend/supabase/schema.sql) every FLUSH_MS and when
// it stops; without Supabase, or if the table isn't there yet, to backend/private/question-stats.json (never
// committed). One row per game, question and variant; the numbers only grow. Only one server writes (it reads the
// rows, adds, and writes them back, one flush at a time).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const QUESTION_STATS_FILE = path.join(__dirname, "../../private/question-stats.json");
export const QUESTION_STATS_TABLE = "question_stats";
const FLUSH_MS = 60 * 1000;
const COUNTERS = ["seen", "players", "correct", "wrong", "skipped", "blank", "points", "correctMs"];
const COLUMN = { correctMs: "correct_ms" };

export const statsKey = (e) => `${e.game}|${e.questionId}|${e.variant || ""}`;

/** Adds b's numbers into a (both plain objects of numbers or of more of the same), and returns a. */
export function addExtra(a = {}, b = {}) {
  for (const [k, v] of Object.entries(b || {})) {
    if (typeof v === "number") a[k] = (Number(a[k]) || 0) + v;
    else if (v && typeof v === "object") a[k] = addExtra(a[k] && typeof a[k] === "object" ? a[k] : {}, v);
  }
  return a;
}

/** Two entries of the same question added up (the newest prompt, difficulty and category win). */
export function mergeEntries(a, b) {
  if (!a) return { ...b, extra: addExtra({}, b.extra) };
  const out = { ...a, prompt: b.prompt || a.prompt, difficulty: b.difficulty || a.difficulty, category: b.category || a.category };
  for (const c of COUNTERS) out[c] = (Number(a[c]) || 0) + (Number(b[c]) || 0);
  out.extra = addExtra(addExtra({}, a.extra), b.extra);
  out.lastSeen = b.lastSeen || a.lastSeen;
  return out;
}

const toRow = (e) => ({
  game: e.game,
  question_id: e.questionId,
  variant: e.variant || "",
  prompt: e.prompt ?? null,
  difficulty: e.difficulty ?? null,
  category: e.category ?? null,
  ...Object.fromEntries(COUNTERS.map((c) => [COLUMN[c] || c, Math.round(Number(e[c]) || 0)])),
  extra: e.extra || {},
  last_seen: e.lastSeen || new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const fromRow = (r) => ({
  game: r.game,
  questionId: r.question_id,
  variant: r.variant || "",
  prompt: r.prompt,
  difficulty: r.difficulty,
  category: r.category,
  ...Object.fromEntries(COUNTERS.map((c) => [c, Number(r[COLUMN[c] || c]) || 0])),
  extra: r.extra || {},
  lastSeen: r.last_seen,
});

export class QuestionStats {
  /** `db`: a Supabase client (null: only the local file). `file`: where they go without it. */
  constructor({ db = null, file = QUESTION_STATS_FILE, log = console } = {}) {
    this.db = db;
    this.file = file;
    this.log = log;
    this.pending = new Map();
    this.flushing = Promise.resolve();
    this.timer = null;
  }

  /** Entries of a round, waiting for the next flush. */
  add(entries = []) {
    const at = new Date().toISOString();
    for (const e of entries) {
      if (!e?.game || e.questionId == null || e.questionId === "") continue;
      const key = statsKey(e);
      this.pending.set(key, mergeEntries(this.pending.get(key), { ...e, lastSeen: at }));
    }
  }

  start(ms = FLUSH_MS) {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), ms);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    return this.flush();
  }

  /** Adds what's waiting to the table (or the file). Never throws; flushes go one after another. */
  flush() {
    this.flushing = this.flushing.then(() => this.write()).catch((err) => this.log.warn?.(`[Estadísticas] ${err.message}`));
    return this.flushing;
  }

  async write() {
    if (!this.pending.size) return;
    const batch = [...this.pending.values()];
    this.pending.clear();
    let left = batch;
    if (this.db) {
      try {
        // Part by part: what was already written isn't written again to the file if a later part fails.
        while (left.length) {
          await this.writeDb(left.slice(0, 200));
          left = left.slice(200);
        }
        return;
      } catch (err) {
        this.log.warn?.(`[Estadísticas] No se pudieron guardar en Supabase (${err.message}); quedan en ${this.file}`);
      }
    }
    this.writeFile(left);
  }

  async writeDb(part) {
    const saved = await this.readDb(part);
    const rows = part.map((e) => toRow(mergeEntries(saved.get(statsKey(e)), e)));
    const { error } = await this.db.from(QUESTION_STATS_TABLE).upsert(rows, { onConflict: "game,question_id,variant" });
    if (error) throw new Error(error.message);
  }

  /** The rows already saved for these entries, by key. */
  async readDb(entries) {
    const saved = new Map();
    const byGame = new Map();
    for (const e of entries) byGame.set(e.game, [...(byGame.get(e.game) || []), e.questionId]);
    for (const [game, ids] of byGame) {
      const { data, error } = await this.db.from(QUESTION_STATS_TABLE).select("*").eq("game", game).in("question_id", [...new Set(ids)]);
      if (error) throw new Error(error.message);
      for (const r of data || []) saved.set(statsKey(fromRow(r)), fromRow(r));
    }
    return saved;
  }

  readFile() {
    try {
      return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, "utf8")) : {};
    } catch {
      return {};
    }
  }

  writeFile(batch) {
    const all = this.readFile();
    for (const e of batch) all[statsKey(e)] = mergeEntries(all[statsKey(e)], e);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(all));
  }

  /** How a question has done so far, every variant (what's saved plus what's waiting), for a report. */
  async lookup(game, questionId) {
    if (!game || questionId == null) return [];
    const id = String(questionId).replace(/:escribir$/, "");
    const found = new Map();
    try {
      if (this.db) {
        const { data, error } = await this.db.from(QUESTION_STATS_TABLE).select("*").eq("game", game).eq("question_id", id);
        if (error) throw new Error(error.message);
        for (const r of data || []) found.set(statsKey(fromRow(r)), fromRow(r));
      } else {
        for (const [key, e] of Object.entries(this.readFile())) if (e.game === game && e.questionId === id) found.set(key, e);
      }
    } catch {
      // Without the table yet: only what's waiting.
    }
    for (const [key, e] of this.pending) if (e.game === game && e.questionId === id) found.set(key, mergeEntries(found.get(key), e));
    return [...found.values()];
  }
}
