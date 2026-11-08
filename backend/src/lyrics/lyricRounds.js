import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { endAtGap } from "./roundBuilder.js";

// Completa la letra's rounds as the game reads them: worked out once, offline (`npm run lyrics:build`,
// lyrics/roundBuilder.js), and loaded when the server starts; nothing is worked out or asked for while playing.
// One round per song, tied to the exact audio it was measured on (its preview's address and ETag): a catalog song's
// iTunes preview, or a pasted Spotify playlist's own (`spotify_id`). Lyrics have rights and the repo is public: they
// live in the git-ignored file below and in Supabase's `lyric_rounds` table (RLS on, no policies), never in the repo.
//
// A row: { song_id, spotify_id, preview_url, preview_etag, data }, data being only the minimum:
//   { lines: [{ at, text }] (the lines shown, each from the second it starts in the preview; the last one ends in "___"),
//     cut (where the song stops, right before the answer), end (until when the reveal plays), answer, wrong: [three],
//     wrongChecked (true once the three were written by hand to fit the line; Cerradas shows them as they are) }
// Rounds made before may have text after the gap and `back`/`stop` (the song used to play on): toVerse ignores them.
// or null for a song that can't be made into a round (so it isn't tried again).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LYRIC_ROUNDS_FILE = path.resolve(__dirname, "../../private/lyric-rounds.json");
export const LYRIC_ROUNDS_TABLE = "lyric_rounds";

/** A row's round as the game uses it (milliseconds), or null. */
export function toVerse(row) {
  const data = row?.data;
  if (!data?.lines?.length || !data.answer || data.wrong?.length !== 3) return null;
  const lines = data.lines.map((l) => ({ atMs: Math.round(Number(l.at) * 1000), text: endAtGap(String(l.text)) }));
  return {
    id: `${row.song_id}:${data.cut}`,
    lines,
    line: lines.at(-1).text,
    cutMs: Math.round(Number(data.cut) * 1000),
    answerEndMs: Math.round(Number(data.end) * 1000),
    answer: data.answer,
    aliases: [],
    wrong: data.wrong,
    // The three wrong options were checked by hand: only then is it played with Cerradas.
    checked: data.wrongChecked === true,
  };
}

/** The rows of the local file (an object by song id), or {} without one. */
export function readRoundsFile(file = LYRIC_ROUNDS_FILE) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) || {};
}

/** Writes the rows back, one song per line (easy to read, and to upload). */
export function writeRoundsFile(rows, file = LYRIC_ROUNDS_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = Object.entries(rows).map(([id, row]) => `  ${JSON.stringify(id)}: ${JSON.stringify(row)}`);
  fs.writeFileSync(file, `{\n${body.join(",\n")}\n}\n`);
}

/** A value as JSON with its keys in order (Supabase gives jsonb back with them reordered), to compare two rounds. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The rows to upload (`npm run lyrics:upload`): those not in the table yet, and those whose audio or round differ from
 * the table's (`table`: song id → its row). The others are left as they are, so their `updated_at` keeps saying when
 * they last changed and the server (watchLyricRounds) reads only what's new. Returns { rows, added, changed, same }.
 */
export function rowsToUpload(rows, table) {
  const key = (r) => stableJson([r.spotify_id || null, r.preview_url || null, r.preview_etag || null, r.data ?? null]);
  const out = { rows: [], added: 0, changed: 0, same: 0 };
  for (const row of rows) {
    const before = table.get(row.song_id);
    if (!before) out.added += 1;
    else if (key(before) !== key(row)) out.changed += 1;
    else {
      out.same += 1;
      continue;
    }
    out.rows.push(row);
  }
  return out;
}

/** Puts a row of the table (or the file) in `rounds`, or takes its song out when it can't be a round. */
export function applyRow(rounds, row) {
  const verse = toVerse(row);
  if (verse) rounds.set(row.song_id, { previewUrl: row.preview_url || null, etag: row.preview_etag || null, spotifyId: row.spotify_id || null, verse });
  else rounds.delete(row.song_id);
}

const COLUMNS = "song_id, spotify_id, preview_url, preview_etag, data, updated_at";

/**
 * Every round, by song id: { previewUrl, etag, verse }. From the local file, and from Supabase's table when `db` is
 * given (the server does it with LYRICS_DB=1); the table's row wins for the same song. `seen.latest` gets the newest
 * `updated_at` read, where watchLyricRounds goes on from.
 */
export async function loadLyricRounds({ db = null, file = LYRIC_ROUNDS_FILE, log = console, seen = {} } = {}) {
  const rounds = new Map();
  const add = (row) => {
    applyRow(rounds, row);
    if (row.updated_at && (!seen.latest || row.updated_at > seen.latest)) seen.latest = row.updated_at;
  };
  try {
    for (const [song_id, row] of Object.entries(readRoundsFile(file))) add({ ...row, song_id });
  } catch (err) {
    log.warn?.(`[Letras] No se pudo leer ${path.basename(file)} (${err.message})`);
  }
  if (db) {
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(LYRIC_ROUNDS_TABLE).select(COLUMNS).range(from, from + 999);
        if (error) throw new Error(error.message);
        data.forEach(add);
        if (data.length < 1000) break;
      }
    } catch (err) {
      log.warn?.(`[Letras] No se pudo leer la tabla ${LYRIC_ROUNDS_TABLE} (${err.message})`);
    }
  }
  log.log?.(`[Letras] ${rounds.size} canciones listas para el modo «Letra»`);
  return rounds;
}

/**
 * Reads, every `everyMs`, the rows of the table changed after `since` (an `updated_at`), so rounds uploaded with
 * `npm run lyrics:upload` (or `lyrics:queue`) play without restarting the server; `onChange(n)` when any arrived.
 * `tick()` reads at once (tests) and returns how many; `stop()` ends it.
 */
export function watchLyricRounds({ rounds, db, since = null, everyMs = 2 * 60 * 1000, onChange = null, log = console }) {
  let latest = since || new Date().toISOString();
  let busy = false;
  async function tick() {
    if (busy) return 0;
    busy = true;
    let changed = 0;
    let newest = latest;
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db
          .from(LYRIC_ROUNDS_TABLE)
          .select(COLUMNS)
          .gt("updated_at", latest)
          .order("updated_at", { ascending: true })
          .order("song_id", { ascending: true })
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const row of data) {
          applyRow(rounds, row);
          if (row.updated_at > newest) newest = row.updated_at;
        }
        changed += data.length;
        if (data.length < 1000) break;
      }
      latest = newest;
    } catch (err) {
      changed = 0;
      log.warn?.(`[Letras] No se pudieron leer las rondas nuevas (${err.message})`);
    } finally {
      busy = false;
    }
    if (changed) {
      log.log?.(`[Letras] ${changed} canciones nuevas o cambiadas para el modo «Letra»`);
      onChange?.(changed);
    }
    return changed;
  }
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
