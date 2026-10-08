import assert from "node:assert/strict";
import { MINEFIELD_CELLS, QUESTION_CATEGORIES, QUESTION_DIFFICULTIES, questionErrors, toQuestion } from "../questions/questionSchema.js";
import {
  countMinesQuestions,
  minesCounts,
  hitPoints,
  mergeMinesConfig,
  MINES_CATEGORIES,
  minesBank,
  pickMinesQuestions,
  toMinesBoard,
} from "../game/mines.js";
import { buildMinesQuestions } from "./minesQuestions.js";

// Campo de minas' boards, how a match draws them and how a hit is scored.
const rows = buildMinesQuestions();

// Every board is a valid row of 25 cells, once; ten per category and difficulty.
assert.equal(rows.length, 300);
for (const q of rows) {
  assert.deepEqual(questionErrors(q), [], q.prompt);
  assert.equal(q.data.correct.length + q.data.wrong.length, MINEFIELD_CELLS);
}
assert.equal(new Set(rows.map((q) => q.id)).size, rows.length, "ids repetidos");
assert.equal(new Set(rows.map((q) => q.prompt.toLowerCase())).size, rows.length, "tableros repetidos");
for (const category of Object.keys(QUESTION_CATEGORIES)) {
  for (const difficulty of QUESTION_DIFFICULTIES) {
    const count = rows.filter((q) => q.category === category && q.difficulty === difficulty).length;
    assert.equal(count, 10, `${category} ${difficulty}: ${count} tableros`);
  }
}

// The schema refuses broken boards.
const board = rows[0];
assert.equal(questionErrors({ ...board, data: { ...board.data, wrong: board.data.wrong.slice(1) } }).length, 1, "24 cells");
assert.ok(questionErrors({ ...board, data: { correct: board.data.correct, wrong: [...board.data.wrong.slice(1), board.data.correct[0]] } }).length, "a repeated cell");
assert.ok(questionErrors({ ...board, data: { correct: ["Uno", "Dos"], wrong: Array.from({ length: 23 }, (_, i) => `Mina ${i}`) } }).length, "too few right answers");
assert.ok(questionErrors({ ...board, data: { correct: "España" } }).length, "not lists");

// Settings stay within their limits.
assert.deepEqual(mergeMinesConfig(), {
  styles: ["turnos", "carrera"],
  rounds: 5,
  turnMs: 10000,
  roundMs: 45000,
  categories: MINES_CATEGORIES,
  difficulties: ["facil", "media", "dificil"],
});
assert.deepEqual(mergeMinesConfig({}, { styles: ["carrera", "a ciegas"] }).styles, ["carrera"], "an unknown way to play is ignored");
assert.deepEqual(mergeMinesConfig({}, { styles: [] }).styles, [], "every way can be unticked");
// An older client or room with a single `style`.
assert.deepEqual(mergeMinesConfig({}, { style: "carrera" }).styles, ["carrera"]);
assert.deepEqual(mergeMinesConfig({ style: "carrera" }, { style: "a ciegas" }).styles, ["carrera"]);
assert.equal(mergeMinesConfig({}, { roundMs: 999999 }).roundMs, 90000);
assert.equal(mergeMinesConfig({}, { roundMs: 1000 }).roundMs, 30000);
assert.equal(mergeMinesConfig({}, { rounds: 99 }).rounds, 10);
assert.equal(mergeMinesConfig({}, { rounds: 1 }).rounds, 3);
assert.equal(mergeMinesConfig({}, { turnMs: 999999 }).turnMs, 20000);
assert.equal(mergeMinesConfig({}, { turnMs: 1000 }).turnMs, 5000);
assert.deepEqual(mergeMinesConfig({}, { difficulties: ["dificil", "imposible", "facil"] }).difficulties, ["facil", "dificil"]);
assert.deepEqual(mergeMinesConfig({}, { difficulties: [] }).difficulties, [], "every difficulty can be unticked");
assert.deepEqual(mergeMinesConfig({}, { categories: ["arte", "nada", "ciencia"] }).categories, ["ciencia", "arte"]);
assert.deepEqual(mergeMinesConfig({}, { categories: [] }).categories, [], "every category can be unticked");

// The bank: the committed boards when Supabase has none, Supabase's when it has them.
const bank = minesBank([]);
assert.equal(bank.length, 300);
const fromDb = [toQuestion({ ...rows[0], id: "db-1" })];
assert.deepEqual(minesBank(fromDb).map((q) => q.id), ["db-1"]);
assert.equal(countMinesQuestions(bank, {}), 300);
assert.equal(countMinesQuestions(bank, { categories: ["arte"], difficulties: ["facil"] }), 10);
assert.equal(countMinesQuestions(bank, { categories: ["arte"], difficulties: ["facil", "dificil"] }), 20);
assert.equal(countMinesQuestions(bank, { difficulties: [] }), 0);
assert.equal(countMinesQuestions(bank, { categories: [] }), 0);
// The settings' chips: each category with the chosen difficulties, each difficulty with the chosen categories.
let counts = minesCounts(bank, { categories: ["arte", "ciencia"], difficulties: ["media"] });
assert.equal(counts.categories.musica, 10, "categories are counted, ticked or not");
assert.equal(counts.categories.arte, 10);
assert.deepEqual(counts.difficulties, { facil: 20, media: 20, dificil: 20 }, "difficulties are counted, ticked or not");
counts = minesCounts(bank, { categories: [], difficulties: ["facil", "dificil"] });
assert.equal(counts.categories.arte, 20);
assert.deepEqual(counts.difficulties, {});

// A match: one board per round, the chosen categories shared out, never the same board twice.
const picked = pickMinesQuestions(bank, { rounds: 6, categories: ["ciencia", "deportes", "musica"] });
assert.equal(picked.length, 6);
assert.equal(new Set(picked.map((b) => b.id)).size, 6);
const per = {};
for (const b of picked) per[b.category] = (per[b.category] || 0) + 1;
assert.deepEqual(Object.values(per).sort(), [2, 2, 2]);
assert.equal(pickMinesQuestions(bank, { rounds: 10, categories: ["arte"], difficulties: ["dificil"] }).length, 10);
assert.ok(pickMinesQuestions(bank, { rounds: 10, categories: ["arte"], difficulties: ["dificil"] }).every((b) => b.difficulty === "dificil"));
assert.ok(pickMinesQuestions(bank, { rounds: 10, difficulties: ["facil", "media"] }).every((b) => b.difficulty !== "dificil"));

// A board as a round: its 25 cells shuffled, nobody's yet.
const round = toMinesBoard(bank[0]);
assert.equal(round.cells.length, 25);
assert.equal(round.cells.filter((c) => c.correct).length, bank[0].data.correct.length);
assert.deepEqual(new Set(round.cells.map((c) => c.text)), new Set([...bank[0].data.correct, ...bank[0].data.wrong]));
assert.ok(round.cells.every((c) => c.by === null && c.turn === null));
const orders = new Set(Array.from({ length: 10 }, () => toMinesBoard(bank[0]).cells.map((c) => c.text).join("|")));
assert.ok(orders.size > 1, "the cells are shuffled");

// Each hit of a round is worth 100 more than the last, up to 500.
assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(hitPoints), [100, 200, 300, 400, 500, 500, 500]);

console.log("mines.test ok");
