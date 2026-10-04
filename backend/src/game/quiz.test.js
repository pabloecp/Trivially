import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { questionErrors } from "../questions/questionSchema.js";
import { sampleQuestions } from "../questions/sampleQuestions.js";
import { countQuestions, mergeQuizConfig, pickQuestions } from "./quiz.js";
import { RoomManager } from "./roomManager.js";

const bank = sampleQuestions();

// The placeholder bank is valid and has enough questions for the longest match at every difficulty.
for (const q of bank) assert.deepEqual(questionErrors(q), [], q.id);
for (const d of ["facil", "media", "dificil"]) assert.ok(countQuestions(bank, d) >= 20, d);
assert.equal(countQuestions(bank, "mixta"), bank.length);

// Validation catches broken rows.
const good = bank[0];
assert.match(questionErrors({ ...good, category: "cocina" }).join(), /category/);
assert.match(questionErrors({ ...good, data: { options: ["a", "b", "c"], correct: 0 } }).join(), /options/);
assert.match(questionErrors({ ...good, data: { options: ["a", "b", "c", "A"], correct: 0 } }).join(), /repetidas/);
assert.match(questionErrors({ ...good, data: { options: ["a", "b", "c", "d"], correct: 4 } }).join(), /correct/);
// Other types aren't played yet, and questions of other modes are left out.
assert.equal(countQuestions([{ ...good, type: "true_false" }, { ...good, mode: "otro" }, { ...good, mode: null }], "mixta"), 1);

// Shuffled options keep pointing at the right answer, the category shows by name, and a match never repeats.
const picked = pickQuestions(bank, 10, "media");
assert.equal(new Set(picked.map((q) => q.id)).size, 10);
for (const q of picked) {
  const original = bank.find((o) => o.id === q.id);
  assert.equal(q.difficulty, "media");
  assert.equal(q.options[q.answer], original.data.options[original.data.correct]);
  assert.ok(!q.category.includes("_"), q.category);
}

// Settings stay inside their limits.
assert.deepEqual(mergeQuizConfig(undefined, { rounds: 99, roundMs: 1000, difficulty: "imposible" }), {
  rounds: 20,
  roundMs: 5000,
  difficulty: "mixta",
});

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} }, questions: bank });
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "opciones" });
mgr.addPlayer(room, { id: "guest-2", name: "Guest", socketId: "s2" });
mgr.addPlayer(room, { id: "late-3", name: "Late", socketId: "s3" });
assert.throws(() => mgr.updateConfig(room, "guest-2", { quiz: { rounds: 5 } }), /permisos/);
mgr.updateConfig(room, "host-1", { quiz: { rounds: 5, roundMs: 10000, difficulty: "facil" } });
assert.equal(mgr.publicState(room).questionsReady, countQuestions(bank, "facil"));

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
assert.equal(mgr.roundMs(room), 10000);
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
big.config.quiz = { rounds: 99, roundMs: 15000, difficulty: "facil" };
assert.throws(() => mgr.start(big, "solo-1"), /preguntas/);

// Without a question bank the mode can't start.
const empty = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const none = empty.create({ host: { id: "solo-2", name: "Solo", socketId: "s5" }, mode: "multi", game: "opciones" });
assert.throws(() => empty.start(none, "solo-2"), /preguntas/);

console.log("quiz.test ok");
