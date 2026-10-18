import { TOPICS } from "../quiz/quizInfo.js";

// Lluvia's settings and labels (same ids and limits as backend/src/game/rain.js).

// The ten categories of the question bank, in the same order and with the same names as Trivia's topics.
export const CATEGORIES = TOPICS;

// The difficulties a match can mix (RAIN_LEVELS on the server), any of them ticked, each with its colour on the
// falling questions (styles/rain.css: green, yellow and red) and what a right answer is worth (RAIN_POINTS).
export const DIFFICULTIES = [
  { id: "facil", label: "Fácil", points: 1 },
  { id: "media", label: "Media", points: 3 },
  { id: "dificil", label: "Difícil", points: 5 },
];

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

// The least different questions a match needs (RAIN_MIN_QUESTIONS on the server).
export const MIN_QUESTIONS = 10;

export const ROUND_OPTIONS = [1, 2, 3, 4, 5];
// Seconds of rain in each round.
export const SECONDS_LIMITS = { min: 30, max: 90, step: 15 };

export function rainConfig(room) {
  const rain = room?.config?.rain || {};
  return {
    rounds: rain.rounds || 3,
    roundMs: rain.roundMs || 60000,
    // An empty list is kept: it shows unticked, and the match can't start until one is ticked.
    categories: rain.categories ?? CATEGORIES.map((c) => c.id),
    difficulties: rain.difficulties ?? DIFFICULTIES.map((d) => d.id),
  };
}

/** "1 punto", "3 puntos". */
export function pointsText(n) {
  return `${n} ${n === 1 ? "punto" : "puntos"}`;
}

/** "1 acierto", "3 aciertos". */
export function hitsText(n) {
  return `${n} ${n === 1 ? "acierto" : "aciertos"}`;
}
