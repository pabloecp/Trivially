// "Reto del día": each account has one challenge a day, drawn at random from CHALLENGES (the same one all day, a new one
// at midnight, DAILY_TZ). Every one takes about 3 to 5 matches. Finished matches add to its progress (applyDaily, from
// db/store.js applyMatchStats) in whichever game they were played, public or private. Kept in `user.daily`
// ({ day, id, progress, games, done }) and how many challenges the account has completed in `user.dailyDone`. Guests have none.
import crypto from "node:crypto";

export const DAILY_TZ = "America/Mexico_City";

// `count(match)`: how much one finished match adds. A match is `{ game, public, position, players, score, correct,
// bestStreak }`. `distinct` counts different games instead (the match's `game` is added to `daily.games`).
export const CHALLENGES = [
  { id: "juega-4", goal: "Juega 4 partidas", how: "En cualquier juego", target: 4, count: () => 1 },
  { id: "gana-3", goal: "Gana 3 partidas", how: "En cualquier juego", target: 3, count: (m) => (m.position === 1 && m.players > 1 ? 1 : 0) },
  { id: "podio-4", goal: "Queda en el podio 4 veces", how: "Entre los 3 primeros", target: 4, count: (m) => (m.position <= 3 && m.players > 1 ? 1 : 0) },
  { id: "aciertos-20", goal: "Acierta 20 respuestas", how: "En cualquier juego", target: 20, count: (m) => m.correct },
  { id: "puntos-8000", goal: "Suma 8.000 puntos", how: "En cualquier juego", target: 8000, count: (m) => m.score },
  { id: "racha-3", goal: "Acierta 3 seguidas en 3 partidas", how: "Una racha por partida", target: 3, count: (m) => (m.bestStreak >= 3 ? 1 : 0) },
  { id: "cuatro-de-cinco", goal: "Acierta 4 o más en 3 partidas", how: "En una misma partida", target: 3, count: (m) => (m.correct >= 4 ? 1 : 0) },
  { id: "publicas-3", goal: "Juega 3 partidas públicas", how: "Con gente de todos lados", target: 3, count: (m) => (m.public ? 1 : 0) },
  { id: "juegos-3", goal: "Prueba 3 juegos distintos", how: "Uno en cada partida", target: 3, distinct: true },
  { id: "dos-mil-4", goal: "Pasa de 2.000 puntos en 4 partidas", how: "En una misma partida", target: 4, count: (m) => (m.score >= 2000 ? 1 : 0) },
];

const byId = (id) => CHALLENGES.find((c) => c.id === id) || null;

/** The day as "2026-10-31" in DAILY_TZ. */
export function dayKey(now = Date.now()) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: DAILY_TZ });
}

/** The challenge an account has on a day: random, but the same for the whole day. */
export function challengeFor(userId, day) {
  const hash = crypto.createHash("sha256").update(`${userId}:${day}`).digest();
  return CHALLENGES[hash.readUInt32BE(0) % CHALLENGES.length];
}

/** Today's `user.daily`, started (or restarted) when the day has changed. */
function today(user, now) {
  const day = dayKey(now);
  if (user.daily?.day === day && byId(user.daily.id)) return user.daily;
  user.daily = { day, id: challengeFor(user.id, day).id, progress: 0, games: [], done: false };
  return user.daily;
}

/**
 * A finished match for an account: adds to today's challenge. Returns true when it completed the challenge with this
 * match (the account's `dailyDone` goes up by one, once a day).
 */
export function applyDaily(user, match, now = Date.now()) {
  const daily = today(user, now);
  if (daily.done) return false;
  const challenge = byId(daily.id);
  if (challenge.distinct) {
    if (match.game && !daily.games.includes(match.game)) daily.games.push(match.game);
    daily.progress = daily.games.length;
  } else {
    daily.progress += Math.max(0, Math.round(challenge.count(match) || 0));
  }
  if (daily.progress >= challenge.target) {
    daily.progress = challenge.target;
    daily.done = true;
    user.dailyDone = (user.dailyDone || 0) + 1;
    return true;
  }
  return false;
}

/** What the account's screens show: today's challenge with its progress, and how many have been completed in all. */
export function dailyView(user, now = Date.now()) {
  if (!user || user.isGuest) return null;
  const day = dayKey(now);
  const state = user.daily?.day === day && byId(user.daily.id) ? user.daily : { id: challengeFor(user.id, day).id, progress: 0, done: false };
  const challenge = byId(state.id);
  return { id: challenge.id, goal: challenge.goal, how: challenge.how, target: challenge.target, progress: state.progress, done: Boolean(state.done), total: user.dailyDone || 0 };
}
