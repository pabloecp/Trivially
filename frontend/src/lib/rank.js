// Competitivo's rank as the screens draw it. The tiers are the server's (backend/src/game/rank.js: RANK_TIERS and
// DIVISION_POINTS), plus each one's colour; every tier but the last has three divisions, III → II → I.
export const DIVISION_POINTS = 100;
export const RANK_TIERS = [
  { id: "bronce", name: "Bronce", min: 0, color: "#d0874f" },
  { id: "plata", name: "Plata", min: 300, color: "#b9c6d3" },
  { id: "oro", name: "Oro", min: 600, color: "#f5b82e" },
  { id: "platino", name: "Platino", min: 900, color: "#46d3c3" },
  { id: "diamante", name: "Diamante", min: 1200, color: "#6aa8ff" },
  { id: "maestro", name: "Maestro", min: 1500, color: "#c56bff" },
];
const DIVISIONS = ["III", "II", "I"];

/**
 * Where `rank` ({ points, matches, wins, best }, or null before the first competitive match) stands: its tier, the
 * name with its division ("Oro II"), and the way to the next step (`progress` 0–1, `toNext` points; null at the top).
 */
export function rankInfo(rank) {
  const points = Math.max(0, rank?.points || 0);
  const index = RANK_TIERS.reduce((at, t, i) => (points >= t.min ? i : at), 0);
  const tier = RANK_TIERS[index];
  const top = index === RANK_TIERS.length - 1;
  if (top) return { tier, label: tier.name, points, progress: 1, toNext: null, nextLabel: null, matches: rank?.matches || 0, wins: rank?.wins || 0 };
  const division = Math.min(DIVISIONS.length - 1, Math.floor((points - tier.min) / DIVISION_POINTS));
  const from = tier.min + division * DIVISION_POINTS;
  const lastDivision = division === DIVISIONS.length - 1;
  const nextTier = RANK_TIERS[index + 1];
  const to = lastDivision ? nextTier.min : from + DIVISION_POINTS;
  return {
    tier,
    label: `${tier.name} ${DIVISIONS[division]}`,
    points,
    progress: (points - from) / (to - from),
    toNext: to - points,
    nextLabel: lastDivision ? (nextTier.id === "maestro" ? nextTier.name : `${nextTier.name} III`) : `${tier.name} ${DIVISIONS[division + 1]}`,
    matches: rank?.matches || 0,
    wins: rank?.wins || 0,
  };
}
