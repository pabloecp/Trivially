import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { QuestionStats, addExtra, mergeEntries } from "../db/questionStats.js";
import { MAX_NAMED, outcomeOf, roundStats } from "./questionStats.js";
import { RoomManager, openAnswerCheck } from "./roomManager.js";

// How each question does: one entry per question at every reveal, made differently for each game; only people count.
const T0 = 1_000_000;
const manager = { isPlaying: (room, id) => !room.players.get(id).spectator && room.kingId !== id };
const roomOf = (game, players, extra = {}) => ({ game, phaseStartedAt: T0, tiebreak: null, players: new Map(players.map((p) => [p.id, p])), ...extra });
const person = (id, lastAnswer, more = {}) => ({ id, lastAnswer, lastPoints: lastAnswer?.correct ? 800 : 0, ...more });

// ---- What each player did ----
assert.equal(outcomeOf(null), "blank");
assert.equal(outcomeOf({ text: "", correct: false }), "blank");
assert.equal(outcomeOf({ text: "", skipped: true }), "skipped");
assert.equal(outcomeOf({ text: "Saltó la pregunta", gaveUp: true }), "skipped");
assert.equal(outcomeOf({ text: "París", correct: true }), "correct");
assert.equal(outcomeOf({ text: "Lyon", correct: false }), "wrong");
assert.equal(outcomeOf({ pin: [1, 2], correct: false }), "wrong");
assert.equal(outcomeOf({ year: 1900, correct: false }), "wrong");

// ---- Trivia: right, wrong, skipped and blank; the wrong option picked; never a bot or a spectator ----
{
  const track = { id: "q1", type: "choice", text: "¿Capital de Francia?", category: "Geografía", difficulty: "facil", options: ["París", "Lyon", "Niza", "Roma"], answer: 0 };
  const room = roomOf("opciones", [
    person("a", { text: "París", choice: 0, correct: true, at: T0 + 3000 }),
    person("b", { text: "Lyon", choice: 1, correct: false, at: T0 + 5000 }),
    person("c", { text: "", skipped: true, at: T0 + 1000 }),
    person("d", { text: "", correct: false }),
    person("bot", { text: "París", choice: 0, correct: true, at: T0 + 100 }, { bot: true }),
    person("watcher", null, { spectator: true }),
  ]);
  const [e] = roundStats(manager, room, track);
  assert.deepEqual(
    { id: e.questionId, variant: e.variant, seen: e.seen, players: e.players, correct: e.correct, wrong: e.wrong, skipped: e.skipped, blank: e.blank, ms: e.correctMs, points: e.points },
    { id: "q1", variant: "opciones", seen: 1, players: 4, correct: 1, wrong: 1, skipped: 1, blank: 1, ms: 3000, points: 800 }
  );
  assert.equal(e.difficulty, "facil");
  assert.deepEqual(e.extra, { picked: { lyon: 1 } });
  // The written version of the same question counts under the same id, apart by its variant, with what was written.
  const open = { id: "q1:escribir", baseId: "q1", type: "open", text: "¿Capital de Francia?", answer: "París" };
  const [w] = roundStats(manager, roomOf("opciones", [person("a", { text: "Paris Francia", correct: false, at: T0 })]), open);
  assert.equal(w.questionId, "q1");
  assert.equal(w.variant, "escribir");
  assert.deepEqual(w.extra, { written: { "paris francia": 1 } });
  // Nothing in a tiebreak.
  assert.deepEqual(roundStats(manager, { ...room, tiebreak: { playerIds: ["a"] } }, track), []);
  // A question an owner skipped: only that, no players.
  const [skipped] = roundStats(manager, room, { ...track, ownerSkipped: true });
  assert.equal(skipped.players, 0);
  assert.deepEqual(skipped.extra, { ownerSkips: 1 });
}

// ---- Adivina la canción: the song (or the verse) and its mode of play ----
{
  const song = { id: "s1", title: "Hello", artistName: "Adele", type: "open" };
  const [e] = roundStats(manager, roomOf("musica", [person("a", { text: "Hello - Adele", correct: true, at: T0 + 9000 })]), song);
  assert.equal(e.questionId, "s1");
  assert.equal(e.variant, "titulo:escribir");
  assert.equal(e.prompt, "Hello - Adele");
  const verse = { ...song, type: "choice", options: ["cansé", "quedé"], lyric: { id: "s1:12.5", line: "Y es que me ___", answer: "cansé" } };
  const [l] = roundStats(manager, roomOf("musica", [person("a", { text: "quedé", choice: 1, correct: false, at: T0 })]), verse);
  assert.equal(l.questionId, "s1:12.5");
  assert.equal(l.variant, "letra:opciones");
  assert.deepEqual(l.extra, { picked: { "quedé": 1 } });
}

// ---- Encuentra el país: inside the country, or how far outside ----
{
  const track = { id: "fr", style: "bandera", prompt: "Francia", difficulty: "media" };
  const [e] = roundStats(manager, roomOf("mundo", [
    person("a", { pin: [2, 48], correct: true, inside: true, distanceKm: 0, at: T0 + 4000 }),
    person("b", { pin: [10, 50], correct: false, distanceKm: 420.4, at: T0 }),
    person("c", { pin: [12, 50], correct: false, distanceKm: 600, at: T0 }),
  ]), track);
  assert.equal(e.variant, "bandera");
  assert.equal(e.correct, 1);
  assert.equal(e.wrong, 2);
  assert.equal(e.extra.wrongKm, 1020);
}

// ---- Rango: how far off, and to which side ----
{
  const years = { id: "h1", kind: "años", year: 1914, text: "Empieza la Primera Guerra Mundial" };
  const [y] = roundStats(manager, roomOf("historia", [
    person("a", { year: 1914, correct: true, diff: 0, at: T0 + 2000 }),
    person("b", { year: 1918, correct: false, diff: 4, at: T0 }),
    person("c", { year: 1910, correct: false, diff: 4, at: T0 }),
  ]), years);
  assert.equal(y.extra.wrongOff, 8);
  assert.deepEqual(y.extra.direction, { despues: 1, antes: 1 });
  const figure = { id: "f1", kind: "cifras", value: 100, span: 1000, text: "Altura" };
  const [f] = roundStats(manager, roomOf("historia", [person("a", { value: 300, correct: false, diff: 200, over: true, at: T0 })]), figure);
  assert.equal(f.variant, "cifras");
  assert.equal(f.extra.wrongOff, 200, "the error over the bar's span, in thousandths");
  assert.deepEqual(f.extra.direction, { arriba: 1 });
}

// ---- Campo de minas: each board, how each person ended it, and which cells fooled them ----
{
  const board = {
    id: "b1",
    style: "turnos",
    prompt: "Juegos de Mario",
    cells: [
      { text: "Mario Kart", correct: true, by: "a" },
      { text: "Paper Mario", correct: true, by: "b" },
      { text: "Halo", correct: false, by: "b" },
      { text: "Zelda", correct: false, by: "bot" },
      { text: "Mario 64", correct: true, by: null },
    ],
  };
  const room = roomOf("minas", [
    person("a", null, { minefield: { hits: 1, points: 100, out: null } }),
    person("b", null, { minefield: { hits: 1, points: 100, out: "mina" } }),
    person("c", null, { minefield: { hits: 0, points: 0, out: "tiempo" } }),
    person("bot", null, { bot: true, minefield: { hits: 0, points: 0, out: "mina" } }),
  ]);
  const [e] = roundStats(manager, room, board);
  assert.deepEqual([e.players, e.correct, e.wrong, e.blank, e.extra.hits], [3, 1, 1, 1, 2]);
  assert.deepEqual(e.extra.cells, { "ok:mario kart": 1, "ok:paper mario": 1, "mina:halo": 1 }, "the bot's pick doesn't count");
}

// ---- Lluvia: one entry per question that fell: taken by a person, by a bot, or by nobody ----
{
  const q = (id) => ({ id, text: `Pregunta ${id}`, difficulty: "facil" });
  const round = {
    roundMs: 60000,
    drops: [
      { at: 1000, points: 1, question: q("x"), by: "a", takenAt: 4000 },
      { at: 2000, points: 3, question: q("y"), by: null },
      { at: 3000, points: 1, question: q("z"), by: "bot", takenAt: 5000 },
      { at: 61000, points: 1, question: q("late"), by: null },
    ],
  };
  const room = roomOf("lluvia", [person("a", null, { rain: { sent: 2 } }), person("b", null, { rain: { sent: 0 } }), person("bot", null, { bot: true, rain: {} })]);
  const entries = roundStats(manager, room, round);
  assert.deepEqual(entries.map((e) => e.questionId), ["x", "y", "z"], "only those that fell");
  assert.deepEqual([entries[0].players, entries[0].correct, entries[0].correctMs, entries[0].points], [2, 1, 3000, 1]);
  assert.deepEqual([entries[1].correct, entries[1].blank], [0, 1]);
  assert.deepEqual([entries[2].players, entries[2].extra], [0, { byBot: 1 }]);
}

// ---- Rey de la colina: the challengers, never the king ----
{
  const track = { id: "r1", type: "open", text: "¿Capital de Perú?", answer: "Lima", rey: true, kingId: "k", dethronedBy: "a" };
  const room = roomOf("rey", [person("k", { text: "Perdió la corona", correct: false }), person("a", { text: "Lima", correct: true, at: T0 + 2500 }), person("b", null)], { kingId: "k" });
  const [e] = roundStats(manager, room, track);
  assert.deepEqual([e.players, e.correct, e.blank, e.extra.dethroned], [2, 1, 1, 1]);
}

// ---- Farsante: only "dato raro", by the votes ----
{
  const round = {
    kind: "dato",
    text: "¿Qué animal…?",
    truth: "El ajolote",
    question: { id: "d1", difficulty: "media", text: "¿Qué animal…?" },
    entries: { a: "el ajolote", b: "Una rana" },
    options: [{ text: "El ajolote", author: null }, { text: "Una rana", author: "b" }],
    votes: { a: 0, b: 0, c: 1 },
  };
  const [e] = roundStats(manager, roomOf("farsante", [person("a", null), person("b", null), person("c", null), person("d", null)]), round);
  assert.deepEqual([e.questionId, e.players, e.correct, e.wrong, e.blank, e.extra.wroteTruth], ["d1", 4, 2, 1, 1, 1]);
  assert.deepEqual(roundStats(manager, roomOf("farsante", [person("a", null)]), { kind: "pregunta", text: "¿Qué harías…?" }), []);
}

// ---- Adding up: rows only grow; a group of named answers stops growing at MAX_NAMED ----
assert.deepEqual(addExtra({ picked: { a: 1 }, wrongKm: 5 }, { picked: { a: 2, b: 1 }, wrongKm: 1 }), { picked: { a: 3, b: 1 }, wrongKm: 6 });
const twice = mergeEntries(mergeEntries(null, { game: "g", questionId: "1", seen: 1, correct: 1, extra: {} }), { game: "g", questionId: "1", seen: 1, wrong: 1, extra: {} });
assert.deepEqual([twice.seen, twice.correct, twice.wrong], [2, 1, 1]);
{
  const many = roomOf("opciones", Array.from({ length: MAX_NAMED + 5 }, (_, i) => person(`p${i}`, { text: `respuesta ${i}`, correct: false })));
  const [e] = roundStats(manager, many, { id: "q", type: "open", text: "?", answer: "x" });
  assert.equal(Object.keys(e.extra.written).length, MAX_NAMED + 1);
  assert.equal(e.extra.written.otras, 5);
}

// ---- A real room: the reveal adds the round to the counts, saved to the file without Supabase ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trivially-stats-"));
const file = path.join(dir, "question-stats.json");
const stats = new QuestionStats({ db: null, file, log: { warn() {} } });
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} }, questionStats: stats });
const room = mgr.create({ host: { id: "user", name: "User", socketId: "s1" }, game: "musica" });
mgr.addPlayer(room, { id: "other", name: "Other", socketId: "s2" });
mgr.start(room, "user");
clearTimeout(room.timer);
mgr.beginPlaying(room);
clearTimeout(room.timer);
const track = room.tracks[room.currentRound];
mgr.skip(room, "other");
clearTimeout(room.timer);
if (room.phase !== "reveal") mgr.beginReveal(room);
clearTimeout(room.timer);
await stats.flush();
const saved = Object.values(JSON.parse(fs.readFileSync(file, "utf8")));
assert.equal(saved.length, 1);
assert.equal(saved[0].game, "musica");
assert.equal(saved[0].questionId, track.lyric?.id || track.id);
assert.deepEqual([saved[0].seen, saved[0].players, saved[0].skipped, saved[0].blank], [1, 2, 1, 1]);
assert.ok(["facil", "media", "dificil"].includes(saved[0].difficulty), "a song's difficulty, from its ranking");
// A report says where its counts are, and the counts so far come back for it.
const looked = await stats.lookup("musica", saved[0].questionId);
assert.equal(looked[0].players, 2);
mgr.destroy(room);
fs.rmSync(dir, { recursive: true, force: true });

// ---- A report's check of a written answer: why it was or wasn't taken ----
const check = openAnswerCheck("Franz", { answer: "Franz Kafka", aliases: ["Kafka"], reject: ["Albert Camus"], answerType: "name" });
assert.equal(check.taken, false);
assert.equal(check.written, "franz");
assert.deepEqual(check.accepted, ["franz kafka", "kafka"]);
assert.equal(check.closest.form, "kafka");
assert.equal(openAnswerCheck("Albert Camus", { answer: "Franz Kafka", reject: ["Albert Camus"] }).rejected, true);

console.log("questionStats ok");
