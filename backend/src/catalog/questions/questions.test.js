import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCorrectOpenAnswer } from "../../game/openAnswers.js";

// Cada banco de preguntas debe ser consistente: ids únicos, campos obligatorios y que la propia respuesta
// (y cada alias) cuente como correcta.
for (const file of ["geografia.json"]) {
  const questions = JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
  assert.ok(questions.length > 0, `${file} vacío`);
  const ids = new Set();
  for (const q of questions) {
    assert.ok(q.id && !ids.has(q.id), `${file}: id repetido o ausente (${q.id})`);
    ids.add(q.id);
    assert.ok(q.prompt && q.answer, `${file}: ${q.id} sin prompt o respuesta`);
    assert.ok([1, 2, 3].includes(q.difficulty), `${file}: ${q.id} dificultad inválida`);
    for (const text of [q.answer, ...(q.aliases || [])]) {
      assert.equal(isCorrectOpenAnswer(text, q), true, `${file}: ${q.id} no acepta "${text}"`);
    }
  }
}
console.log("questions.test ok");
