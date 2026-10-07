import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { questionErrors } from "../questions/questionSchema.js";
import { sampleQuestions } from "../questions/sampleQuestions.js";
import { geoBank } from "./geo.js";
import { historyBank } from "./history.js";
import { countQuestions, mergeQuizConfig, pickQuizQuestions, questionCounts, quizPool } from "./quiz.js";
import { RoomManager } from "./roomManager.js";

const bank = sampleQuestions();
// Only the multiple-choice questions of the bank (Geografía's and Historia's join in quizPool, tested below).
const choices = { formats: ["opciones"] };
const at = (difficulty) => ({ ...choices, difficulty });

// The placeholder bank is valid and has enough questions for the longest match at every difficulty.
for (const q of bank) assert.deepEqual(questionErrors(q), [], q.id);
for (const d of ["facil", "media", "dificil"]) assert.ok(countQuestions(bank, at(d)) >= 20, d);
assert.equal(countQuestions(bank, at("mixta")), bank.length);

// Validation catches broken rows.
const good = bank[0];
assert.match(questionErrors({ ...good, category: "cocina" }).join(), /category/);
assert.match(questionErrors({ ...good, data: { options: ["a", "b", "c"], correct: 0 } }).join(), /options/);
assert.match(questionErrors({ ...good, data: { options: ["a", "b", "c", "A"], correct: 0 } }).join(), /repetidas/);
assert.match(questionErrors({ ...good, data: { options: ["a", "b", "c", "d"], correct: 4 } }).join(), /correct/);
// Other types aren't played yet, and questions of other modes are left out.
assert.equal(countQuestions(quizPool([{ ...good, type: "true_false" }, { ...good, mode: "otro" }, { ...good, mode: null }]), {}), 1);

// Shuffled options keep pointing at the right answer, the category shows by name, and a match never repeats.
const picked = pickQuizQuestions(bank, { ...at("media"), rounds: 10 });
assert.equal(new Set(picked.map((q) => q.id)).size, 10);
for (const q of picked) {
  const original = bank.find((o) => o.id === q.id);
  assert.equal(q.difficulty, "media");
  assert.equal(q.type, "choice");
  assert.equal(q.options[q.answer], original.data.options[original.data.correct]);
  assert.ok(!q.category.includes("_"), q.category);
}

// Settings stay inside their limits.
assert.deepEqual(
  mergeQuizConfig(undefined, { rounds: 99, roundMs: 1000, difficulties: ["imposible", "media"], categories: ["cocina", "ciencia"], formats: ["dibujar", "escribir"] }),
  { rounds: 20, roundMs: 15000, difficulties: ["media"], categories: ["ciencia"], formats: ["escribir"] }
);
// Everything is chosen by default; an older client's single difficulty still works.
assert.deepEqual(mergeQuizConfig().difficulties, ["facil", "media", "dificil"]);
assert.deepEqual(mergeQuizConfig().formats, ["opciones", "escribir"]);
assert.equal(mergeQuizConfig().categories.length, 10);
assert.deepEqual(mergeQuizConfig(undefined, { difficulty: "facil" }).difficulties, ["facil"]);
// Every list can be unticked: there is then nothing to play.
const blank = mergeQuizConfig(undefined, { categories: [], formats: [], difficulties: [] });
assert.deepEqual([blank.categories, blank.formats, blank.difficulties], [[], [], []]);

// The whole pool: the bank's own questions, Geografía's capitals and flags (written) and Historia's events (a year).
// Map questions stay in the Encuentra el país extra.
const pool = quizPool(bank, geoBank(bank), historyBank(bank));
const types = new Set(pool.map((q) => q.type));
assert.deepEqual([...types].sort(), ["multiple_choice", "open", "year"]);
const counts = questionCounts(pool, {});
// "Opciones" is choosing: one of four, or a year on the timeline.
assert.equal(counts.formats.opciones, bank.length + historyBank(bank).length);
assert.ok(counts.formats.escribir > 100);
assert.ok(counts.difficulties.facil > 0 && counts.difficulties.dificil > 0);
assert.ok(counts.categories.geografia > 100 && counts.categories.historia > 20);
// A topic narrows the counts of the ways of answering, and a way of answering those of the topics.
assert.equal(questionCounts(pool, { categories: ["historia"] }).formats.escribir, undefined);
assert.equal(questionCounts(pool, { formats: ["escribir"] }).categories.historia, undefined);
// A mixed match shares the rounds between the ways of answering.
const mixed = pickQuizQuestions(pool, { rounds: 9 });
assert.deepEqual(
  ["choice", "open", "year"].map((t) => mixed.filter((q) => q.type === t).length),
  [3, 3, 3]
);
// Only the topics chosen.
assert.ok(pickQuizQuestions(pool, { rounds: 10, categories: ["geografia"] }).every((q) => q.category === "Geografía"));

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} }, questions: bank });
const quizCount = (config) => countQuestions(mgr.quizQuestions, config);
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "opciones" });
mgr.addPlayer(room, { id: "guest-2", name: "Guest", socketId: "s2" });
mgr.addPlayer(room, { id: "late-3", name: "Late", socketId: "s3" });
assert.throws(() => mgr.updateConfig(room, "guest-2", { quiz: { rounds: 5 } }), /permisos/);
// Every topic but Historia: "Opciones" are then only the bank's four-option questions (no years).
const noYears = { difficulties: ["facil"], formats: ["opciones"], categories: mergeQuizConfig().categories.filter((c) => c !== "historia") };
mgr.updateConfig(room, "host-1", { quiz: { rounds: 5, roundMs: 20000, ...noYears } });
assert.equal(mgr.publicState(room).questionsReady, quizCount(noYears));
assert.ok(mgr.publicState(room).questionCounts.categories.geografia > 0, "each topic is counted, ticked or not");

mgr.start(room, "host-1");
assert.equal(room.totalRounds, 5);
assert.ok(room.tracks.every((q) => q.difficulty === "facil"));

// Countdown: the question shows, its options and right answer don't. No question id ever leaves the server.
let state = mgr.publicState(room);
assert.equal(room.phase, "countdown");
assert.ok(state.question.text);
assert.equal(state.question.options, null);
assert.equal(state.question.answer, null);
assert.equal("id" in state.question, false);
assert.equal(state.audio, null);
assert.throws(() => mgr.submitAnswer(room, "host-1", 0), /No se aceptan/);

mgr.beginPlaying(room);
assert.equal(mgr.roundMs(room), 20000);
state = mgr.publicState(room);
assert.equal(state.question.options.length, 4);
assert.equal(state.question.answer, null);
assert.equal(state.searchCatalog, undefined);

// Answers are option positions, and they are not graded yet: nothing tells anyone whether it was right.
const q = room.tracks[0];
assert.throws(() => mgr.submitAnswer(room, "host-1", 7), /opciones/);
mgr.submitAnswer(room, "host-1", q.answer);
const mine = mgr.publicState(room, "host-1");
assert.equal(mine.me.lastAnswer.choice, q.answer);
assert.equal("correct" in mine.me.lastAnswer, false);
assert.equal(mine.me.lastPoints, 0);
const hostPublic = mine.players.find((p) => p.id === "host-1");
assert.equal(hostPublic.answered, true);
assert.equal(hostPublic.lastAnswer, null);
assert.equal(hostPublic.score, 0);
assert.equal(hostPublic.lastPoints, 0);

const wrong = (q.answer + 1) % 4;
mgr.submitAnswer(room, "guest-2", String(wrong));
assert.equal(room.phase, "playing", "Late hasn't answered yet");

// The round ends: every answer is graded at once, and the reveal shows the right option and the picks.
mgr.beginReveal(room);
clearTimeout(room.timer);
state = mgr.publicState(room);
assert.equal(state.question.answer, q.answer);
assert.equal(state.question.picks[q.answer], 1);
assert.equal(state.question.picks[wrong], 1);
const host = room.players.get("host-1");
assert.equal(host.lastAnswer.correct, true);
assert.ok(host.score > 0 && host.lastPoints === host.score);
assert.equal(host.correct, 1);
assert.equal(host.streak, 1);
assert.equal(room.players.get("guest-2").lastAnswer.correct, false);
assert.equal(room.players.get("guest-2").score, 0);
assert.equal(room.players.get("late-3").lastAnswer.correct, false, "no answer counts as wrong");

// During the reveal the right option is on screen: answering then is refused.
room.players.get("late-3").lastAnswer = null;
assert.throws(() => mgr.submitAnswer(room, "late-3", q.answer), /No se aceptan/);

// Too few questions for the difficulty: the match doesn't start.
const big = mgr.create({ host: { id: "solo-1", name: "Solo", socketId: "s4" }, mode: "multi", game: "opciones" });
big.config.quiz = { rounds: 99, roundMs: 15000, difficulties: ["facil"], categories: ["arte"] };
assert.throws(() => mgr.start(big, "solo-1"), /preguntas/);

// Without a question bank there are still Geografía's and Historia's questions; four options need the bank.
const empty = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const none = empty.create({ host: { id: "solo-2", name: "Solo", socketId: "s5" }, mode: "multi", game: "opciones" });
empty.updateConfig(none, "solo-2", { quiz: { categories: ["ciencia"] } });
assert.throws(() => empty.start(none, "solo-2"), /preguntas/);
// No topic ticked: nothing to play.
empty.updateConfig(none, "solo-2", { quiz: { categories: [] } });
assert.equal(empty.publicState(none).questionsReady, 0);
empty.updateConfig(none, "solo-2", { quiz: { categories: ["geografia", "historia"] } });
empty.start(none, "solo-2");
assert.ok(none.tracks.every((q) => q.type !== "choice"));
clearTimeout(none.timer);

// A written question: its flag only while playing, its answer only at the reveal, checked like Geografía's.
const w = mgr.create({ host: { id: "w-1", name: "W", socketId: "s6" }, mode: "multi", game: "opciones" });
mgr.updateConfig(w, "w-1", { quiz: { rounds: 5, formats: ["escribir"] } });
mgr.start(w, "w-1");
const written = w.tracks[0];
assert.equal(written.type, "open");
state = mgr.publicState(w);
assert.equal(state.question.type, "open");
assert.equal(state.question.flag, null);
assert.equal(state.question.answer, null);
mgr.beginPlaying(w);
if (written.flag) assert.ok(mgr.publicState(w).question.flag.includes("/api/geo/flag/"));
mgr.submitAnswer(w, "w-1", written.answer);
clearTimeout(w.timer);
assert.equal(w.phase, "reveal");
assert.equal(w.players.get("w-1").lastAnswer.correct, true);
assert.ok(w.players.get("w-1").score >= 500 && w.players.get("w-1").score <= 1000);
assert.equal(mgr.publicState(w).question.answer, written.answer);

// A year question (with no bank, "Opciones" are only Historia's events): chosen on the timeline like Línea del
// tiempo's, judged by closeness at the reveal.
const y = empty.create({ host: { id: "y-1", name: "Y", socketId: "s7" }, mode: "multi", game: "opciones" });
empty.updateConfig(y, "y-1", { quiz: { rounds: 5, formats: ["opciones"] } });
empty.start(y, "y-1");
const event = y.tracks[0];
assert.equal(event.type, "year");
assert.equal(empty.publicState(y).question.min, null);
empty.beginPlaying(y);
state = empty.publicState(y);
assert.equal(state.question.min, event.min);
assert.equal(state.question.year, null);
assert.throws(() => empty.submitAnswer(y, "y-1", "1492"), /año/);
empty.placeYear(y, "y-1", { year: event.year, lock: true });
clearTimeout(y.timer);
assert.equal(y.phase, "reveal");
assert.equal(y.players.get("y-1").lastPoints, 1000);
assert.equal(empty.publicState(y).question.year, event.year);
for (const r of [room, big, none, w, y]) clearTimeout(r.timer);

console.log("quiz.test ok");
