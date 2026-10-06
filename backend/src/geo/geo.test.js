import assert from "node:assert/strict";
import { COUNTRIES } from "./countries.js";
import { buildGeoQuestions, GEO_KINDS, stableId } from "./geoQuestions.js";
import { hasCountry, locate } from "./worldMap.js";
import { flagForToken, flagToken, flagUrl } from "./flags.js";
import { isCorrectOpenAnswer } from "../game/openAnswers.js";
import { questionErrors, toQuestion } from "../questions/questionSchema.js";
import { countGeoQuestions, geoBank, locationPoints, mergeGeoConfig, pickGeoQuestions, pickTiebreakQuestion } from "../game/geo.js";

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

// Settings.
assert.deepEqual(mergeGeoConfig({}, { rounds: 99, roundMs: 1, kinds: ["flag", "nada", "capital"], difficulty: "x" }), {
  rounds: 25,
  roundMs: 15000,
  kinds: ["capital", "flag"],
  difficulty: "mixta",
});
assert.throws(() => mergeGeoConfig({}, { kinds: [] }), /al menos un tipo/);

// The bank: Supabase rows first; any kind they lack comes from countries.js.
const built = rows.map(toQuestion);
assert.equal(geoBank([]).length, rows.length);
const onlyCapitals = built.filter((q) => q.data.kind === "capital").slice(0, 3);
const mixed = geoBank([...onlyCapitals, { mode: "opciones", type: "multiple_choice", data: {} }]);
assert.equal(mixed.filter((q) => q.data.kind === "capital").length, 3, "the bank's capitals are used as they are");
assert.ok(mixed.some((q) => q.data.kind === "location") && mixed.every((q) => q.mode === "mundo"));

// A match: balanced kinds, never the same country twice, nothing secret beyond what the round needs.
const bank = geoBank(built);
const match = pickGeoQuestions(bank, { rounds: 10, kinds: ["capital", "flag", "location"], difficulty: "facil" });
assert.equal(match.length, 10);
const perKind = GEO_KINDS.map((k) => match.filter((t) => t.kind === k).length).sort();
assert.deepEqual(perKind, [3, 3, 4]);
assert.equal(new Set(match.map((t) => t.country)).size, 10);
assert.ok(match.every((t) => t.difficulty === "facil"));
assert.equal(countGeoQuestions(bank, { kinds: ["location"], difficulty: "facil" }), rows.filter((q) => q.data.kind === "location" && q.difficulty === "facil").length);
const tiebreak = pickTiebreakQuestion(bank, { difficulty: "mixta" }, match.map((t) => t.country));
assert.equal(tiebreak.kind, "location");
assert.equal(tiebreak.difficulty, "media");
assert.ok(!match.some((t) => t.country === tiebreak.country));

// Flag tokens hide the country.
const token = flagToken("fr");
assert.equal(flagForToken(token), "fr");
assert.ok(!flagUrl(token).includes("fr.") && !flagUrl(token).endsWith("/fr"));
assert.equal(flagForToken("nope"), null);

console.log("geo.test ok");
