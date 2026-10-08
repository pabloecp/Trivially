import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { questionErrors } from "../questions/questionSchema.js";
import { sampleQuestions } from "../questions/sampleQuestions.js";
import { geoBank } from "./geo.js";
import { isCorrectOpenAnswer } from "./openAnswers.js";
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
// Two ways of answering: choosing and writing (the years on a timeline are Línea del tiempo's, not Trivia's).
assert.deepEqual(mergeQuizConfig().formats, ["opciones", "escribir"]);
assert.deepEqual(mergeQuizConfig(undefined, { formats: ["linea", "opciones"] }).formats, ["opciones"]);
assert.equal(mergeQuizConfig().categories.length, 10);
assert.deepEqual(mergeQuizConfig(undefined, { difficulty: "facil" }).difficulties, ["facil"]);
// Every list can be unticked: there is then nothing to play.
const blank = mergeQuizConfig(undefined, { categories: [], formats: [], difficulties: [] });
assert.deepEqual([blank.categories, blank.formats, blank.difficulties], [[], [], []]);

// The whole pool: the bank's own questions and Geografía's capitals and flags (written). Map questions stay in the
// Encuentra el país mode and the years in Línea del tiempo.
const pool = quizPool(bank, geoBank(bank));
const types = new Set(pool.map((q) => q.type));
assert.deepEqual([...types].sort(), ["multiple_choice", "open"]);
const counts = questionCounts(pool, {});
// "Opciones" is the four-option questions.
assert.equal(counts.formats.opciones, bank.length);
assert.ok(counts.formats.escribir > 100);
assert.ok(counts.difficulties.facil > 0 && counts.difficulties.dificil > 0);
assert.ok(counts.categories.geografia > 100);
// A topic narrows the counts of the ways of answering, and a way of answering those of the topics.
const historyChoices = bank.filter((q) => q.category === "historia").length;
assert.equal(questionCounts(pool, { categories: ["historia"] }).formats.escribir || 0, historyChoices);
assert.equal(questionCounts(pool, { formats: ["escribir"] }).categories.geografia > 100, true);
// A mixed match shares the rounds between the ways of answering.
const mixed = pickQuizQuestions(pool, { rounds: 10 });
assert.deepEqual(
  ["choice", "open"].map((t) => mixed.filter((q) => q.type === t).length),
  [5, 5]
);
// Every four-option question can also be written, without options: the right option is the answer and the other three
// are rejected. One added for "Opciones" shows up in "Escribir" too.
const sampleWritten = pool.filter((q) => q.baseId);
const sampleChoices = pool.filter((q) => q.type === "multiple_choice");
assert.ok(sampleWritten.length > 0 && sampleWritten.length <= sampleChoices.length);
for (const w of sampleWritten) {
  const original = sampleChoices.find((q) => q.id === w.baseId);
  assert.equal(w.type, "open");
  assert.equal(w.data.answer, original.data.options[original.data.correct]);
  assert.equal(w.data.reject.length, 3);
  assert.ok(!w.data.reject.includes(w.data.answer));
}
const added = { ...bank[0], id: "nueva-1", prompt: "¿Cuál es el planeta rojo?", category: "ciencia", data: { options: ["Venus", "Marte", "Júpiter", "Saturno"], correct: 1 } };
const withAdded = quizPool([added], [], []);
assert.deepEqual(withAdded.map((q) => q.type).sort(), ["multiple_choice", "open"]);
const asked = pickQuizQuestions(withAdded, { rounds: 5, formats: ["escribir"], categories: ["ciencia"] });
assert.equal(asked.length, 1);
assert.equal(asked[0].type, "open");
assert.equal(asked[0].answer, "Marte");
assert.equal("options" in asked[0], false, "written: no options");
assert.ok(isCorrectOpenAnswer("marte", asked[0]) && !isCorrectOpenAnswer("Venus", asked[0]));
// Asked both ways in a match, it still counts (and is drawn) once.
assert.equal(countQuestions(withAdded, { categories: ["ciencia"], formats: ["opciones", "escribir"] }), 1);
assert.equal(pickQuizQuestions(withAdded, { rounds: 5, categories: ["ciencia"], formats: ["opciones", "escribir"] }).length, 1);
// Ones that only make sense with the options in view stay out of "Escribir".
const needsOptions = { ...added, id: "x", prompt: "¿Cuál de los siguientes es un planeta?" };
assert.equal(quizPool([needsOptions]).length, 1);
// Only the topics chosen.
assert.ok(pickQuizQuestions(pool, { rounds: 10, categories: ["geografia"] }).every((q) => q.category === "Geografía"));

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} }, questions: bank });
const quizCount = (config) => countQuestions(mgr.quizQuestions, config);
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "opciones" });
mgr.addPlayer(room, { id: "guest-2", name: "Guest", socketId: "s2" });
mgr.addPlayer(room, { id: "late-3", name: "Late", socketId: "s3" });
assert.throws(() => mgr.updateConfig(room, "guest-2", { quiz: { rounds: 5 } }), /permisos/);
const onlyOptions = { difficulties: ["facil"], formats: ["opciones"], categories: mergeQuizConfig().categories.filter((c) => c !== "historia") };
mgr.updateConfig(room, "host-1", { quiz: { rounds: 5, roundMs: 20000, ...onlyOptions } });
assert.equal(mgr.publicState(room).questionsReady, quizCount(onlyOptions));
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

// Without a question bank there are still Geografía's capitals and flags (written); four options need the bank.
const empty = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const none = empty.create({ host: { id: "solo-2", name: "Solo", socketId: "s5" }, mode: "multi", game: "opciones" });
empty.updateConfig(none, "solo-2", { quiz: { categories: ["ciencia"] } });
assert.throws(() => empty.start(none, "solo-2"), /preguntas/);
// No topic ticked: nothing to play.
empty.updateConfig(none, "solo-2", { quiz: { categories: [] } });
assert.equal(empty.publicState(none).questionsReady, 0);
empty.updateConfig(none, "solo-2", { quiz: { categories: ["geografia"] } });
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

// "Volver a jugar": only once the match is over, a new one of the same game and settings starts straight away.
assert.throws(() => mgr.replay(w, "w-1"), /no ha terminado/);
mgr.finish(w);
mgr.replay(w, "w-1");
assert.equal(w.phase, "countdown");
assert.equal(w.game, "opciones");
assert.equal(w.players.get("w-1").score, 0);
assert.ok(w.tracks.length === 5 && w.tracks.every((t) => t.type === "open"));
// Pause: only the host; the clock stops, no answer is taken, and it goes on with the time it had left.
mgr.beginPlaying(w);
assert.throws(() => mgr.pause(w, "nadie"), /anfitrión/);
w.phaseEndsAt = Date.now() + 8000;
mgr.pause(w, "w-1");
assert.equal(w.timer, null);
assert.ok(mgr.publicState(w).paused.remainingMs > 7000);
assert.throws(() => mgr.submitAnswer(w, "w-1", "x"), /pausa/);
assert.throws(() => mgr.skip(w, "w-1"), /pausa/);
mgr.resume(w, "w-1");
assert.equal(mgr.publicState(w).paused, null);
assert.ok(w.timer && w.phaseEndsAt - Date.now() > 7000 && w.phaseEndsAt - Date.now() <= 8000);
mgr.skip(w, "w-1");
assert.equal(w.phase, "reveal");
for (const r of [room, big, none, w]) clearTimeout(r.timer);

console.log("quiz.test ok");
