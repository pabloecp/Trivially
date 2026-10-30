import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "../game/roomManager.js";
import { alignWords, lyricLines, pickRound, wrongAnswers } from "./roundBuilder.js";
import { loadLyricRounds, toVerse, writeRoundsFile } from "./lyricRounds.js";

// Adivina la canción's "Completa la letra". The lyrics here are made up: real lyrics never go in the repo.
const catalog = readLocalCatalog();
const [s1, s2, s3] = catalog.songs;

// LRCLIB's lyrics as lines: the synced ones without their times, no empty lines.
const lines = lyricLines(
  [
    "[00:40.00] Primera línea de este verso inventado",
    "[00:44.00] Segunda línea que se canta después",
    "[00:48.00] Aquí viene la frase con montañas y ríos",
    "[00:52.00] Cuarta línea para terminar",
    "[00:56.00] ",
    "[01:30.00] Aquí viene la frase con montañas y ríos",
  ].join("\n")
);
assert.equal(lines.length, 5);
assert.equal(lines[0], "Primera línea de este verso inventado");

// What Whisper heard in the preview, each word a third of a second apart, with a misheard word ("berso").
const heard = (from, text, prob = 0.9) => text.split(" ").map((word, k) => ({ word, start: from + k * 0.33, end: from + k * 0.33 + 0.3, prob }));
const words = [
  ...heard(3, "Primera línea de este berso inventado"),
  ...heard(7, "Segunda línea que se canta después"),
  ...heard(11.1, "Aquí viene la frase con montañas y ríos"),
  ...heard(15, "Cuarta línea para terminar"),
];
const { matched } = alignWords(lines, words);
assert.ok(matched >= 22, `matched ${matched}`);

// The gap: a clear word, 8 s or more into the song, in the middle of a chorus line; the cut 80 ms before it starts;
// the reveal until that line has been sung and a bit more; the lines before it from when each starts.
const round = pickRound(lines, words, { length: 30, language: "es" });
assert.equal(round.answer, "montañas");
assert.equal(round.lines.at(-1).text, "Aquí viene la frase con ___ y ríos");
assert.equal(round.cut, Math.round((11.1 + 5 * 0.33 - 0.08) * 100) / 100);
assert.equal(round.lines[0].text, "Primera línea de este verso inventado", "the real lyrics, not what Whisper heard");
assert.equal(round.lines[0].at, 3);
assert.ok(round.end > round.heard.end && round.end <= 30);
assert.equal(round.wrong.length, 3);
assert.ok(round.wrong.every((w) => !/montañas|frase|viene|ríos/i.test(w)), round.wrong.join());
// A chorus line sung twice in a row: its words are on screen in the line before, so the gap is never one of them.
const twice = ["Aquí viene la frase con montañas y ríos", "Segunda línea que se canta después", "Aquí viene la frase con montañas y ríos"];
const twiceHeard = [...heard(3, twice[0]), ...heard(8.5, twice[1]), ...heard(12, twice[2])];
const repeated = pickRound(twice, twiceHeard);
assert.ok(repeated, "another word still makes a round");
const shownBefore = repeated.lines.slice(0, -1).map((l) => l.text.toLowerCase()).join(" ");
assert.ok(!shownBefore.includes(repeated.answer.toLowerCase()), `${repeated.answer} is already on screen`);
// Unclear words (Whisper unsure) never make a gap; what doesn't line up with the lyrics isn't a round.
assert.equal(pickRound(lines, words.map((w) => ({ ...w, prob: 0.3 }))), null);
assert.equal(pickRound(lines, heard(3, "algo que no está en la letra para nada de nada ni un poco")), null);
assert.equal(wrongAnswers("Ford", ["Fiat Honda Chevy Tesla"], "en").every((w) => /^[A-Z]/.test(w)), true);

// Loading: the rows of the file, each tied to its audio; a song that can't be a round (data null) is left out.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyrics-"));
const file = path.join(dir, "lyric-rounds.json");
const { heard: _, ...data } = round;
writeRoundsFile({ [s1.id]: { preview_url: s1.previewUrl, preview_etag: "abc", data }, [s2.id]: { preview_url: s2.previewUrl, data: null } }, file);
const loaded = await loadLyricRounds({ file, log: { log() {}, warn() {} } });
assert.equal(loaded.size, 1);
assert.equal(loaded.get(s1.id).verse.answer, "montañas");
assert.equal(loaded.get(s1.id).verse.cutMs, Math.round(data.cut * 1000));
fs.rmSync(dir, { recursive: true, force: true });

// A round only plays with the very audio it was measured on.
const checked = new RoomManager({ catalog, store: { users: {} }, lyricRounds: loaded });
assert.equal(checked.lyricFor(s1).answer, "montañas");
assert.equal(checked.lyricFor({ ...s1, previewUrl: "https://audio-ssl.itunes.apple.com/otro.m4a" }), null, "another preview");

// Rounds for the room's tests (made up).
const row = (songId, i) =>
  toVerse({
    song_id: songId,
    data: {
      lines: [
        { at: 6, text: `Una primera línea inventada ${i}` },
        { at: 10, text: `Esta es una línea inventada número ${i} que termina en ___` },
      ],
      cut: 14 + i,
      end: 15 + i,
      answer: `palabra secreta ${i}`,
      wrong: [`otra cosa ${i}`, `algo distinto ${i}`, `nada que ver ${i}`],
    },
  });
const bank = new Map([s1, s2, s3].map((s, i) => [s.id, [row(s.id, i + 1)]]));

const mgr = new RoomManager({ catalog, store: { users: {} }, lyrics: bank });
const host = { id: "h-1", name: "Host", socketId: "s1" };

// A new room only guesses the title; nothing changes for it.
const plain = mgr.create({ host, mode: "multi", game: "musica" });
assert.deepEqual(plain.config.styles, ["titulo"]);
assert.ok(mgr.publicState(plain).lyricsReady >= 3);

// Only Completa la letra: just the songs with their verse play; with fewer than the rounds the match can't start.
const r = mgr.create({ host: { id: "l-1", name: "L", socketId: "s2" }, mode: "multi", game: "musica" });
mgr.addPlayer(r, { id: "l-2", name: "M", socketId: "s3" });
mgr.updateConfig(r, "l-1", { styles: ["letra"], formats: ["escribir"], rounds: 5 });
assert.equal(mgr.publicState(r).songsReady, 3);
assert.throws(() => mgr.start(r, "l-1"), /Solo hay 3 canciones listas con su letra para 5 rondas/);
mgr.updateConfig(r, "l-1", { styles: [] });

assert.throws(() => mgr.start(r, "l-1"), /al menos un modo de juego/);

// Three rounds with three verses: an open round, the line from the countdown on, the words only at the reveal.
const lyricOnly = new RoomManager({ catalog, store: { users: {} }, lyrics: bank });
const o = lyricOnly.create({ host: { id: "o-1", name: "O", socketId: "s4" }, mode: "multi", game: "musica" });
lyricOnly.addPlayer(o, { id: "o-2", name: "P", socketId: "s5" });
lyricOnly.updateConfig(o, "o-1", { styles: ["letra"], formats: ["escribir"] });
o.config.rounds = 3;
lyricOnly.start(o, "o-1");
let state = lyricOnly.publicState(o);
const track = o.tracks[0];
assert.equal(track.style, "letra");
assert.ok(bank.has(track.id));
assert.equal(state.lyrics.lines.at(-1).text, track.lyric.line);
assert.equal(state.lyrics.lines[0].atMs, 6000);
assert.equal(state.lyrics.answer, null);
assert.equal(state.lyrics.blanks, undefined, "nothing says how long the words are");
assert.equal(state.lyrics.revealFromMs, track.lyric.cutMs - 3000);
assert.equal(state.lyrics.startMs, track.lyric.cutMs - 10000);
// The round lasts the bit of song before the cut plus its seconds to answer.
assert.equal(state.lyrics.roundMs, o.config.roundMs + 10000);
assert.ok(!JSON.stringify(state).includes(track.lyric.answer), "the words never go out before the reveal");
lyricOnly.beginPlaying(o);
assert.equal(o.phaseEndsAt - o.phaseStartedAt, o.config.roundMs + 10000);
state = lyricOnly.publicState(o);
assert.ok(!JSON.stringify(state).includes(track.lyric.answer));
// Written like Trivia's open answers: accents and capitals don't matter, an alias counts, a wrong option doesn't.
const n = Number(track.lyric.answer.split(" ").pop());
lyricOnly.submitAnswer(o, "o-1", `PALABRA SECRÉTA ${n}`);
assert.equal(o.players.get("o-1").lastAnswer.correct, true);
assert.ok(o.players.get("o-1").score >= 500);
lyricOnly.submitAnswer(o, "o-2", track.lyric.wrong[0]);
clearTimeout(o.timer);
assert.equal(o.phase, "reveal");
assert.equal(o.players.get("o-2").lastAnswer.correct, false);
state = lyricOnly.publicState(o);
assert.equal(state.lyrics.answer, track.lyric.answer);
// The reveal plays the last 3 s before the cut again, until the words are sung and 1.8 s more.
assert.ok(Math.abs(o.phaseEndsAt - o.phaseStartedAt - (3000 + 1000 + 1800)) <= 5, "the clock may tick a millisecond");
// The match's summary has the verse and its words.
const summary = o.players.get("o-1").rounds[0];
assert.equal(summary.prompt, track.lyric.line);
assert.equal(summary.answer, track.lyric.answer);
assert.equal(summary.status, "ok");
// Every round a different song with its verse.
while (o.tracks.length < o.totalRounds) {
  o.currentRound = o.tracks.length - 1;
  lyricOnly.pickAhead(o);
}
assert.equal(new Set(o.tracks.map((t) => t.id)).size, 3);
assert.ok(o.tracks.every((t) => t.style === "letra"));
clearTimeout(o.timer);

// Closed: the words among three wrong ones, graded at the reveal.
const c = lyricOnly.create({ host: { id: "c-1", name: "C", socketId: "s6" }, mode: "multi", game: "musica" });
lyricOnly.updateConfig(c, "c-1", { styles: ["letra"], formats: ["opciones"] });
c.config.rounds = 3;
lyricOnly.start(c, "c-1");
lyricOnly.beginPlaying(c);
state = lyricOnly.publicState(c);
const ct = c.tracks[0];
assert.equal(state.choice.type, "choice");
assert.deepEqual([...state.choice.options].sort(), [ct.lyric.answer, ...ct.lyric.wrong].sort());
assert.equal(state.choice.answer, null);
lyricOnly.submitAnswer(c, "c-1", ct.answer);
clearTimeout(c.timer);
assert.equal(c.phase, "reveal");
assert.equal(c.players.get("c-1").lastAnswer.correct, true);
clearTimeout(c.timer);

// Both modes: the rounds are shared, and with no verse left a round guesses the title.
const b = lyricOnly.create({ host: { id: "b-1", name: "B", socketId: "s7" }, mode: "multi", game: "musica" });
lyricOnly.updateConfig(b, "b-1", { styles: ["titulo", "letra"], rounds: 10 });
lyricOnly.start(b, "b-1");
while (b.tracks.length < b.totalRounds) {
  b.currentRound = b.tracks.length - 1;
  lyricOnly.pickAhead(b);
}
const letra = b.tracks.filter((t) => t.style === "letra").length;
assert.ok(letra >= 1 && letra <= 3, `${letra} rounds of Completa la letra`);
assert.equal(b.tracks.length, 10);
assert.equal(new Set(b.tracks.map((t) => t.id)).size, 10);
clearTimeout(b.timer);

console.log("lyrics.test ok");
