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

// Historia's events, the timeline each one gets and how a year is scored.
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

// Settings: limits, at least one age.
const everyTopic = Object.keys(QUESTION_CATEGORIES);
assert.deepEqual(mergeHistoryConfig(undefined), {
  rounds: 5,
  roundMs: 10000,
  eras: ["antigua", "media", "moderna", "contemporanea"],
  categories: everyTopic,
  difficulties: ["facil", "media", "dificil"],
});
assert.deepEqual(
  mergeHistoryConfig({}, { rounds: 99, roundMs: 1000, eras: ["moderna", "inventada"], categories: ["arte", "cocina"], difficulties: ["media", "imposible"] }),
  { rounds: 25, roundMs: 10000, eras: ["moderna"], categories: ["arte"], difficulties: ["media"] }
);
// An older client's single difficulty still works ("mixta" is all three).
assert.deepEqual(mergeHistoryConfig({}, { difficulty: "facil" }).difficulties, ["facil"]);
assert.deepEqual(mergeHistoryConfig({}, { difficulty: "mixta" }).difficulties, ["facil", "media", "dificil"]);
// Every list can be unticked: there is then nothing to play.
const blank = mergeHistoryConfig({}, { eras: [], categories: [], difficulties: [] });
assert.deepEqual([blank.eras, blank.categories, blank.difficulties], [[], [], []]);

// The bank: the list's events (with their topics) plus any other Historia row of the loaded bank; where both have the
// same id the list wins, so a topic added to an event is used before it is uploaded.
const bank = historyBank([]);
assert.equal(bank.length, rows.length);
const own = toQuestion({ ...rows[0], id: "propia", prompt: "Un evento propio" });
const stale = toQuestion({ ...rows[1], category: "historia" });
assert.deepEqual(historyBank([own, stale, { id: "x", type: "multiple_choice", mode: "opciones", data: {} }]), [...bank, own]);
assert.equal(countHistoryQuestions(bank, {}), rows.length);
assert.ok(countHistoryQuestions(bank, { eras: ["antigua"], difficulties: ["facil"] }) >= 5);
for (const era of ["antigua", "media", "moderna", "contemporanea"]) {
  for (const difficulty of ["facil", "media", "dificil"]) {
    assert.ok(countHistoryQuestions(bank, { eras: [era], difficulties: [difficulty] }) >= 5, `${era} ${difficulty}: menos de 5 eventos`);
  }
}

// Topics: every event has one of the ten, and each topic has enough events for a match of 5 rounds in two ages at least.
const counts = historyCounts(bank, {});
for (const topic of everyTopic) assert.ok(counts.categories[topic] >= 8, `${topic}: solo ${counts.categories[topic]} eventos`);
assert.equal(Object.values(counts.categories).reduce((a, b) => a + b, 0), bank.length);
assert.equal(countHistoryQuestions(bank, { categories: ["videojuegos"] }), counts.categories.videojuegos);
assert.ok(pickHistoryQuestions(bank, { rounds: 5, categories: ["deportes"] }).every((t) => bank.find((q) => q.id === t.id).category === "deportes"));
// A topic narrows the counts of the other settings, and the other settings those of the topics.
assert.equal(historyCounts(bank, { categories: ["videojuegos"] }).eras.antigua, undefined);
assert.ok(historyCounts(bank, { eras: ["antigua"] }).categories.deportes < counts.categories.deportes);

// A match: the ages share the rounds, never two events of the same year, each with its timeline.
const picked = pickHistoryQuestions(bank, { rounds: 8 });
assert.equal(picked.length, 8);
for (const era of ["antigua", "media", "moderna", "contemporanea"]) assert.equal(picked.filter((t) => t.era === era).length, 2);
assert.equal(new Set(picked.map((t) => t.year)).size, 8);
for (const t of picked) {
  assert.ok(t.min < t.year && t.year < t.max);
  assert.ok(t.prompt && t.id && t.era);
}
const recent = pickHistoryQuestions(bank, { rounds: 25, eras: ["contemporanea"], difficulties: ["media"] });
assert.equal(recent.length, 25);
assert.ok(recent.every((t) => t.era === "contemporanea" && t.difficulty === "media"));

// A tiebreak never repeats an event of the match.
const used = bank.filter((q) => eraOf(q.data.year) === "antigua").map((q) => q.id).slice(1);
const tiebreak = pickHistoryTiebreak(bank, { eras: ["antigua"] }, used);
assert.equal(tiebreak.era, "antigua");
assert.ok(!used.includes(tiebreak.id));

console.log("history.test ok");
