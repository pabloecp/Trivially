export const ROUND_MS = 15000;
export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 7000;

export function scoreAnswer({ correct, remainingMs, durationMs, streak }) {
  if (!correct) return { points: 0, streak: 0, speedBonus: 0, streakBonus: 0 };
  const speedRatio = Math.max(0, Math.min(1, remainingMs / durationMs));
  const base = 800;
  const speedBonus = Math.round(speedRatio * 500);
  const nextStreak = streak + 1;
  const streakBonus = Math.min(400, (nextStreak - 1) * 50);
  return {
    points: base + speedBonus + streakBonus,
    streak: nextStreak,
    speedBonus,
    streakBonus,
  };
}
