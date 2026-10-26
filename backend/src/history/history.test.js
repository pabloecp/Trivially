import assert from "node:assert/strict";
import { QUESTION_CATEGORIES, questionErrors, toQuestion } from "../questions/questionSchema.js";
import {
  countHistoryQuestions,
  eraOf,
  historyBank,
  historyCounts,
  mergeHistoryConfig,
  pickHistoryQuestions,
  pickHistoryTiebreak,
  yearLabel,
  yearPoints,
  yearRange,
  yearsApart,
} from "../game/history.js";
import { buildHistoryQuestions } from "./historyQuestions.js";
import { buildFigureQuestions } from "./figureQuestions.js";
import { figureLabel, figurePoints, figureRange, figureTolerance } from "../game/history.js";

// Rango's events, the timeline each one gets and how a year is scored.
const rows = buildHistoryQuestions();
const today = new Date().getFullYear();

// Every event is a valid row, once, and its text gives neither its year nor its century away.
assert.ok(rows.length >= 200);
for (const q of rows) {
  assert.deepEqual(questionErrors(q), [], q.prompt);
  assert.ok(!q.prompt.includes(String(Math.abs(q.data.year))), `${q.prompt} dice su año`);
  assert.ok(!/siglo/i.test(q.prompt), `${q.prompt} dice su siglo`);
}
assert.equal(new Set(rows.map((q) => q.id)).size, rows.length, "ids repetidos");
assert.equal(new Set(rows.map((q) => q.prompt.toLowerCase())).size, rows.length, "eventos repetidos");
assert.deepEqual(questionErrors({ ...rows[0], data: { year: 0 } }).length, 1, "the year 0 doesn't exist");
assert.deepEqual(questionErrors({ ...rows[0], data: { year: today + 1 } }).length, 1, "no future years");

// The ages: the event that opens one belongs to it.
assert.equal(eraOf(-44), "antigua");
assert.equal(eraOf(476), "antigua");
assert.equal(eraOf(477), "media");
assert.equal(eraOf(1491), "media");
assert.equal(eraOf(1492), "moderna");
assert.equal(eraOf(1788), "moderna");
assert.equal(eraOf(1789), "contemporanea");

// The timeline: the age's span, round numbers, the year inside (never at an end), never year 0, and at most up to the
// next round year after today.
const TIMELINES = { antigua: [1500, 100], media: [750, 50], moderna: [300, 20], contemporanea: [150, 10] };
for (const q of rows) {
  const year = q.data.year;
  const [span, step] = TIMELINES[eraOf(year)];
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) {
    const r = yearRange(year);
    assert.equal(r.span, span);
    assert.equal(r.max - r.min, span, q.prompt);
    assert.ok(r.min < year && year < r.max, `${q.prompt}: ${year} fuera de ${r.min}–${r.max}`);
    assert.ok(r.max - step < today, `${q.prompt}: ${r.max} queda lejos en el futuro`);
    assert.ok(r.min !== 0 && r.max !== 0);
    assert.ok(r.min % step === 0, `${r.min} no es redondo`);
    seen.add(r.min);
  }
  assert.ok(seen.size > 1 || year > today - span / 5, `${q.prompt}: siempre la misma línea del tiempo`);
}
// The draw picks one of the timelines that fit; a recent event's can reach the next round year after today.
const nextTen = Math.ceil(today / 10) * 10;
assert.deepEqual(yearRange(1989, () => 0), { min: 1840, max: 1990, span: 150 });
assert.deepEqual(yearRange(1989, () => 0.999), { min: nextTen - 150, max: nextTen, span: 150 });
assert.deepEqual(yearRange(1990, () => 0), { min: 1850, max: 2000, span: 150 }, "never at an end");
assert.deepEqual(yearRange(-44, () => 0), { min: -1400, max: 100, span: 1500 }, "never ending on year 0");
assert.deepEqual(yearRange(1600, () => 0), { min: 1320, max: 1620, span: 300 });

// Years apart: there is no year 0.
assert.equal(yearsApart(1989, 1985), 4);
assert.equal(yearsApart(1985, 1989), 4);
assert.equal(yearsApart(-1, 1), 1);
assert.equal(yearsApart(-44, 30), 73);
assert.equal(yearsApart(-44, -30), 14);
assert.equal(yearLabel(-44), "44 a. C.");
assert.equal(yearLabel(1492), "1492");

// Points: the exact year gets all of them, then fewer the further; the same miss counts less in older ages.
assert.equal(yearPoints(0, "contemporanea"), 1000);
// not exact: 900 at most, then a straight line down to 0 at 60% of the timeline
assert.ok(yearPoints(1, "contemporanea") > 800 && yearPoints(1, "contemporanea") <= 900);
assert.equal(yearPoints(9, "contemporanea"), 810, "6% of the line");
assert.equal(yearPoints(15, "contemporanea"), 750, "10% of the line");
assert.equal(yearPoints(45, "contemporanea"), 450, "30% of the line");
assert.equal(yearPoints(90, "contemporanea"), 0, "60% of the line");
assert.equal(yearPoints(140, "contemporanea"), 0, "never negative");
assert.equal(yearPoints(15, "contemporanea") - yearPoints(30, "contemporanea"), yearPoints(30, "contemporanea") - yearPoints(45, "contemporanea"), "even steps");
assert.ok(yearPoints(5, "contemporanea") > yearPoints(10, "contemporanea"));
assert.ok(yearPoints(10, "contemporanea") > yearPoints(30, "contemporanea"));
assert.ok(yearPoints(10, "antigua") > yearPoints(10, "media"));
assert.ok(yearPoints(10, "media") > yearPoints(10, "moderna"));
assert.ok(yearPoints(10, "moderna") > yearPoints(10, "contemporanea"));
assert.equal(yearPoints(150, "antigua"), 750, "10% of any timeline is the same");

// Settings: limits, the categories and difficulties ticked. There are no ages to choose any more: an older client's
// are ignored.
const everyTopic = Object.keys(QUESTION_CATEGORIES);
assert.deepEqual(mergeHistoryConfig(undefined), {
  rounds: 5,
  roundMs: 10000,
  styles: ["cifras"],
  categories: everyTopic,
  difficulties: ["facil", "media", "dificil"],
});
assert.deepEqual(
  mergeHistoryConfig({}, { rounds: 99, roundMs: 1000, eras: ["moderna"], categories: ["arte", "cocina"], difficulties: ["media", "imposible"] }),
  { rounds: 25, roundMs: 10000, styles: ["cifras"], categories: ["arte"], difficulties: ["media"] }
);
// Cifras is the only way of playing: whatever a room or an older client sends ("linea" was one) comes out as it.
assert.deepEqual(mergeHistoryConfig({}, { styles: ["cifras", "otro"] }).styles, ["cifras"]);
assert.deepEqual(mergeHistoryConfig({ styles: ["linea"] }).styles, ["cifras"]);
assert.deepEqual(mergeHistoryConfig({ rounds: 10 }).styles, ["cifras"]);
assert.equal("eras" in mergeHistoryConfig({ eras: ["antigua"] }), false, "an older room's ages are dropped");
// An older client's single difficulty still works ("mixta" is all three).
assert.deepEqual(mergeHistoryConfig({}, { difficulty: "facil" }).difficulties, ["facil"]);
assert.deepEqual(mergeHistoryConfig({}, { difficulty: "mixta" }).difficulties, ["facil", "media", "dificil"]);
// Every list can be unticked: there is then nothing to play.
const blank = mergeHistoryConfig({}, { styles: [], categories: [], difficulties: [] });
assert.deepEqual([blank.categories, blank.difficulties], [[], []]);
assert.deepEqual(blank.styles, ["cifras"], "the way of playing can't be unticked");

// The bank: the list's events and figures (with their topics) plus any other Historia row of the loaded bank; where
// both have the same id the list wins, so a topic added to an event is used before it is uploaded. Only the figures
// are played now (the events of Línea del tiempo are no longer a way to choose), so a match draws from them.
const figures = buildFigureQuestions();
const fullBank = historyBank([]);
assert.equal(fullBank.length, rows.length + figures.length);
const own = toQuestion({ ...rows[0], id: "propia", prompt: "Un evento propio" });
const stale = toQuestion({ ...rows[1], category: "historia" });
assert.deepEqual(historyBank([own, stale, { id: "x", type: "multiple_choice", mode: "opciones", data: {} }]), [...fullBank, own]);
assert.equal(countHistoryQuestions(fullBank, {}), figures.length, "events aren't counted: they can't be played");
assert.equal(countHistoryQuestions(fullBank, { styles: ["linea"] }), figures.length, "an older client's way is ignored");
assert.equal(countHistoryQuestions(fullBank, { eras: ["antigua"] }), figures.length, "ages don't filter any more");
for (const difficulty of ["facil", "media", "dificil"]) {
  assert.ok(countHistoryQuestions(fullBank, { difficulties: [difficulty] }) >= 25, `${difficulty}: menos de 25 cifras`);
}

// Categories: every figure has one of the ten, and each one alone has enough figures (of different answers) for a
// match of 10 rounds.
const counts = historyCounts(fullBank, {});
assert.deepEqual(Object.keys(counts).sort(), ["categories", "difficulties", "styles"]);
assert.deepEqual(historyCounts(fullBank, { styles: [] }).styles, { linea: rows.length, cifras: figures.length });
for (const topic of everyTopic) {
  assert.ok(counts.categories[topic] >= 12, `${topic}: solo ${counts.categories[topic]} cifras`);
  const match = pickHistoryQuestions(fullBank, { rounds: 10, categories: [topic] });
  assert.equal(match.length, 10, `${topic}: no llega a 10 rondas`);
  assert.ok(match.every((t) => t.category === topic));
}
assert.equal(Object.values(counts.categories).reduce((a, b) => a + b, 0), figures.length);
assert.equal(countHistoryQuestions(fullBank, { categories: ["videojuegos"] }), counts.categories.videojuegos);
// A category narrows the counts of the difficulties, and a difficulty those of the categories.
const games = historyCounts(fullBank, { categories: ["videojuegos"] }).difficulties;
assert.equal(Object.values(games).reduce((a, b) => a + b, 0), counts.categories.videojuegos);
assert.ok(historyCounts(fullBank, { difficulties: ["facil"] }).categories.deportes < counts.categories.deportes);

// A match: the chosen categories share the rounds, never two figures with the same answer, each with its bar.
const four = ["arte", "musica", "deportes", "videojuegos"];
const picked = pickHistoryQuestions(fullBank, { rounds: 8, categories: four });
assert.equal(picked.length, 8);
for (const topic of four) assert.equal(picked.filter((t) => t.category === topic).length, 2);
assert.equal(new Set(picked.map((t) => t.value)).size, 8);
for (const t of picked) {
  assert.ok(t.kind === "cifras" && t.min < t.value && t.value < t.max);
  assert.ok(t.prompt && t.id && t.category);
}
const everything = pickHistoryQuestions(fullBank, { rounds: 10 });
assert.equal(new Set(everything.map((t) => t.category)).size, 10, "ten rounds, one of each category");
const hard = pickHistoryQuestions(fullBank, { rounds: 10, difficulties: ["media"] });
assert.equal(hard.length, 10);
assert.ok(hard.every((t) => t.difficulty === "media"));

// A tiebreak never repeats a question of the match, and stays in the chosen categories.
const art = fullBank.filter((q) => q.category === "arte" && q.type === "number");
const used = art.map((q) => q.id).slice(1);
const tiebreak = pickHistoryTiebreak(fullBank, { categories: ["arte"] }, used);
assert.equal(tiebreak.category, "arte");
assert.equal(tiebreak.id, art[0].id);

// ---- Cifras ----
// Every figure is a valid row, once, whose text doesn't give its number away; every category has some.
assert.ok(figures.length >= 120);
for (const q of figures) {
  assert.deepEqual(questionErrors(q), [], q.prompt);
  assert.ok(!q.prompt.includes(String(q.data.value)), `${q.prompt} dice su número`);
}
assert.equal(new Set(figures.map((q) => q.id)).size, figures.length, "ids repetidos");
for (const topic of everyTopic) assert.ok(figures.filter((q) => q.category === topic).length >= 12, `${topic}: pocas cifras`);
assert.equal(questionErrors({ ...figures[0], data: { value: 0, unit: "" } }).length, 1, "a figure is above 0");
assert.equal(questionErrors({ ...figures[0], data: { value: 2.5, unit: "" } }).length, 1, "whole numbers only");

// The bar: a round span (at least 10) starting on one of its tenths, with the answer inside and away from the ends.
for (const q of figures) {
  const value = q.data.value;
  for (let i = 0; i < 20; i += 1) {
    const r = figureRange(value);
    assert.equal(r.max - r.min, r.span);
    assert.ok(r.span >= 10 && r.min >= 0 && r.min % (r.span / 10) === 0, `${q.prompt}: barra ${r.min}–${r.max}`);
    assert.ok(r.min + r.span * 0.05 <= value && value <= r.max - r.span * 0.05, `${q.prompt}: ${value} en el borde de ${r.min}–${r.max}`);
    assert.ok(Number.isInteger(r.snap) && r.snap >= 1);
  }
}
assert.deepEqual(figureRange(8849, () => 0), { min: 0, max: 20000, span: 20000, snap: 20 });
assert.deepEqual(figureRange(3, () => 0.99), { min: 2, max: 12, span: 10, snap: 1 });
// Exact within half a hundredth of the bar (only the number itself on a short one); then fewer points the further.
assert.equal(figureTolerance(10), 0);
assert.equal(figureTolerance(20000), 100);
assert.equal(figurePoints(0, 10), 1000);
assert.equal(figurePoints(1, 10), 750, "10% of a bar of 10");
assert.equal(figurePoints(100, 20000), 1000);
assert.ok(figurePoints(101, 20000) <= 900 && figurePoints(500, 20000) > figurePoints(2000, 20000));
assert.equal(figurePoints(2000, 20000), 750, "10% of the bar");
assert.equal(figurePoints(12000, 20000), 0, "60% of the bar");
assert.equal(figureLabel(8849, "m"), "8849 m");
assert.equal(figureLabel(42195, "m"), "42.195 m");
assert.equal(figureLabel(151, ""), "151");

// Every round is a figure, whatever ways an older client asks for (Línea del tiempo is no longer one).
const onlyFigures = pickHistoryQuestions(fullBank, { rounds: 10, styles: ["linea"] });
assert.ok(onlyFigures.length === 10 && onlyFigures.every((t) => t.kind === "cifras" && t.min < t.value && t.value < t.max && t.unit != null));
// Art has fewer than 12 figures with different answers (two are 46): a match asks for as many as there are.
const artAnswers = new Set(figures.filter((q) => q.category === "arte").map((q) => q.data.value)).size;
const short = pickHistoryQuestions(fullBank, { rounds: 25, categories: ["arte"] });
assert.equal(short.length, Math.min(12, artAnswers), "never two figures with the same answer");
assert.equal(new Set(short.map((t) => t.value)).size, short.length);

console.log("history.test ok");
