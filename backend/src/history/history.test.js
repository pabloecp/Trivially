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
assert.ok(yearPoints(1, "contemporanea") > 700 && yearPoints(1, "contemporanea") <= 800);
assert.ok(yearPoints(5, "contemporanea") > yearPoints(10, "contemporanea"));
assert.ok(yearPoints(10, "contemporanea") > yearPoints(30, "contemporanea"));
assert.ok(yearPoints(50, "contemporanea") < 50);
assert.ok(yearPoints(10, "antigua") > yearPoints(10, "media"));
assert.ok(yearPoints(10, "media") > yearPoints(10, "moderna"));
assert.ok(yearPoints(10, "moderna") > yearPoints(10, "contemporanea"));

// Settings: limits, the categories and difficulties ticked. There are no ages to choose any more: an older client's
// are ignored.
const everyTopic = Object.keys(QUESTION_CATEGORIES);
assert.deepEqual(mergeHistoryConfig(undefined), {
  rounds: 5,
  roundMs: 10000,
  categories: everyTopic,
  difficulties: ["facil", "media", "dificil"],
});
assert.deepEqual(
  mergeHistoryConfig({}, { rounds: 99, roundMs: 1000, eras: ["moderna"], categories: ["arte", "cocina"], difficulties: ["media", "imposible"] }),
  { rounds: 25, roundMs: 10000, categories: ["arte"], difficulties: ["media"] }
);
assert.equal("eras" in mergeHistoryConfig({ eras: ["antigua"] }), false, "an older room's ages are dropped");
// An older client's single difficulty still works ("mixta" is all three).
assert.deepEqual(mergeHistoryConfig({}, { difficulty: "facil" }).difficulties, ["facil"]);
assert.deepEqual(mergeHistoryConfig({}, { difficulty: "mixta" }).difficulties, ["facil", "media", "dificil"]);
// Every list can be unticked: there is then nothing to play.
const blank = mergeHistoryConfig({}, { categories: [], difficulties: [] });
assert.deepEqual([blank.categories, blank.difficulties], [[], []]);

// The bank: the list's events (with their topics) plus any other Historia row of the loaded bank; where both have the
// same id the list wins, so a topic added to an event is used before it is uploaded.
const bank = historyBank([]);
assert.equal(bank.length, rows.length);
const own = toQuestion({ ...rows[0], id: "propia", prompt: "Un evento propio" });
const stale = toQuestion({ ...rows[1], category: "historia" });
assert.deepEqual(historyBank([own, stale, { id: "x", type: "multiple_choice", mode: "opciones", data: {} }]), [...bank, own]);
assert.equal(countHistoryQuestions(bank, {}), rows.length);
assert.equal(countHistoryQuestions(bank, { eras: ["antigua"] }), rows.length, "ages don't filter any more");
for (const difficulty of ["facil", "media", "dificil"]) {
  assert.ok(countHistoryQuestions(bank, { difficulties: [difficulty] }) >= 25, `${difficulty}: menos de 25 eventos`);
}

// Categories: every event has one of the ten, and each one alone has enough events (of different years) for the
// longest match.
const counts = historyCounts(bank, {});
assert.deepEqual(Object.keys(counts).sort(), ["categories", "difficulties"]);
for (const topic of everyTopic) {
  assert.ok(counts.categories[topic] >= 30, `${topic}: solo ${counts.categories[topic]} eventos`);
  const match = pickHistoryQuestions(bank, { rounds: 25, categories: [topic] });
  assert.equal(match.length, 25, `${topic}: no llega a 25 rondas`);
  assert.ok(match.every((t) => t.category === topic));
}
assert.equal(Object.values(counts.categories).reduce((a, b) => a + b, 0), bank.length);
assert.equal(countHistoryQuestions(bank, { categories: ["videojuegos"] }), counts.categories.videojuegos);
// A category narrows the counts of the difficulties, and a difficulty those of the categories.
const games = historyCounts(bank, { categories: ["videojuegos"] }).difficulties;
assert.equal(Object.values(games).reduce((a, b) => a + b, 0), counts.categories.videojuegos);
assert.ok(historyCounts(bank, { difficulties: ["facil"] }).categories.deportes < counts.categories.deportes);

// A match: the chosen categories share the rounds, never two events of the same year, each with its timeline.
const four = ["arte", "musica", "deportes", "videojuegos"];
const picked = pickHistoryQuestions(bank, { rounds: 8, categories: four });
assert.equal(picked.length, 8);
for (const topic of four) assert.equal(picked.filter((t) => t.category === topic).length, 2);
assert.equal(new Set(picked.map((t) => t.year)).size, 8);
for (const t of picked) {
  assert.ok(t.min < t.year && t.year < t.max);
  assert.ok(t.prompt && t.id && t.era && t.category);
}
const everything = pickHistoryQuestions(bank, { rounds: 10 });
assert.equal(new Set(everything.map((t) => t.category)).size, 10, "ten rounds, one of each category");
const hard = pickHistoryQuestions(bank, { rounds: 25, categories: ["historia"], difficulties: ["media"] });
assert.equal(hard.length, 25);
assert.ok(hard.every((t) => t.category === "historia" && t.difficulty === "media"));

// A tiebreak never repeats an event of the match, and stays in the chosen categories.
const art = bank.filter((q) => q.category === "arte");
const used = art.map((q) => q.id).slice(1);
const tiebreak = pickHistoryTiebreak(bank, { categories: ["arte"] }, used);
assert.equal(tiebreak.category, "arte");
assert.equal(tiebreak.id, art[0].id);

console.log("history.test ok");
