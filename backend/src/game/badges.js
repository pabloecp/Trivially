// The profile's badges ("Insignias"): ten, hard to get, each won by a feat that comes from what the account already
// keeps (its stats, its daily challenges, its Clásico rank). Once a badge's progress reaches its goal it's won for good
// (the numbers only grow). An account wears at most one, beside its name on the profile (`user.badge`, chosen there).
// The frontend (lib/badges.js) has the same ids, goals and rules to draw the progress; the server checks them again
// before a badge is worn.

// The games a win counts for in "Todoterreno" (every game in "Juego libre").
export const BADGE_GAMES = ["opciones", "musica", "mundo", "historia", "minas", "lluvia", "rey", "farsante"];
// "Perfección": a match of at least this many rounds of Trivia or Adivina la canción with every round right.
export const PERFECT_ROUNDS = 10;
export const PERFECT_GAMES = ["opciones", "musica"];
// "Melómano": the songs guessed in Adivina la canción, all artists together (`stats.artistHits`).
const songsGuessed = (u) => Object.values(u.stats?.artistHits || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

export const BADGES = [
  { id: "campeon", goal: 100, progress: (u) => u.stats?.wins || 0 },
  { id: "enciclopedia", goal: 1000, progress: (u) => u.stats?.correctAnswers || 0 },
  { id: "imparable", goal: 15, progress: (u) => u.stats?.bestStreak || 0 },
  { id: "veterano", goal: 300, progress: (u) => u.stats?.gamesPlayed || 0 },
  { id: "constante", goal: 30, progress: (u) => u.dailyDone || 0 },
  { id: "todoterreno", goal: BADGE_GAMES.length, progress: (u) => BADGE_GAMES.filter((g) => (u.stats?.winsByGame?.[g] || 0) > 0).length },
  { id: "leyenda", goal: 1500, progress: (u) => u.rank?.best || 0 },
  { id: "perfeccion", goal: 1, progress: (u) => u.stats?.perfectGames || 0 },
  { id: "record", goal: 14000, progress: (u) => u.stats?.bestScore || 0 },
  { id: "melomano", goal: 500, progress: (u) => songsGuessed(u) },
];

/** The ids of the badges `user` has won. */
export function earnedBadges(user) {
  if (!user || user.isGuest) return [];
  return BADGES.filter((b) => b.progress(user) >= b.goal).map((b) => b.id);
}

/** The badge `user` wears: their choice while it's still one they have, or null. */
export function wornBadge(user) {
  return user?.badge && earnedBadges(user).includes(user.badge) ? user.badge : null;
}

/** Why `user` can't wear badge `id` (null takes it off), or null when they can. */
export function badgeError(user, id) {
  if (id === null) return null;
  if (!BADGES.some((b) => b.id === id)) return "Insignia no válida";
  if (!earnedBadges(user).includes(id)) return "Todavía no ganas esa insignia";
  return null;
}

/** Whether a finished match's rounds make it a perfect one ("Perfección"). */
export function isPerfectMatch(game, rounds = []) {
  return PERFECT_GAMES.includes(game) && rounds.length >= PERFECT_ROUNDS && rounds.every((r) => r.status === "ok");
}
