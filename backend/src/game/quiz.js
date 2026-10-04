import { categoryName } from "../questions/questionSchema.js";

// "Opción múltiple": its settings and how a match picks its questions from the bank (backend/src/questions/).

export const QUIZ_MODE = "opciones";
export const QUIZ_DIFFICULTIES = ["facil", "media", "dificil", "mixta"];
// Same limits as the steppers on screen (frontend/src/modes/quiz/quizInfo.js).
export const QUIZ_LIMITS = {
  rounds: { min: 5, max: 20 },
  roundMs: { min: 5000, max: 30000 },
};
export const QUIZ_REVEAL_MS = 5000;

export function defaultQuizConfig() {
  return { rounds: 10, roundMs: 15000, difficulty: "mixta" };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));

/** Merges a settings change into the current quiz settings, keeping every value inside its limits. */
export function mergeQuizConfig(current, change = {}) {
  const base = { ...defaultQuizConfig(), ...current };
  return {
    rounds: change.rounds != null ? clamp(change.rounds, QUIZ_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs: change.roundMs != null ? clamp(change.roundMs, QUIZ_LIMITS.roundMs, base.roundMs) : base.roundMs,
    difficulty: QUIZ_DIFFICULTIES.includes(change.difficulty) ? change.difficulty : base.difficulty,
  };
}

/** The multiple-choice questions of the bank this mode may ask at that difficulty ("mixta" = all of them). */
function questionsFor(bank, difficulty) {
  return (bank || []).filter(
    (q) =>
      q.type === "multiple_choice" &&
      (q.mode == null || q.mode === QUIZ_MODE) &&
      (difficulty === "mixta" || !QUIZ_DIFFICULTIES.includes(difficulty) || q.difficulty === difficulty)
  );
}

/** How many different questions a match of this difficulty can draw from. */
export function countQuestions(bank, difficulty) {
  return questionsFor(bank, difficulty).length;
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * `count` different questions of that difficulty, as the rounds of a match: each with its options in a new random
 * order and `answer` pointing at the right one. These objects stay on the server (see RoomManager.publicQuestion).
 */
export function pickQuestions(bank, count, difficulty) {
  return shuffle(questionsFor(bank, difficulty))
    .slice(0, count)
    .map((q) => {
      const order = shuffle(q.data.options.map((_, i) => i));
      return {
        id: q.id,
        text: q.prompt,
        category: categoryName(q.category),
        difficulty: q.difficulty,
        options: order.map((i) => q.data.options[i]),
        answer: order.indexOf(q.data.correct),
      };
    });
}
