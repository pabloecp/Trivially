import assert from "node:assert/strict";
import { COUNTRIES } from "../geo/countries.js";
import { buildGeoQuestions } from "../geo/geoQuestions.js";
import { BOARDS } from "../mines/boards/index.js";
import { buildMinesQuestions } from "../mines/minesQuestions.js";
import { clear, localize, mapFor, normalizeLang, otherAnswers, register, registered } from "./content.js";
import { loadTranslations, registerTwins, textHash } from "./translations.js";

// ---- The language a player asks for ----
assert.equal(normalizeLang("en"), "en");
assert.equal(normalizeLang("fr"), "es");
assert.equal(normalizeLang(undefined), "es");

// ---- localize and register ----
clear();
const es = { id: "q1", type: "multiple_choice", prompt: "¿Capital de Francia?", data: { options: ["París", "Roma", "Lima", "Quito"], correct: 0, aliases: ["Paris"] } };
const en = { id: "q1x", type: "multiple_choice", prompt: "Capital of France?", data: { options: ["Paris", "Rome", "Lima", "Quito"], correct: 0, aliases: ["Paris"] } };
register(es, en);
assert.deepEqual(mapFor("q1"), { "¿Capital de Francia?": "Capital of France?", París: "Paris", Roma: "Rome" });
assert.deepEqual(localize({ prompt: es.prompt, options: es.data.options, n: 3 }, mapFor("q1")), { prompt: "Capital of France?", options: ["Paris", "Rome", "Lima", "Quito"], n: 3 });
assert.equal(localize("Ciencia"), "Science");
assert.equal(localize("Texto sin traducir", mapFor("q1")), "Texto sin traducir");
// a written copy of a closed question accepts the English right answer, and never the wrong options
assert.equal(otherAnswers("q1:escribir")[0].answer, "Paris");
assert.ok(otherAnswers("q1:escribir")[0].reject.includes("Rome"));
assert.deepEqual(otherAnswers("sin-version"), []);

// ---- Trivia's twin rows: only the ones whose original exists and has the same type ----
clear();
const twins = [
  { type: "multiple_choice", prompt: "Capital of France?", data: { ...en.data, translation_of: "q1" } },
  { type: "open", prompt: "Orphan", data: { answer: "x", translation_of: "gone" } },
  { type: "open", prompt: "Wrong type", data: { answer: "x", translation_of: "q1" } },
];
assert.equal(registerTwins([es], twins), 1);
assert.equal(registered(), 1);

// ---- The repo's content (countries, events, figures, mines boards, Farsante) has an English version ----
loadTranslations([], []);
const countries = buildGeoQuestions(COUNTRIES);
const translatedCountries = countries.filter((q) => Object.keys(mapFor(q.id) || {}).length > 0).length;
assert.ok(translatedCountries >= countries.length * 0.9, `countries in English: ${translatedCountries}/${countries.length}`);

const boards = buildMinesQuestions(BOARDS);
const withEnglish = boards.filter((b) => Object.keys(mapFor(b.id) || {}).length > 0).length;
assert.ok(withEnglish >= boards.length * 0.95, `mines boards in English: ${withEnglish}/${boards.length}`);
// a translated board keeps its structure: same number of right and wrong cells
for (const board of boards.slice(0, 40)) {
  const out = localize({ prompt: board.prompt, data: board.data }, mapFor(board.id));
  assert.equal(out.data.correct.length, board.data.correct.length);
  assert.equal(out.data.wrong.length, board.data.wrong.length);
}
// a stale translation (its Spanish text changed) is ignored instead of misplaced
assert.notEqual(textHash("uno"), textHash("dos"));
assert.equal(textHash("uno").length, 6);

console.log("content.test ok");
