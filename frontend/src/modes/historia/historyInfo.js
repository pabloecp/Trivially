// Rango's settings and labels (same ids and limits as backend/src/game/history.js). Its categories are Trivia's.
import { TOPICS } from "../quiz/quizInfo.js";
export { TOPICS };

// Its way of playing (HISTORY_STYLES on the server): "Cifras", a question whose answer is a number, on a bar.
export const STYLES = [{ id: "cifras", label: "Cifras", hint: "Elige el número en una barra" }];

// The harder, the deeper the mode's colour; mixed takes the site's accent (colours in styles/history.css).
export const DIFFICULTIES = [
  { id: "mixta", label: "Mixta", color: "accent" },
  { id: "facil", label: "Fácil", color: "history-light" },
  { id: "media", label: "Media", color: "history" },
  { id: "dificil", label: "Difícil", color: "history-deep" },
];

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

// The difficulties a match can mix (HISTORY_LEVELS on the server), any of them ticked.
export const LEVELS = DIFFICULTIES.filter((d) => d.id !== "mixta");

export const ROUNDS_LIMITS = { min: 5, max: 25, step: 5 };
export const SECONDS_LIMITS = { min: 10, max: 30, step: 5 };

export function historyConfig(room) {
  const history = room?.config?.history || {};
  return {
    rounds: history.rounds || 5,
    roundMs: history.roundMs || 10000,
    styles: STYLES.map((s) => s.id),
    categories: history.categories ?? TOPICS.map((t) => t.id),
    difficulties: history.difficulties ?? LEVELS.map((d) => d.id),
  };
}

/** How a year reads: "44 a. C." before Christ, and "d. C." after it only on a timeline that crosses the year 1. */
export function yearLabel(year, { crossesZero = false } = {}) {
  if (year < 0) return `${-year} a. C.`;
  return crossesZero ? `${year} d. C.` : String(year);
}

/** Years between two years: there is no year 0 (from 1 a. C. to 1 d. C. is one year). */
export function yearsApart(a, b) {
  const gap = Math.abs(a - b);
  return a < 0 !== b < 0 ? gap - 1 : gap;
}

/** How a figure of Cifras reads: "8849 m", "42.195 m", "3.333.360 puntos" (like figureLabel on the server). */
export function figureLabel(value, unit = "") {
  const text = Number(value).toLocaleString("es-ES", { useGrouping: Math.abs(value) >= 10000 });
  return unit ? `${text} ${unit}` : text;
}

/** A figure on the bar's scale, short: "20 mil", "1,5 M". */
export function figureScale(value) {
  if (value >= 1e6) return `${(value / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M`;
  if (value >= 10000) return `${(value / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} mil`;
  return String(value);
}

/** "1 año", "12 años". */
export function yearsText(n) {
  return `${n.toLocaleString("es-ES")} ${n === 1 ? "año" : "años"}`;
}
