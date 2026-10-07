// Historia's settings and labels (same ids and limits as backend/src/game/history.js).

export const ERAS = [
  { id: "antigua", label: "Antigüedad", hint: "Hasta el año 476" },
  { id: "media", label: "Edad Media", hint: "476–1492" },
  { id: "moderna", label: "Edad Moderna", hint: "1492–1789" },
  { id: "contemporanea", label: "Contemporánea", hint: "Desde 1789" },
];

// The harder, the deeper the mode's colour; mixed takes the site's accent (colours in styles/history.css).
export const DIFFICULTIES = [
  { id: "mixta", label: "Mixta", color: "accent" },
  { id: "facil", label: "Fácil", color: "history-light" },
  { id: "media", label: "Media", color: "history" },
  { id: "dificil", label: "Difícil", color: "history-deep" },
];

export function findEra(id) {
  return ERAS.find((e) => e.id === id) || null;
}

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

export const ROUNDS_LIMITS = { min: 5, max: 25, step: 5 };
export const SECONDS_LIMITS = { min: 10, max: 30, step: 5 };

export function historyConfig(room) {
  const history = room?.config?.history || {};
  return {
    rounds: history.rounds || 5,
    roundMs: history.roundMs || 10000,
    eras: history.eras?.length ? history.eras : ERAS.map((e) => e.id),
    difficulty: history.difficulty || "mixta",
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

/** "1 año", "12 años". */
export function yearsText(n) {
  return `${n.toLocaleString("es-ES")} ${n === 1 ? "año" : "años"}`;
}
