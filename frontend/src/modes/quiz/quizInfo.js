// Difficulty levels of "Opción múltiple" (same ids as QUIZ_DIFFICULTIES in backend/src/game/quiz.js). The harder,
// the deeper the blue; mixed takes the butter accent (colours in styles/quiz.css).
export const DIFFICULTIES = [
  { id: "facil", label: "Fácil", hint: "Para calentar", color: "quiz-light", stars: 1 },
  { id: "media", label: "Media", hint: "Un poco de todo", color: "quiz", stars: 2 },
  { id: "dificil", label: "Difícil", hint: "Solo expertos", color: "quiz-deep", stars: 3 },
  { id: "mixta", label: "Mixta", hint: "Las tres mezcladas", color: "quiz-accent", stars: 0 },
];

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[3];
}

// Same limits as QUIZ_LIMITS on the server.
export const QUESTIONS_LIMITS = { min: 5, max: 20, step: 5 };
export const SECONDS_LIMITS = { min: 5, max: 30, step: 5 };
export const QUIZ_REVEAL_S = 5;

export function quizConfig(room) {
  const quiz = room?.config?.quiz || {};
  return {
    rounds: quiz.rounds || 10,
    roundMs: quiz.roundMs || 15000,
    difficulty: quiz.difficulty || "mixta",
  };
}

// The four answers always keep the same colour and letter, like the buttons of a game show.
export const OPTION_LETTERS = ["A", "B", "C", "D"];
