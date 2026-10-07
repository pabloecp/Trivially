export const ROUND_MS = 15000;
export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 3000; // the answer stays on screen 3 s, then the next round counts down 3 s

// Every mode scores on the same scale: at most 1000 points a round. A right answer gets half of it, and the faster it
// came the more of the other half (500 to 1000). Rounds judged by closeness (a pin on the map, a year on the timeline)
// give 1000 for the exact answer and up to 800 for a near one (game/geo.js locationPoints, game/history.js yearPoints).
// A streak is counted for the stats but adds no points.
export const MAX_POINTS = 1000;
const BASE_POINTS = 500;

export function scoreAnswer({ correct, remainingMs, durationMs, streak }) {
  if (!correct) return { points: 0, streak: 0, speedBonus: 0 };
  const speedRatio = Math.max(0, Math.min(1, remainingMs / durationMs));
  const speedBonus = Math.round(speedRatio * (MAX_POINTS - BASE_POINTS));
  return { points: BASE_POINTS + speedBonus, streak: streak + 1, speedBonus };
}
