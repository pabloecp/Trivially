// Works out Completa la letra's rounds once, offline, on this computer (lyrics/roundBuilder.js): for each song, its
// own preview (the exact audio the game plays) is transcribed by Whisper with each word's time, matched to its real
// lyrics from LRCLIB, and the gap and the cut are picked; then the cut is CHECKED by transcribing again what's heard
// just before and just after it (the answer, or its start, must not be heard before; it must be heard right after).
// Songs that don't line up or fail the check are left out: better fewer songs well cut.
//
// Songs: the catalog's (their iTunes preview), the default Spotify playlists' (Top 50: Global, their Spotify preview,
// with their spotify_id) and any Spotify playlist or album given with --spotify. Each round is tied to its audio: the
// preview's address and ETag. Results go to backend/private/lyric-rounds.json (git-ignored); `npm run lyrics:upload`
// sends them to Supabase. Songs already in the file are skipped (stop it and run it again: it goes on), unless --redo.
//
//   npm run lyrics:build --prefix backend
//   npm run lyrics:build --prefix backend -- --limit 20
//   npm run lyrics:build --prefix backend -- --ids luis-fonsi-despacito,coldplay-yellow --redo
//   npm run lyrics:build --prefix backend -- --retry          (the songs left out before, again)
//   npm run lyrics:build --prefix backend -- --spotify https://open.spotify.com/playlist/... --no-catalog
//   npm run lyrics:build --prefix backend -- --retry --engine alt   (another transcriber, for previews Whisper can't hear)
//   npm run lyrics:build --prefix backend -- --redo-before 2026-11-05T00:00:00Z   (all of them again; stopped, it goes on)
//   npm run lyrics:build --prefix backend -- --queue     (only the songs people played without a round, most asked first:
//                                                         Supabase's lyric_queue; then lyrics:upload takes them off it.
//                                                         `npm run lyrics:queue` does both)
//
// Needs backend/private/lyrics-tools/.venv with faster-whisper (see scripts/lyrics/transcribe.py); `--engine alt`,
// .venv-alt with torch, torchaudio and transformers (see scripts/lyrics/transcribe-alt.py): it separates the voice
// from the music first, then transcribes it with wav2vec2, for previews where the music covers the singing.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
const { readLocalCatalog } = await import("../src/catalog/catalogProvider.js");
const { readPublicSpotify, spotifyLinkFrom } = await import("../src/catalog/spotifyEmbed.js");
const { DEFAULT_SPOTIFY } = await import("../src/catalog/defaultPlaylists.js");
const { displayTitle } = await import("../src/catalog/trackResolver.js");
const { cleanEtag } = await import("../src/audio/mediaCache.js");
const { LYRIC_ROUNDS_FILE, readRoundsFile, writeRoundsFile } = await import("../src/lyrics/lyricRounds.js");
const { alignWords, like, lyricLines, norm, pickRound } = await import("../src/lyrics/roundBuilder.js");

const TOOLS = path.resolve(__dirname, "../private/lyrics-tools");
// The transcriber: Whisper, or `--engine alt` (voice separated from the music, then wav2vec2). Both answer the same.
const ENGINES = {
  whisper: { name: "Whisper", venv: ".venv", script: "transcribe.py" },
  alt: { name: "Voz separada + wav2vec2", venv: ".venv-alt", script: "transcribe-alt.py" },
};
const PREVIEWS = path.join(TOOLS, "previews");
const USER_AGENT = "Trivially (https://github.com/pabloecp/Trivially)";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const limit = Number(opt("--limit")) || Infinity;
const onlyIds = opt("--ids") ? new Set(opt("--ids").split(",")) : null;
const redo = args.includes("--redo");
// Tries again the songs left out before (data null), not the ready ones.
const retry = args.includes("--retry");
// Every song not worked out since this moment (rows keep when they were built): a --redo that can be stopped and resumed.
const redoBefore = opt("--redo-before");
// With --retry: only the songs left out for this reason (e.g. --why "no se oye voz en el fragmento").
const onlyWhy = opt("--why");
// Only the songs waiting in Supabase's lyric_queue (lyrics/lyricQueue.js), with the audio rooms play them with.
const fromQueue = args.includes("--queue");
const ENGINE = ENGINES[opt("--engine") || "whisper"];
if (!ENGINE) {
  console.error(`--engine es whisper o alt.`);
  process.exit(1);
}
const PYTHON = path.join(TOOLS, ENGINE.venv, "Scripts", "python.exe");
// Fewer words heard than this in the whole preview: there's no singing to cut (or the transcriber can't hear it).
const MIN_HEARD_WORDS = 15;

if (!fs.existsSync(PYTHON)) {
  console.error(`Falta ${PYTHON}. Instálalo con las instrucciones de scripts/lyrics/${ENGINE.script}.`);
  process.exit(1);
}
fs.mkdirSync(PREVIEWS, { recursive: true });

// ---- The songs ----
const songs = [];
if (fromQueue) {
  const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
  const { LYRIC_QUEUE_TABLE } = await import("../src/lyrics/lyricQueue.js");
  if (!supabaseEnabled()) {
    console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para leer la cola.");
    process.exit(1);
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from(LYRIC_QUEUE_TABLE)
      .select("song_id, spotify_id, title, artists, preview_url, requests")
      .order("requests", { ascending: false })
      .order("requested_at", { ascending: false })
      .range(from, from + 999);
    if (error) {
      console.error(`No se pudo leer la tabla ${LYRIC_QUEUE_TABLE}: ${error.message}`);
      process.exit(1);
    }
    for (const r of data) {
      songs.push({ id: r.song_id, spotifyId: r.spotify_id, title: r.title, artists: r.artists || [], language: null, previewUrl: r.preview_url, queued: true });
    }
    if (data.length < 1000) break;
  }
  console.log(`${songs.length} canciones esperan en la cola.`);
}
if (!fromQueue && !args.includes("--no-catalog")) {
  for (const s of readLocalCatalog().songs) {
    if (s.previewUrl) songs.push({ id: s.id, spotifyId: s.spotifyId || null, title: s.title, artists: s.artists?.length ? s.artists : [s.artistName], language: s.language || null, previewUrl: s.previewUrl });
  }
}
const spotifyTargets = fromQueue ? [] : [...DEFAULT_SPOTIFY.map((p) => ({ kind: p.kind, id: p.id }))];
for (const link of (opt("--spotify") || "").split(",").filter(Boolean)) spotifyTargets.push(await spotifyLinkFrom(link));
for (const target of spotifyTargets) {
  try {
    const playlist = await readPublicSpotify(target);
    for (const t of playlist.tracks) {
      // The same id and audio as a pasted playlist's song in a room (RoomManager.linkSong).
      if (t.previewUrl) songs.push({ id: `sp-${t.spotifyId}`, spotifyId: t.spotifyId, title: displayTitle(t.title), artists: t.artists, language: null, previewUrl: t.previewUrl, durationMs: t.durationMs });
    }
    console.log(`Spotify «${playlist.name}»: ${playlist.tracks.filter((t) => t.previewUrl).length} canciones con fragmento.`);
  } catch (err) {
    console.warn(`No se pudo leer la playlist de Spotify ${target.id}: ${err.message}`);
  }
}

const rows = readRoundsFile();
// Doing them all again: also the songs that left the playlists since, read one by one from Spotify's page of each.
if (redoBefore && !onlyIds) {
  const known = new Set(songs.map((s) => s.id));
  for (const [id, row] of Object.entries(rows)) {
    if (known.has(id) || !id.startsWith("sp-") || !row?.spotify_id || row.built >= redoBefore) continue;
    try {
      const res = await fetch(`https://open.spotify.com/embed/track/${row.spotify_id}`, { headers: { "User-Agent": "Mozilla/5.0" } });
      const page = (await res.text()).match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      const entity = JSON.parse(page[1]).props.pageProps.state.data.entity;
      songs.push({ id, spotifyId: row.spotify_id, title: displayTitle(entity.name), artists: entity.artists.map((x) => x.name), language: null, previewUrl: row.preview_url, durationMs: entity.duration });
    } catch (err) {
      console.warn(`No se pudo leer ${id} de Spotify: ${err.message}`);
    }
  }
}
const todo = songs
  // A song of the queue is done again when its row was measured on other audio (Spotify's, now iTunes').
  .filter((s) => (!onlyIds || onlyIds.has(s.id)) && (redo || !(s.id in rows) || (s.queued && rows[s.id]?.preview_url !== s.previewUrl) || (redoBefore && !(rows[s.id]?.built >= redoBefore)) || (retry && !rows[s.id]?.data && (!onlyWhy || rows[s.id]?.why === onlyWhy))))
  .slice(0, limit);
console.log(`${Object.values(rows).filter(Boolean).length} canciones ya listas; faltan ${todo.length}.`);
// Nothing to do: Whisper isn't even started (lyrics:queue then only uploads and says what's left to check).
if (!todo.length) process.exit(0);

// ---- The transcriber, kept running ----
const whisper = spawn(PYTHON, ["-I", "-W", "ignore", path.join(__dirname, "lyrics", ENGINE.script)], {
  stdio: ["pipe", "pipe", "inherit"],
  // Hugging Face's notes about symlinks on Windows and anonymous downloads say nothing useful here.
  env: { ...process.env, HF_HUB_DISABLE_SYMLINKS_WARNING: "1", HF_HUB_DISABLE_IMPLICIT_TOKEN: "1", HF_HUB_VERBOSITY: "error" },
});
const answers = readline.createInterface({ input: whisper.stdout });
const waiting = [];
answers.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.log) return console.log(`   (${msg.log})`);
  if (msg.ready) return console.log(`${ENGINE.name} listo: ${msg.ready}`), waiting.shift()?.(msg);
  waiting.shift()?.(msg);
});
const ask = (job) =>
  new Promise((resolve) => {
    waiting.push(resolve);
    whisper.stdin.write(`${JSON.stringify(job)}\n`);
  });
await new Promise((resolve) => waiting.push(resolve));

// ---- One song ----
async function download(song) {
  const ext = song.previewUrl.includes("p.scdn.co") ? "mp3" : "m4a";
  const file = path.join(PREVIEWS, `${song.id.replace(/[^\w-]/g, "_")}.${ext}`);
  const res = await fetch(song.previewUrl);
  if (!res.ok) throw new Error(`fragmento: respuesta ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return { file, etag: cleanEtag(res.headers.get("etag")) };
}

let lastLrclib = 0;
async function lyricsOf(song) {
  const wait = lastLrclib + 400 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLrclib = Date.now();
  const title = song.title.replace(/\s*[([].*$/, "").replace(/\s+-\s+.*$/, "").trim();
  const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(song.artists[0] || "")}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`LRCLIB: respuesta ${res.status}`);
  const found = (await res.json()).filter((r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics));
  // Every version LRCLIB has, each once (the original and a remix often share a name, and some are badly uploaded):
  // measure() keeps the one that lines up best with what's heard.
  const seen = new Set();
  return found
    .map((r) => lyricLines(r.syncedLyrics, r.plainLyrics))
    .filter((lines) => lines.length && !seen.has(lines.join("\n")) && seen.add(lines.join("\n")));
}

const words = (msg) => (msg.words || []).map(([start, end, word, prob]) => ({ start, end, word, prob }));

// Whether the answer, or its start, is heard at the end of what's before the cut.
function leaks(before, answer, previous) {
  const tail = words(before).map((w) => norm(w.word)).filter(Boolean).slice(-2);
  const key = norm(answer);
  return tail.some((t) => like(t, key) || (t.length >= 2 && key.startsWith(t) && !like(t, norm(previous))));
}

// Each preview is only needed while its song is worked out: it's deleted right after (a thousand of them fill a disk).
async function build(song) {
  const { file, etag } = await download(song);
  try {
    return await measure(song, file, etag);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function measure(song, file, etag) {
  const versions = await lyricsOf(song);
  if (!versions.length) return { row: null, why: "sin letra en LRCLIB" };
  const heard = await ask({ path: file, lang: song.language });
  if (heard.error) throw new Error(`${ENGINE.name}: ${heard.error}`);
  // Next to nothing heard: the preview has no singing, or the music covers it (`--engine alt` separates the voice).
  if (words(heard).length < MIN_HEARD_WORDS) return { row: null, why: "no se oye voz en el fragmento" };
  // The version of the lyrics that lines up best with what's heard and gives a round.
  let round = null;
  let language = song.language;
  for (const lines of versions.map((l) => ({ l, matched: alignWords(l, words(heard)).matched })).sort((a, b) => b.matched - a.matched).map((v) => v.l)) {
    language = song.language || (/[áéíóúñ¿¡]/i.test(lines.join(" ")) ? "es" : "en");
    round = pickRound(lines, words(heard), { length: heard.duration, language });
    if (round) break;
  }
  if (!round) return { row: null, why: "la letra no coincide con lo que se oye" };
  // The previous word of the gap's line (what should be the last thing heard).
  const gapWords = round.lines.at(-1).text.split(/\s+/);
  const previous = gapWords[gapWords.findIndex((w) => w.includes("___")) - 1] || "";
  // The check: nothing of the answer before the cut (else a bit earlier, up to 3 times), and the answer right after.
  let cut = round.cut;
  for (let tries = 0; ; tries += 1) {
    const before = await ask({ path: file, lang: language, start: Math.max(0, cut - 4), end: cut });
    if (!leaks(before, round.answer, previous)) break;
    if (tries === 3) return { row: null, why: "se oye la respuesta antes del corte" };
    cut = Math.round((cut - 0.1) * 100) / 100;
  }
  // From a bit before the cut (Whisper often misses the first word of a clip that starts on it), the answer among the
  // first words that start after the cut.
  const after = await ask({ path: file, lang: language, start: Math.max(0, cut - 1.5), end: Math.min(heard.duration, cut + 2.5) });
  const next = words(after).filter((w) => w.start >= cut - 0.15).slice(0, 4);
  if (!next.some((w) => like(norm(w.word), norm(round.answer)))) return { row: null, why: "no se oye la respuesta justo después del corte" };
  const { heard: _, ...data } = round;
  return { row: { spotify_id: song.spotifyId, preview_url: song.previewUrl, preview_etag: etag, data: { ...data, cut } } };
}

// ---- All of them ----
const started = Date.now();
let ready = 0;
let skipped = 0;
let failed = 0;
for (const [i, song] of todo.entries()) {
  const label = `${String(i + 1).padStart(4)}/${todo.length} ${song.title} - ${song.artists.join(", ")}`;
  try {
    const { row, why } = await build(song);
    const onDisk = readRoundsFile();
    // A song left out keeps why (not uploaded; for `--why` and for looking at them).
    onDisk[song.id] = { ...(row || { spotify_id: song.spotifyId, preview_url: song.previewUrl, data: null, why }), built: new Date().toISOString() };
    writeRoundsFile(onDisk);
    if (row) {
      ready += 1;
      console.log(`${label}: ✓ «${row.data.lines.at(-1).text}» → ${row.data.answer} (corte ${row.data.cut} s)`);
    } else {
      skipped += 1;
      console.log(`${label}: – ${why}`);
    }
  } catch (err) {
    // A failure of the services (no network, LRCLIB down) isn't kept: the song is tried again next time.
    failed += 1;
    console.log(`${label}: error (${err.message})`);
  }
}
whisper.stdin.end();
const total = Object.values(readRoundsFile()).filter((r) => r?.data).length;
console.log(`Listo en ${((Date.now() - started) / 60000).toFixed(1)} min: ${ready} nuevas, ${skipped} descartadas, ${failed} con error.`);
console.log(`En total hay ${total} canciones listas en ${path.relative(process.cwd(), LYRIC_ROUNDS_FILE)}.`);
process.exit(0);
