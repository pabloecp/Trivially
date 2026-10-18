import assert from "node:assert/strict";
import { COUNTRIES } from "./countries.js";
import { buildGeoQuestions, GEO_KINDS, stableId } from "./geoQuestions.js";
import { hasCountry, locate } from "./worldMap.js";
import { flagForToken, flagToken, flagUrl } from "./flags.js";
import { countryShape, hasShape, shapeForToken, shapePieces, shapeToken, shapeUrl } from "./shapes.js";
import { isCorrectOpenAnswer } from "../game/openAnswers.js";
import { questionErrors, toQuestion } from "../questions/questionSchema.js";
import {
  countGeoQuestions,
  geoBank,
  GEO_STYLES,
  locationPoints,
  mergeGeoConfig,
  pickGeoQuestions,
  pickTiebreakQuestion,
  SHAPE_PROMPT,
} from "../game/geo.js";

// The countries: unique ISO codes, and every map name exists in the world map the players see.
const codes = new Set();
for (const c of COUNTRIES) {
  assert.match(c.code, /^[A-Z]{2}$/, `${c.name}: código ISO inválido`);
  assert.ok(!codes.has(c.code), `${c.code} repetido`);
  codes.add(c.code);
  for (const name of c.map) assert.ok(hasCountry(name), `${c.name}: el mapa no tiene "${name}"`);
}
assert.ok(COUNTRIES.length >= 190, "every country of the UN is there");

// The questions are valid rows of the `questions` table, with stable ids.
const rows = buildGeoQuestions();
const ids = new Set();
for (const q of rows) {
  assert.deepEqual(questionErrors(q), [], `${q.prompt}: ${questionErrors(q).join("; ")}`);
  assert.ok(!ids.has(q.id), `id repetido ${q.id}`);
  ids.add(q.id);
  assert.ok(GEO_KINDS.includes(q.data.kind));
}
assert.equal(buildGeoQuestions()[0].id, rows[0].id, "the same question always gets the same id");
assert.match(stableId("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
// Every kind has enough questions at every difficulty for the longest match (25 rounds).
for (const kind of GEO_KINDS) {
  for (const difficulty of ["facil", "media", "dificil"]) {
    const n = rows.filter((q) => q.data.kind === kind && q.difficulty === difficulty).length;
    assert.ok(n >= 25, `${kind} ${difficulty}: solo ${n} preguntas`);
  }
}
// A flag question never names its country before the answer.
for (const q of rows.filter((r) => r.data.kind === "flag")) assert.ok(!q.prompt.includes(q.data.name));

// Written answers: the answer and each alias count, the rejected look-alikes don't, and no other country's answer is
// accepted by accident (typo tolerance between "Austria" and "Australia", "Níger" and "Nigeria"...).
for (const kind of ["capital", "flag"]) {
  const questions = rows.filter((q) => q.data.kind === kind).map((q) => ({ ...q.data }));
  for (const q of questions) {
    for (const text of [q.answer, ...q.aliases]) assert.equal(isCorrectOpenAnswer(text, q), true, `${q.name}: no acepta "${text}"`);
    for (const text of q.reject) assert.equal(isCorrectOpenAnswer(text, q), false, `${q.name}: acepta "${text}"`);
    for (const other of questions) {
      if (other.country === q.country || other.answer === q.answer) continue;
      for (const text of [other.answer, ...other.aliases]) {
        assert.equal(isCorrectOpenAnswer(text, q), false, `${kind} de ${q.name}: acepta "${text}" (de ${other.name})`);
      }
    }
  }
}

// The map: inside, outside with the distance to the border, and territories that count as the country.
assert.equal(locate(["Spain"], [-3.7, 40.42]).inside, true, "Madrid is in Spain");
const paris = locate(["Spain"], [2.35, 48.86]);
assert.equal(paris.inside, false);
assert.ok(paris.distanceKm > 600 && paris.distanceKm < 750, `Paris is ~680 km from Spain (${paris.distanceKm})`);
assert.ok(Math.abs(paris.nearest[0] - 0.8) < 1 && Math.abs(paris.nearest[1] - 42.8) < 1, "nearest point is in the Pyrenees");
assert.equal(locate(["Somalia", "Somaliland"], [45, 10]).inside, true);
assert.equal(locate(["Vatican"], [12.49, 41.89]).inside, true, "a few km from a tiny country still counts");
assert.equal(locate(["Fiji"], [-179.9, -16.5]).inside, true, "across the antimeridian");
const ottawa = locate(["United States of America"], [-75.7, 45.4]);
assert.ok(!ottawa.inside && ottawa.distanceKm > 50 && ottawa.distanceKm < 90);

// Points: all of them inside, then fewer the further away.
assert.equal(locationPoints({ inside: true, distanceKm: 0 }), 1000);
const near = locationPoints({ inside: false, distanceKm: 100 });
const far = locationPoints({ inside: false, distanceKm: 2000 });
assert.ok(near < 1000 && far < near && far > 0);

// Settings: the three ways of giving the country ticked by default.
assert.deepEqual(GEO_STYLES, ["nombre", "sombra", "bandera"]);
assert.deepEqual(mergeGeoConfig({}, { rounds: 99, difficulty: "x" }), {
  rounds: 25,
  roundMs: 15000,
  styles: GEO_STYLES,
  difficulties: ["facil", "media", "dificil"],
});
// Every round is a pin on the map: the kinds of an older client or room are dropped. The seconds to put the pin are a
// setting (15–35 s, like Adivina la canción's).
assert.deepEqual(mergeGeoConfig({ rounds: 7, roundMs: 20000, kinds: ["capital"] }, { kinds: ["flag"], roundMs: 30000 }), {
  rounds: 7,
  roundMs: 30000,
  styles: GEO_STYLES,
  difficulties: ["facil", "media", "dificil"],
});
// Any of the ways can be unticked, in any order, and unknown ones are dropped; a room from before them gets all three.
assert.deepEqual(mergeGeoConfig({}, { styles: ["bandera", "x", "nombre"] }).styles, ["nombre", "bandera"]);
assert.deepEqual(mergeGeoConfig({ styles: ["sombra"] }, { rounds: 10 }).styles, ["sombra"]);
assert.deepEqual(mergeGeoConfig({ styles: [] }).styles, []);
assert.deepEqual(mergeGeoConfig({ rounds: 5, difficulties: ["facil"] }).styles, GEO_STYLES);
// Several difficulties at once; an older client's single one (or "mixta") still works.
assert.deepEqual(mergeGeoConfig({}, { difficulties: ["dificil", "facil", "x"] }).difficulties, ["facil", "dificil"]);
assert.deepEqual(mergeGeoConfig({}, { difficulty: "media" }).difficulties, ["media"]);
assert.deepEqual(mergeGeoConfig({ difficulty: "mixta" }).difficulties, ["facil", "media", "dificil"]);
assert.deepEqual(mergeGeoConfig({}, { difficulties: [] }).difficulties, []);

// The bank: Supabase rows first; any kind they lack comes from countries.js.
const built = rows.map(toQuestion);
assert.equal(geoBank([]).length, rows.length);
const onlyCapitals = built.filter((q) => q.data.kind === "capital").slice(0, 3);
const mixed = geoBank([...onlyCapitals, { mode: "opciones", type: "multiple_choice", data: {} }]);
assert.equal(mixed.filter((q) => q.data.kind === "capital").length, 3, "the bank's capitals are used as they are");
assert.ok(mixed.some((q) => q.data.kind === "location") && mixed.every((q) => q.mode === "mundo"));

// A match: only map rounds (the bank's capitals and flags are Trivia's to write), never the same country twice.
const bank = geoBank(built);
assert.ok(bank.some((q) => q.data.kind === "capital") && bank.some((q) => q.data.kind === "flag"), "Trivia still gets them from the bank");
const match = pickGeoQuestions(bank, { rounds: 10, difficulty: "facil" });
assert.equal(match.length, 10);
assert.ok(match.every((t) => t.kind === "location" && t.map?.length));
assert.equal(new Set(match.map((t) => t.country)).size, 10);
assert.ok(match.every((t) => t.difficulty === "facil"));
// By name only, a match draws from the map questions; with every way, from every country any of them asks.
const byName = rows.filter((q) => q.data.kind === "location" && q.difficulty === "facil");
assert.equal(countGeoQuestions(bank, { styles: ["nombre"], difficulty: "facil" }), byName.length);
assert.ok(countGeoQuestions(bank, { difficulty: "facil" }) >= byName.length);
assert.equal(countGeoQuestions(bank, { styles: [] }), 0);
// The ticked ways share the rounds evenly: 9 rounds of the three are 3 of each.
const mixedMatch = pickGeoQuestions(bank, { rounds: 9 });
for (const style of GEO_STYLES) assert.equal(mixedMatch.filter((t) => t.style === style).length, 3, `3 rondas de ${style}`);
assert.equal(new Set(mixedMatch.map((t) => t.country)).size, 9);
// A round by name names the country; a silhouette or a flag round never does in its prompt, and only a flag round
// keeps the flag.
for (const t of pickGeoQuestions(bank, { rounds: 25 })) {
  if (t.style === "nombre") assert.ok(t.prompt.includes(t.name) && !t.flag);
  if (t.style === "sombra") assert.ok(t.prompt === SHAPE_PROMPT && !t.flag);
  if (t.style === "bandera") assert.ok(!t.prompt.includes(t.name) && /^[a-z]{2}$/.test(t.flag));
}
// A flag round takes the flag's difficulty, and every country it asks is on the map (Tuvalu isn't).
const flags = pickGeoQuestions(bank, { rounds: 25, styles: ["bandera"], difficulties: ["dificil"] });
assert.equal(flags.length, 25);
const flagLevel = new Map(rows.filter((q) => q.data.kind === "flag").map((q) => [q.data.country, q.difficulty]));
assert.ok(flags.every((t) => t.style === "bandera" && flagLevel.get(t.country) === "dificil"));
const allFlags = countGeoQuestions(bank, { styles: ["bandera"] });
assert.equal(allFlags, rows.filter((q) => q.data.kind === "flag" && q.data.country !== "TV").length);
// A silhouette round never asks a country too small to have a shape.
const shapes = pickGeoQuestions(bank, { rounds: 25, styles: ["sombra"], difficulties: ["dificil"] });
assert.equal(shapes.length, 25);
assert.ok(shapes.every((t) => t.style === "sombra" && hasShape(t.map)));
assert.ok(!shapes.some((t) => ["VA", "MC", "SM"].includes(t.country)));
// Enough of every way at every difficulty for the longest match (25 rounds).
for (const style of GEO_STYLES) {
  for (const difficulty of ["facil", "media", "dificil"]) {
    const n = countGeoQuestions(bank, { styles: [style], difficulties: [difficulty] });
    assert.ok(n >= 25, `${style} ${difficulty}: solo ${n} países`);
  }
}
// An older client asking for capitals still gets map rounds.
const two = pickGeoQuestions(bank, { rounds: 10, kinds: ["capital"], difficulties: ["facil", "dificil"] });
assert.ok(two.every((t) => t.kind === "location" && (t.difficulty === "facil" || t.difficulty === "dificil")));
const tiebreak = pickTiebreakQuestion(bank, {}, match.map((t) => t.country));
assert.equal(tiebreak.kind, "location");
assert.equal(tiebreak.difficulty, "media");
assert.ok(GEO_STYLES.includes(tiebreak.style));
assert.ok(!match.some((t) => t.country === tiebreak.country));
// A tiebreak is given in one of the match's ways.
assert.equal(pickTiebreakQuestion(bank, { styles: ["bandera"] }, []).style, "bandera");

// Silhouettes: only a path in a box, a country across the 180th meridian comes out whole, and far pieces (la Guayana
// Francesa, Alaska) are left out.
const spain = countryShape(["Spain"]);
assert.deepEqual(Object.keys(spain).sort(), ["d", "viewBox"]);
assert.match(spain.d, /^M[\d.,LMZ-]+$/);
assert.ok(hasShape(["Spain"]) && !hasShape(["Vatican"]) && !hasShape(["Monaco"]));
const [, , w, h] = countryShape(["Russia"]).viewBox.split(" ").map(Number);
assert.ok(w > h * 2, `Rusia es ancha (${w} x ${h})`);
const france = shapePieces(["France"]);
assert.ok(france.kept.length >= 2 && france.kept.length < france.all.length, "Francia con Córcega, sin la Guayana");
const usa = shapePieces(["United States of America"]);
assert.ok(!usa.kept.some((p) => p.centre[1] > 55), "sin Alaska");
const shapeKey = shapeToken(["Spain"]);
assert.deepEqual(shapeForToken(shapeKey), ["Spain"]);
assert.ok(!shapeUrl(shapeKey).includes("Spain"));
assert.equal(shapeForToken("nope"), null);

// Flag tokens hide the country.
const token = flagToken("fr");
assert.equal(flagForToken(token), "fr");
assert.ok(!flagUrl(token).includes("fr.") && !flagUrl(token).endsWith("/fr"));
assert.equal(flagForToken("nope"), null);

console.log("geo.test ok");
