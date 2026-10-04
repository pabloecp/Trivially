import { QUESTION_CATEGORIES, QUESTION_DIFFICULTIES } from "./questionSchema.js";

const LEVEL = { facil: "fácil", media: "media", dificil: "difícil" };

// Placeholder questions for local development without Supabase or backend/private/questions.json. They are
// obviously fake on purpose: the real ones must never be committed (the repo is public). Two per category and
// difficulty, so every difficulty has enough for the longest match (20 questions).
export function sampleQuestions() {
  const out = [];
  for (const [category, name] of Object.entries(QUESTION_CATEGORIES)) {
    for (const difficulty of QUESTION_DIFFICULTIES) {
      for (let n = 1; n <= 2; n += 1) {
        out.push({
          id: `sample-${category}-${difficulty}-${n}`,
          type: "multiple_choice",
          mode: "opciones",
          category,
          difficulty,
          language: "es",
          prompt: `Pregunta de ejemplo ${n} de ${name} (${LEVEL[difficulty]}). ¿Cuál es la respuesta correcta?`,
          data: { options: ["Esta no", "Esta es la correcta", "Tampoco", "Ninguna de estas"], correct: 1 },
        });
      }
    }
  }
  return out;
}
