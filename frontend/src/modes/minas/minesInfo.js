import { TOPICS } from "../quiz/quizInfo.js";

// Campo de minas' settings and labels (same ids and limits as backend/src/game/mines.js).

// The ten categories of the question bank, in the same order and with the same names as Trivia's topics.
export const CATEGORIES = TOPICS;

// The two ways to play (MINES_STYLES on the server), each with how it's played on the mode's card (ModeStage):
// by turns, where every player picks one cell and waits for the others, or a race with no turns.
export const STYLES = [
  {
    id: "turnos",
    label: "Por turnos",
    hint: "En cada turno todos eligen una casilla y esperan a los demás",
    steps: [
      { icon: "scroll", text: "Lee el tema" },
      { icon: "grid", text: "Una casilla por turno" },
      { icon: "bomb", text: "Si pisas una mina, fuera" },
    ],
  },
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

// The mode's card when both ways are ticked: each round is played one way or the other.
export const MIXED_STEPS = [
  { icon: "scroll", text: "Lee el tema" },
  { icon: "grid", text: "Por turnos o en carrera" },
  { icon: "bomb", text: "Si pisas una mina, fuera" },
];

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

export const ROUND_OPTIONS = [3, 5, 7, 10];
// Seconds of each turn ("turnos"), and of a whole round in a race ("carrera").
export const SECONDS_LIMITS = { min: 5, max: 20, step: 5 };
export const RACE_SECONDS_LIMITS = { min: 30, max: 90, step: 15 };

export function minesConfig(room) {
  const mines = room?.config?.mines || {};
  return {
    // The ways to play that are ticked (both by default); an older room had only one, `style`.
    styles: mines.styles ?? (mines.style ? [findStyle(mines.style).id] : STYLES.map((s) => s.id)),
    rounds: mines.rounds || 5,
    turnMs: mines.turnMs || 10000,
    roundMs: mines.roundMs || 45000,
    // An empty list is kept: it shows unticked, and the match can't start until one is ticked.
    categories: mines.categories ?? CATEGORIES.map((c) => c.id),
    difficulties: mines.difficulties ?? DIFFICULTIES.map((d) => d.id),
  };
}

/** "1 acierto", "3 aciertos". */
export function hitsText(n) {
  return `${n} ${n === 1 ? "acierto" : "aciertos"}`;
}
