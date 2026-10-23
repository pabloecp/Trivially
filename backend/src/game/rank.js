// Competitivo's rank: every finished competitive match moves each account's rank points by its place (frontend
// lib/rank.js has the same tiers to draw them). Kept in `user.rank` ({ points, matches, wins, best }), saved with the rest
// of the user; guests and bots get none.

// Points by place, for how many finished the match (a room may end with fewer than it started with). The first gains
// the most, the last loses; a match alone moves nothing.
export const PLACE_POINTS = {
  2: [25, -15],
  3: [30, 5, -15],
  4: [30, 10, -5, -15],
  5: [30, 15, 5, -5, -15],
};
// A match of 3 games is worth more than one of a single game.
export const LONG_MATCH_GAMES = 3;
const LONG_MATCH_FACTOR = 1.5;

// Each tier starts at `min` points and, but for the last, has three divisions (III, II, I) of DIVISION_POINTS each.
export const DIVISION_POINTS = 100;
export const RANK_TIERS = [
  { id: "bronce", name: "Bronce", min: 0 },
  { id: "plata", name: "Plata", min: 300 },
  { id: "oro", name: "Oro", min: 600 },
  { id: "platino", name: "Platino", min: 900 },
  { id: "diamante", name: "Diamante", min: 1200 },
  { id: "maestro", name: "Maestro", min: 1500 },
];

export const emptyRank = () => ({ points: 0, matches: 0, wins: 0, best: 0 });

function placePoints(index, count) {
  const table = PLACE_POINTS[Math.min(count, 5)];
  if (!table) return 0;
  // More than five players (never in a public match): the middle places get the middle points.
  return table[Math.round((index * (table.length - 1)) / Math.max(1, count - 1))];
}

/**
 * How many rank points each player of a finished match gets: `ranked` in final position (rankedPlayers), `winnerId` a
 * tiebreak's winner. Players with the same score share their places' points (the average), unless a tiebreak settled
 * who was first among them. Returns a Map from player id to points.
 */
export function rankDeltas(ranked, { games = 1, winnerId = null } = {}) {
  const count = ranked.length;
  const factor = games >= LONG_MATCH_GAMES ? LONG_MATCH_FACTOR : 1;
  const out = new Map();
  if (count < 2) {
    ranked.forEach((p) => out.set(p.id, 0));
    return out;
  }
  let i = 0;
  while (i < count) {
    let j = i;
    while (j + 1 < count && ranked[j + 1].score === ranked[i].score) j += 1;
    const group = ranked.slice(i, j + 1);
    const settled = group.length > 1 && group.some((p) => p.id === winnerId);
    if (group.length === 1 || settled) {
      group.forEach((p, k) => out.set(p.id, Math.round(placePoints(i + k, count) * factor)));
    } else {
      let sum = 0;
      for (let k = i; k <= j; k += 1) sum += placePoints(k, count);
      const share = Math.round((sum / group.length) * factor);
      group.forEach((p) => out.set(p.id, share));
    }
    i = j + 1;
  }
  return out;
}

/** Applies a match's points to one account's rank (never below 0). `won`: they finished first, alone. */
export function applyRank(user, delta, won) {
  const rank = { ...emptyRank(), ...(user.rank || {}) };
  rank.points = Math.max(0, rank.points + delta);
  rank.matches += 1;
  if (won) rank.wins += 1;
  rank.best = Math.max(rank.best, rank.points);
  user.rank = rank;
  return rank;
}
