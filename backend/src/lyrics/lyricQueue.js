// The songs waiting for their Completa la letra round. When a room plays a Spotify playlist, each of its songs that has
// no round for the audio it plays (its iTunes preview once found there, else Spotify's own) is written down in
// Supabase's `lyric_queue` table, with how many times it was asked for. Nothing is worked out here: the rounds are still
// made offline (`npm run lyrics:build -- --queue` takes the most asked first) and uploaded (`npm run lyrics:upload`,
// which takes them off the queue); from then on every room that plays that song has it in "Letra".
//
// A song already tried on that same audio (a row in `lyric_rounds`, ready or left out) isn't written down again. The
// songs are gathered for a few seconds and written together; the same song and audio at most once an hour per server,
// so a playlist added in many rooms doesn't count each time.
import { LYRIC_ROUNDS_TABLE } from "./lyricRounds.js";

export const LYRIC_QUEUE_TABLE = "lyric_queue";
const GATHER_MS = 5000;
const REPEAT_MS = 60 * 60 * 1000;

/**
 * The queue's rows for these songs: those whose audio wasn't tried yet (`tried`: song id → the preview of its row in
 * lyric_rounds), one more ask each (`queued`: song id → the asks it already has).
 */
export function queueRows(songs, { tried = new Map(), queued = new Map(), now = new Date().toISOString() } = {}) {
  const rows = new Map();
  for (const s of songs) {
    if (!s?.id?.startsWith("sp-") || !s.previewUrl || tried.get(s.id) === s.previewUrl) continue;
    rows.set(s.id, {
      song_id: s.id,
      spotify_id: s.spotifyId || null,
      title: s.title || "",
      artists: s.artists?.length ? s.artists : [s.artistName].filter(Boolean),
      preview_url: s.previewUrl,
      requests: (queued.get(s.id) || 0) + 1,
      requested_at: now,
    });
  }
  return [...rows.values()];
}

export class LyricQueue {
  constructor({ db = null, gatherMs = GATHER_MS, repeatMs = REPEAT_MS, log = console } = {}) {
    this.db = db;
    this.gatherMs = gatherMs;
    this.repeatMs = repeatMs;
    this.log = log;
    this.pending = new Map();
    this.recent = new Map();
    this.timer = null;
  }

  /** Writes down a song of a Spotify playlist that has no round for the audio it plays (gathered, written soon). */
  add(song) {
    if (!this.db || !song?.id?.startsWith("sp-") || !song.previewUrl) return;
    const key = `${song.id}|${song.previewUrl}`;
    const now = Date.now();
    if (now - (this.recent.get(key) || 0) < this.repeatMs) return;
    this.recent.set(key, now);
    this.pending.set(song.id, song);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.gatherMs);
      this.timer.unref?.();
    }
  }

  async flush() {
    this.timer = null;
    const songs = [...this.pending.values()];
    this.pending.clear();
    if (!songs.length || !this.db) return 0;
    try {
      const tried = new Map();
      const queued = new Map();
      for (let i = 0; i < songs.length; i += 200) {
        const ids = songs.slice(i, i + 200).map((s) => s.id);
        const rounds = await this.db.from(LYRIC_ROUNDS_TABLE).select("song_id, preview_url").in("song_id", ids);
        if (rounds.error) throw new Error(rounds.error.message);
        for (const r of rounds.data) tried.set(r.song_id, r.preview_url);
        const waiting = await this.db.from(LYRIC_QUEUE_TABLE).select("song_id, requests").in("song_id", ids);
        if (waiting.error) throw new Error(waiting.error.message);
        for (const r of waiting.data) queued.set(r.song_id, Number(r.requests) || 0);
      }
      const rows = queueRows(songs, { tried, queued });
      if (!rows.length) return 0;
      const { error } = await this.db.from(LYRIC_QUEUE_TABLE).upsert(rows, { onConflict: "song_id" });
      if (error) throw new Error(error.message);
      return rows.length;
    } catch (err) {
      // Asked again later: the next time a room plays them.
      for (const s of songs) this.recent.delete(`${s.id}|${s.previewUrl}`);
      this.log.warn?.(`[Letras] No se pudieron anotar ${songs.length} canciones pendientes (${err.message})`);
      return 0;
    }
  }
}
