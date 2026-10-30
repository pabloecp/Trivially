import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Completa la letra's rounds as the game reads them: worked out once, offline (`npm run lyrics:build`,
// lyrics/roundBuilder.js), and loaded when the server starts; nothing is worked out or asked for while playing.
// One round per song, tied to the exact audio it was measured on (its preview's address and ETag): a catalog song's
// iTunes preview, or a pasted Spotify playlist's own (`spotify_id`). Lyrics have rights and the repo is public: they
// live in the git-ignored file below and in Supabase's `lyric_rounds` table (RLS on, no policies), never in the repo.
//
// A row: { song_id, spotify_id, preview_url, preview_etag, data }, data being only the minimum:
//   { lines: [{ at, text }] (the lines shown, each from the second it starts in the preview; the last one has "___"),
//     cut (where the song goes quiet, right before the answer), back (where it comes back, with the next word), stop
//     (where it stops, at the end of the line), end (until when the reveal plays), answer, wrong: [three] }
// or null for a song that can't be made into a round (so it isn't tried again).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LYRIC_ROUNDS_FILE = path.resolve(__dirname, "../../private/lyric-rounds.json");
export const LYRIC_ROUNDS_TABLE = "lyric_rounds";

/** A row's round as the game uses it (milliseconds), or null. */
export function toVerse(row) {
  const data = row?.data;
  if (!data?.lines?.length || !data.answer || data.wrong?.length !== 3) return null;
  const lines = data.lines.map((l) => ({ atMs: Math.round(Number(l.at) * 1000), text: String(l.text) }));
  return {
    id: `${row.song_id}:${data.cut}`,
    lines,
    line: lines.at(-1).text,
    cutMs: Math.round(Number(data.cut) * 1000),
    // Where the song comes back after the gap's word and where it stops (an older round: both at the cut).
    backMs: Math.round(Number(data.back ?? data.cut) * 1000),
    stopMs: Math.round(Number(data.stop ?? data.cut) * 1000),
    answerEndMs: Math.round(Number(data.end) * 1000),
    answer: data.answer,
    aliases: [],
    wrong: data.wrong,
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

/**
 * Every round, by song id: { previewUrl, etag, verse }. From the local file, and from Supabase's table when `db` is
 * given (the server does it with LYRICS_DB=1); the table's row wins for the same song.
 */
export async function loadLyricRounds({ db = null, file = LYRIC_ROUNDS_FILE, log = console } = {}) {
  const rounds = new Map();
  const add = (row) => {
    const verse = toVerse(row);
    if (verse) rounds.set(row.song_id, { previewUrl: row.preview_url || null, etag: row.preview_etag || null, spotifyId: row.spotify_id || null, verse });
    else rounds.delete(row.song_id);
  };
  try {
    for (const [song_id, row] of Object.entries(readRoundsFile(file))) add({ ...row, song_id });
  } catch (err) {
    log.warn?.(`[Letras] No se pudo leer ${path.basename(file)} (${err.message})`);
  }
  if (db) {
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(LYRIC_ROUNDS_TABLE).select("song_id, spotify_id, preview_url, preview_etag, data").range(from, from + 999);
        if (error) throw new Error(error.message);
        data.forEach(add);
        if (data.length < 1000) break;
      }
    } catch (err) {
      log.warn?.(`[Letras] No se pudo leer la tabla ${LYRIC_ROUNDS_TABLE} (${err.message})`);
    }
  }
  log.log?.(`[Letras] ${rounds.size} canciones listas para «Completa la letra»`);
  return rounds;
}
