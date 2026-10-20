import { TOPICS } from "../quiz/quizInfo.js";

// Rey de la colina's settings and labels (same ids and limits as backend/src/game/rey.js).

// The ten categories of the question bank, in the same order and with the same names as Trivia's topics.
export const CATEGORIES = TOPICS;

// The difficulties a match can mix, any of them ticked, each with what keeping the crown through a question of that
// difficulty is worth (REY_POINTS on the server).
export const DIFFICULTIES = [
  { id: "facil", label: "Fácil", points: 1 },
  { id: "media", label: "Media", points: 3 },
  { id: "dificil", label: "Difícil", points: 5 },
];

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

// The least different questions a match needs (REY_MIN_QUESTIONS on the server).
export const MIN_QUESTIONS = 12;

export const ROUND_LIMITS = { min: 5, max: 20, step: 5 };
// Seconds the challengers have to answer the king's question.
export const SECONDS_LIMITS = { min: 15, max: 35, step: 5 };

export function reyConfig(room) {
  const rey = room?.config?.rey || {};
  return {
    rounds: rey.rounds || 10,
    roundMs: rey.roundMs || 20000,
    // An empty list is kept: it shows unticked, and the match can't start until one is ticked.
    categories: rey.categories ?? CATEGORIES.map((c) => c.id),
    difficulties: rey.difficulties ?? DIFFICULTIES.map((d) => d.id),
  };
}

/** "1 punto", "3 puntos". */
export function pointsText(n) {
  return `${n} ${n === 1 ? "punto" : "puntos"}`;
}
