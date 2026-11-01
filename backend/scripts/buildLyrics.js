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
//
// Needs backend/private/lyrics-tools/.venv with faster-whisper (see scripts/lyrics/transcribe.py).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { readLocalCatalog } = await import("../src/catalog/catalogProvider.js");
const { readPublicSpotify, spotifyLinkFrom } = await import("../src/catalog/spotifyEmbed.js");
const { DEFAULT_SPOTIFY } = await import("../src/catalog/defaultPlaylists.js");
const { displayTitle } = await import("../src/catalog/trackResolver.js");
const { cleanEtag } = await import("../src/audio/mediaCache.js");
const { LYRIC_ROUNDS_FILE, readRoundsFile, writeRoundsFile } = await import("../src/lyrics/lyricRounds.js");
const { like, lyricLines, norm, pickRound } = await import("../src/lyrics/roundBuilder.js");

const TOOLS = path.resolve(__dirname, "../private/lyrics-tools");
const PYTHON = path.join(TOOLS, ".venv", "Scripts", "python.exe");
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

if (!fs.existsSync(PYTHON)) {
  console.error(`Falta ${PYTHON}. Instálalo con las instrucciones de scripts/lyrics/transcribe.py.`);
  process.exit(1);
}
fs.mkdirSync(PREVIEWS, { recursive: true });

// ---- The songs ----
const songs = [];
if (!args.includes("--no-catalog")) {
  for (const s of readLocalCatalog().songs) {
    if (s.previewUrl) songs.push({ id: s.id, spotifyId: s.spotifyId || null, title: s.title, artists: s.artists?.length ? s.artists : [s.artistName], language: s.language || null, previewUrl: s.previewUrl });
  }
}
const spotifyTargets = [...DEFAULT_SPOTIFY.map((p) => ({ kind: p.kind, id: p.id }))];
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
const todo = songs.filter((s) => (!onlyIds || onlyIds.has(s.id)) && (redo || !(s.id in rows) || (retry && !rows[s.id]?.data))).slice(0, limit);
console.log(`${Object.values(rows).filter(Boolean).length} canciones ya listas; faltan ${todo.length}.`);

// ---- Whisper, kept running ----
const whisper = spawn(PYTHON, ["-I", "-W", "ignore", path.join(__dirname, "lyrics", "transcribe.py")], {
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
  if (msg.ready) return console.log(`Whisper listo: ${msg.ready}`), waiting.shift()?.(msg);
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
  // The same recording when the length is known (a Spotify song's), else the first with synced lyrics.
  const close = song.durationMs ? found.filter((r) => Math.abs(r.duration * 1000 - song.durationMs) < 4000) : [];
  const pick = close[0] || found.find((r) => r.syncedLyrics) || found[0];
  return pick ? lyricLines(pick.syncedLyrics, pick.plainLyrics) : null;
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
  const lines = await lyricsOf(song);
  if (!lines?.length) return { row: null, why: "sin letra en LRCLIB" };
  const heard = await ask({ path: file, lang: song.language });
  if (heard.error) throw new Error(`Whisper: ${heard.error}`);
  const language = song.language || (/[áéíóúñ¿¡]/i.test(lines.join(" ")) ? "es" : "en");
  const round = pickRound(lines, words(heard), { length: heard.duration, language });
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
  // Where the song comes back after the gap: nothing of the answer (nor its end) may be heard there; else a bit later,
  // up to 3 times, and if it still is, the round stops at the cut as before (no "de mí" after the gap).
  let { back, stop } = round;
  const key = norm(round.answer);
  for (let tries = 0; back < stop; tries += 1) {
    const resumed = await ask({ path: file, lang: language, start: back, end: Math.min(stop, back + 2.5) });
    const first = words(resumed).map((w) => norm(w.word)).filter(Boolean).slice(0, 2);
    if (!first.some((t) => like(t, key) || (t.length >= 2 && key.endsWith(t)))) break;
    if (tries === 3) {
      back = stop = cut;
      break;
    }
    back = Math.round((back + 0.08) * 100) / 100;
  }
  const { heard: _, ...data } = round;
  return { row: { spotify_id: song.spotifyId, preview_url: song.previewUrl, preview_etag: etag, data: { ...data, cut, back, stop } } };
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
    onDisk[song.id] = row || { spotify_id: song.spotifyId, preview_url: song.previewUrl, data: null };
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
