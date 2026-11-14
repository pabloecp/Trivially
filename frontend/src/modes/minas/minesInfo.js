import { TOPICS } from "../quiz/quizInfo.js";

import { translate as tr } from "../../lib/i18n.js";
// Campo de minas' settings and labels (same ids and limits as backend/src/game/mines.js).

// The ten categories of the question bank, in the same order and with the same names as Trivia's topics.
export const CATEGORIES = TOPICS;

// The way to play (MINES_STYLES on the server) and how it's played on the mode's card (ModeStage): a race with no
// turns. (A tiebreak is still played by turns, but that is not something to choose.)
export const STYLES = [
  {
    id: "carrera",
    get label() { return tr("Carrera"); },
    get hint() { return tr("Sin turnos: elige todas las que puedas antes que los demás"); },
    steps: [
      { icon: "scroll", get text() { return tr("Lee el tema"); } },
      { icon: "bolt", get text() { return tr("Elige sin esperar turno"); } },
      { icon: "bomb", get text() { return tr("Si pisas una mina, fuera"); } },
    ],
  },
];

// The difficulties a match can mix (MINES_LEVELS on the server), any of them ticked. The harder, the deeper the mode's
// colour (colours in styles/mines.css).
export const DIFFICULTIES = [
  { id: "facil", get label() { return tr("Fácil"); }, color: "mines-light" },
  { id: "media", get label() { return tr("Media"); }, color: "mines" },
  { id: "dificil", get label() { return tr("Difícil"); }, color: "mines-deep" },
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
  return n === 1 ? tr("1 acierto") : tr("{n} aciertos", { n });
}
