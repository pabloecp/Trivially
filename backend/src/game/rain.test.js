import assert from "node:assert/strict";
import {
  mergeRainConfig,
  pickRainRounds,
  RAIN_COLUMN_GAP_MS,
  RAIN_COLUMNS,
  RAIN_FALL_MS,
  RAIN_GRACE_MS,
  RAIN_POINTS,
  rainCounts,
  rainPool,
  rainRoundText,
  rainSchedule,
} from "./rain.js";

// Lluvia's settings, its pool of questions and how a match's rain is drawn.

// Settings: every value valid, any list may be left empty.
const base = mergeRainConfig();
assert.deepEqual(base.difficulties, ["facil", "media", "dificil"]);
assert.equal(base.categories.length, 10);
assert.equal(base.rounds, 3);
assert.equal(base.roundMs, 60000);
assert.equal(mergeRainConfig(base, { rounds: 99 }).rounds, 5, "at most 5 rounds");
assert.equal(mergeRainConfig(base, { rounds: -2 }).rounds, 1, "at least 1");
assert.equal(mergeRainConfig(base, { roundMs: 5000 }).roundMs, 30000, "at least 30 s");
assert.equal(mergeRainConfig(base, { roundMs: 200000 }).roundMs, 90000, "at most 90 s");
assert.deepEqual(mergeRainConfig(base, { difficulties: ["dificil", "nada", "facil"] }).difficulties, ["facil", "dificil"]);
assert.deepEqual(mergeRainConfig(base, { categories: [] }).categories, []);

// The points of each difficulty.
assert.deepEqual(RAIN_POINTS, { facil: 1, media: 3, dificil: 5 });

// The pool: Trivia's written questions, never the flags nor the four-option ones.
const q = (id, difficulty, category = "ciencia", extra = {}) => ({
  id,
  type: "open",
  category,
  difficulty,
  prompt: `Pregunta ${id}`,
  data: { answer: `Respuesta ${id}`, aliases: [], reject: [], ...extra },
});
const pool = rainPool([
  ...Array.from({ length: 30 }, (_, i) => q(`f${i}`, "facil", i % 2 ? "ciencia" : "arte")),
  ...Array.from({ length: 30 }, (_, i) => q(`m${i}`, "media", i % 3 ? "ciencia" : "historia")),
  ...Array.from({ length: 30 }, (_, i) => q(`d${i}`, "dificil")),
  q("flag", "facil", "geografia", { kind: "flag" }),
  { id: "mc", type: "multiple_choice", category: "ciencia", difficulty: "facil", prompt: "?", data: { options: ["a", "b", "c", "d"], correct: 0 } },
]);
assert.equal(pool.length, 90, "no flags, no four-option questions");
assert.deepEqual(rainCounts(pool, { categories: ["arte"] }).difficulties, { facil: 15 });
assert.equal(rainCounts(pool, { difficulties: ["media"] }).categories.historia, 10);

// The rain gets heavier: the gaps between questions shrink along the round, the first falls straight away and none
// starts in the last 3 s. Each falls in one of three columns, never two in a row in the same one, and a column takes
// a new question only once the last one has fallen far enough, so they never overlap.
const schedule = rainSchedule(60000);
assert.equal(schedule[0].at, 400);
assert.ok(schedule.at(-1).at <= 57000);
assert.ok(schedule.length >= 38 && schedule.length <= 55, `about 45 questions in a minute (${schedule.length})`);
const gaps = schedule.slice(1).map((d, i) => d.at - schedule[i].at);
assert.ok(gaps.slice(0, 5).reduce((a, b) => a + b) > gaps.slice(-5).reduce((a, b) => a + b), "more and more often");
assert.ok(rainSchedule(90000).length > rainSchedule(30000).length);
const lastIn = new Map();
schedule.forEach((d, i) => {
  assert.ok(RAIN_COLUMNS.includes(d.lane));
  if (i) {
    assert.ok(d.at > schedule[i - 1].at, "in the order they fall");
    assert.notEqual(d.lane, schedule[i - 1].lane, "never twice in a row in the same column");
  }
  if (lastIn.has(d.lane)) assert.ok(d.at - lastIn.get(d.lane) >= RAIN_COLUMN_GAP_MS, "a column waits for the last one to fall");
  lastIn.set(d.lane, d.at);
});
// Many at once: at the busiest moment, about nine are falling.
const busiest = Math.max(...schedule.map((d) => schedule.filter((o) => o.at <= d.at && d.at < o.at + RAIN_FALL_MS).length));
assert.ok(busiest >= 8, `${busiest} at once`);

// A match: one track per round, its questions in order, never two in a row on the same side, the difficulties taking
// turns and no question repeated while there are others.
const rounds = pickRainRounds(pool, { rounds: 2, roundMs: 30000 });
assert.equal(rounds.length, 2);
for (const round of rounds) {
  assert.equal(round.kind, "rain");
  assert.equal(round.roundMs, 30000);
  assert.equal(round.fallMs, RAIN_FALL_MS);
  assert.ok(round.drops.length >= 9);
  round.drops.forEach((d, i) => {
    assert.equal(d.id, i);
    assert.equal(d.points, RAIN_POINTS[d.question.difficulty]);
    assert.equal(d.question.type, "open");
    assert.ok(d.question.answer.startsWith("Respuesta"));
    if (i) {
      assert.ok(d.at > round.drops[i - 1].at, "in the order they fall");
      assert.notEqual(d.lane, round.drops[i - 1].lane, "never in the same column as the one before");
    }
  });
  // Every three questions, one of each difficulty.
  const levels = round.drops.slice(0, 9).map((d) => d.question.difficulty);
  for (let i = 0; i < 9; i += 3) assert.equal(new Set(levels.slice(i, i + 3)).size, 3, levels.join());
}
const ids = rounds.flatMap((r) => r.drops.map((d) => d.question.id));
assert.equal(new Set(ids).size, ids.length, "no question twice in the match while there are others");

// Within a difficulty the categories take turns: the easy ones alternate between art and science.
const easy = pickRainRounds(pool, { rounds: 1, roundMs: 30000, difficulties: ["facil"] })[0].drops.map((d) => d.question.category);
for (let i = 0; i + 1 < easy.length; i += 2) assert.notEqual(easy[i], easy[i + 1], easy.join());

// Few questions: a round asks one again, but only once it left the screen.
const few = pool.filter((x) => x.difficulty === "dificil").slice(0, 10);
const [short] = pickRainRounds(few, { rounds: 1, roundMs: 90000 });
assert.ok(short.drops.length > 10, "more questions fall than there are");
const lastFell = new Map();
for (const d of short.drops) {
  if (lastFell.has(d.question.id)) assert.ok(d.at - lastFell.get(d.question.id) > RAIN_FALL_MS + RAIN_GRACE_MS, "never twice on screen");
  lastFell.set(d.question.id, d.at);
}

// Nothing to draw: no rounds.
assert.deepEqual(pickRainRounds(pool, { difficulties: [] }), []);

assert.equal(rainRoundText(0, 0), "Sin aciertos");
assert.equal(rainRoundText(1, 3), "1 acierto · 3 puntos");
assert.equal(rainRoundText(4, 1 + 3 + 5 + 5), "4 aciertos · 14 puntos");
assert.equal(rainRoundText(1, 1), "1 acierto · 1 punto");

console.log("rain ok");
