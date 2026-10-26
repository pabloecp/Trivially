import { TOPICS } from "../quiz/quizInfo.js";

// Campo de minas' settings and labels (same ids and limits as backend/src/game/mines.js).

// The ten categories of the question bank, in the same order and with the same names as Trivia's topics.
export const CATEGORIES = TOPICS;

// The way to play (MINES_STYLES on the server) and how it's played on the mode's card (ModeStage): a race with no
// turns. (A tiebreak is still played by turns, but that is not something to choose.)
export const STYLES = [
  {
    id: "carrera",
    label: "Carrera",
    hint: "Sin turnos: elige todas las que puedas antes que los demás",
    steps: [
      { icon: "scroll", text: "Lee el tema" },
      { icon: "bolt", text: "Elige sin esperar turno" },
      { icon: "bomb", text: "Si pisas una mina, fuera" },
    ],
  },
];

export function findStyle(id) {
  return STYLES.find((s) => s.id === id) || STYLES[0];
}

// The difficulties a match can mix (MINES_LEVELS on the server), any of them ticked. The harder, the deeper the mode's
// colour (colours in styles/mines.css).
export const DIFFICULTIES = [
  { id: "facil", label: "Fácil", color: "mines-light" },
  { id: "media", label: "Media", color: "mines" },
  { id: "dificil", label: "Difícil", color: "mines-deep" },
];

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

export const ROUND_OPTIONS = [3, 5, 10, 15, 20, 25];
// Seconds of a whole round in a race ("carrera").
export const RACE_SECONDS_LIMITS = { min: 30, max: 50, step: 5 };

export function minesConfig(room) {
  const mines = room?.config?.mines || {};
  return {
    styles: STYLES.map((s) => s.id),
    rounds: mines.rounds || 3,
    // A new room starts at the shortest of each (as the server does). The turn's seconds are only a tiebreak's clock.
    turnMs: mines.turnMs || 5000,
    roundMs: mines.roundMs || 30000,
    // An empty list is kept: it shows unticked, and the match can't start until one is ticked.
    categories: mines.categories ?? CATEGORIES.map((c) => c.id),
    difficulties: mines.difficulties ?? DIFFICULTIES.map((d) => d.id),
  };
}

/** "1 acierto", "3 aciertos". */
export function hitsText(n) {
  return `${n} ${n === 1 ? "acierto" : "aciertos"}`;
}
