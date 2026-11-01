// Elo of every game, moved by each finished game of a public match (a single game's queue or one of a Clásico). Kept in
// `user.elo[game]` ({ rating, games, best }), saved with the rest of the user; guests have none (they play as ELO_START
// and nothing is saved). Everyone starts at 500 and climbs fast at first, evenly from 2500 and slowly from 5000.
// The matchmaking looks for rivals with a close elo (roomManager.js eloFits) and the bots' difficulty follows theirs (bots.js).

export const ELO_START = 500;
export const ELO_MIN = 0;

// The games a public match draws from have an elo; the Clásico's "general" one is the average of these.
export const ELO_GAMES = ["opciones", "historia", "minas", "musica", "mundo", "lluvia"];
export const CLASSIC_ELO_GAMES = ["opciones", "historia", "minas"];

// Two accounts that have played this many public matches together stop counting for each other: neither their elo nor
// their rank moves because of the other (it stops people boosting each other). Their matches still play normally.
export const TOGETHER_LIMIT = 5;
const TOGETHER_KEPT = 300;

/** Someone's rating in a game (a user, or a bot's profile with the same `elo` field). */
export function eloOf(who, game) {
  return who?.elo?.[game]?.rating ?? ELO_START;
}

/** The Clásico's general elo: the average over its games. */
export function generalElo(who) {
  const sum = CLASSIC_ELO_GAMES.reduce((total, game) => total + eloOf(who, game), 0);
  return Math.round(sum / CLASSIC_ELO_GAMES.length);
}

/** The elo a search for `game` (null: the Clásico's) uses for someone. */
export const searchElo = (who, game) => (game ? eloOf(who, game) : generalElo(who));

// How much a game moves your elo, by the place you finish in (`s`: 1 first, 0 in the middle, -1 last; a lobby of five is
// 1, .5, 0, -.5, -1). Three stretches, each a row of points for those five places (the other sizes are in between):
//  - up to ELO_FAST_UNTIL, "ganar rápido": almost every place gains (the fourth a little) and the last loses little;
//  - up to ELO_SLOW_FROM, "equilibrado": the top two gain and the bottom two lose the same;
//  - from there, "ganar lento": the second gains a little, the third already loses and the last loses the most.
// Near each limit the rows blend into each other (ELO_BLEND on each side), so nothing jumps at exactly 2500 or 5000.
export const ELO_FAST_UNTIL = 2500;
export const ELO_SLOW_FROM = 5000;
const ELO_BLEND = 250;
const SCORES = [1, 0.5, 0, -0.5, -1];
export const ELO_TABLES = {
  fast: [60, 40, 25, 10, -10],
  balanced: [35, 15, 0, -15, -35],
  slow: [20, 5, -10, -25, -40],
};

// How much of each row counts at a rating.
function stretches(rating) {
  const toBalanced = Math.min(1, Math.max(0, (rating - (ELO_FAST_UNTIL - ELO_BLEND)) / (2 * ELO_BLEND)));
  const toSlow = Math.min(1, Math.max(0, (rating - (ELO_SLOW_FROM - ELO_BLEND)) / (2 * ELO_BLEND)));
  return { fast: 1 - toBalanced, balanced: toBalanced * (1 - toSlow), slow: toSlow };
}

/** The points a place is worth at a rating, before the rivals' strength: `s` from 1 (first) to -1 (last). */
export function placePoints(s, rating) {
  const at = Math.min(SCORES.length - 1, Math.max(0, (1 - s) * 2));
  const low = Math.floor(at);
  const high = Math.min(SCORES.length - 1, low + 1);
  const part = at - low;
  const w = stretches(rating);
  let sum = 0;
  for (const [name, weight] of Object.entries(w)) {
    if (weight) sum += weight * (ELO_TABLES[name][low] * (1 - part) + ELO_TABLES[name][high] * part);
  }
  return sum;
}

/**
 * How many elo points each player of a finished game gets. `entries` are `{ id, rating, points }`; `counts(a, b)` says
 * whether two of them count against each other (not when they have played TOGETHER_LIMIT matches together already).
 * Each player is placed among the rivals that count for them (equal points share a place); the place is worth
 * placePoints at their rating, more when the rivals' elo is higher than theirs (and less to lose against weaker ones).
 * Returns a Map from id to the change (0 when nobody counts).
 */
export function eloDeltas(entries, counts = () => true) {
  const out = new Map(entries.map((e) => [e.id, 0]));
  for (const a of entries) {
    const rivals = entries.filter((b) => b !== a && counts(a.id, b.id));
    if (!rivals.length) continue;
    const above = rivals.filter((b) => b.points > a.points).length + rivals.filter((b) => b.points === a.points).length / 2;
    const s = 1 - (2 * above) / rivals.length;
    const points = placePoints(s, a.rating);
    const strength = Math.min(1.4, Math.max(0.6, 1 + (rivals.reduce((sum, b) => sum + b.rating, 0) / rivals.length - a.rating) / 1500));
    out.set(a.id, Math.round(points >= 0 ? points * strength : points / strength));
  }
  return out;
}

/** Moves one rating (never below ELO_MIN) and counts the game. Works on a user or a bot's profile. */
export function applyElo(who, game, delta) {
  const elo = (who.elo ||= {});
  const current = { rating: ELO_START, games: 0, best: ELO_START, ...(elo[game] || {}) };
  current.rating = Math.max(ELO_MIN, current.rating + delta);
  current.games += 1;
  current.best = Math.max(current.best, current.rating);
  elo[game] = current;
  return current;
}

/** Whether two accounts still count against each other (`together` is each user's `{ rivalId: matches }`). */
export function countsTogether(a, b) {
  return (a?.together?.[b?.id] || 0) < TOGETHER_LIMIT && (b?.together?.[a?.id] || 0) < TOGETHER_LIMIT;
}

/** Adds one match played against each of `rivalIds` to an account's count (the oldest rivals are forgotten). */
export function addTogether(user, rivalIds) {
  const together = (user.together ||= {});
  for (const id of rivalIds) together[id] = (together[id] || 0) + 1;
  const ids = Object.keys(together);
  if (ids.length > TOGETHER_KEPT) {
    ids.sort((x, y) => together[y] - together[x]).slice(TOGETHER_KEPT).forEach((id) => delete together[id]);
  }
}

/** What a rating asks of a bot: its chance of a right answer, from 0.12 (elo 300 or less) to 0.8 (elo 5000 or more). */
export function skillFor(rating) {
  const t = Math.min(1, Math.max(0, (rating - 300) / 4700));
  return 0.12 + 0.68 * t ** 0.7;
}
