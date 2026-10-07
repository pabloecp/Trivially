import { isCorrectAnswer, normalizeAnswer, songKey } from "./answers.js";
import assert from "node:assert/strict";

assert.equal(normalizeAnswer("  Ojitos   Lindos!! "), "ojitos lindos");
assert.equal(normalizeAnswer("Ojitos Lindos (feat. Bomba Estéreo)"), "ojitos lindos");
assert.equal(isCorrectAnswer("neverita", { title: "Neverita" }), true);
assert.equal(isCorrectAnswer("NEVERITA", { title: "Neverita" }), true);
assert.equal(isCorrectAnswer("ojitos lindo", { title: "Ojitos Lindos" }), true);
assert.equal(isCorrectAnswer("ojitos lindos", { title: "Ojitos Lindos (feat. Bomba Estéreo)" }), true);
assert.equal(isCorrectAnswer("despues de la playa", { title: "Después de la Playa" }), true);
assert.equal(isCorrectAnswer("25 8", { title: "25/8", aliases: ["25 8", "veinticinco ocho"] }), true);
assert.equal(isCorrectAnswer("25/8", { title: "25/8", aliases: ["25 8"] }), true);
assert.equal(isCorrectAnswer("veinticinco ocho", { title: "25/8", aliases: ["25 8", "veinticinco ocho"] }), true);
assert.equal(isCorrectAnswer("Tití Me Preguntó", { title: "Neverita" }), false);
assert.equal(isCorrectAnswer("memorias", { title: "MEMORIAS" }), true);
assert.equal(isCorrectAnswer("badtrip", { title: "BADTRIP :(" }), true);
assert.equal(isCorrectAnswer("cancion cualquiera", { title: "Neverita" }), false);
// One key per recording: the same song saved twice is listed once, a remix stays apart from its original.
assert.equal(songKey({ title: "ADIVINO", artistName: "Myke Towers" }), songKey({ title: "ADIVINO", artistName: "Myke Towers & Bad Bunny" }));
assert.equal(
  songKey({ title: "Shakira: Bzrp Music Sessions, Vol. 53", artistName: "Bizarrap & Shakira" }),
  songKey({ title: "Shakira: Bzrp Music Sessions, Vol. 53/66", artistName: "Bizarrap" }),
);
assert.notEqual(songKey({ title: "Loca", artistName: "Khea" }), songKey({ title: "Loca (Remix)", artistName: "Khea" }));
assert.notEqual(songKey({ title: "Sorry", artistName: "Justin Bieber" }), songKey({ title: "Sorry", artistName: "Madonna" }));

console.log("answers.test ok");

