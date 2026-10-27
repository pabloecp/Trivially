import assert from "node:assert/strict";
import { applyMatchStats, MATCH_HISTORY_LIMIT, sanitizeUser, sanitizeUserPublic } from "./store.js";

// Each finished match goes to the history of every registered player (the profile's "Historial"): newest first, at
// most MATCH_HISTORY_LIMIT (10), with the game, the place, how many played, the points, the others' names, the room and
// the rounds (which stay on the server: they're for "Reportar partida").
const stats = () => ({ gamesPlayed: 0, totalScore: 0, bestScore: 0, bestStreak: 0, correctAnswers: 0, wins: 0 });
const store = {
  users: {
    ana: { id: "ana", name: "Ana", stats: stats() },
    luis: { id: "luis", name: "Luis", stats: stats() },
  },
};
const rounds = [
  { round: 1, game: "mundo", questionId: "q-1", prompt: "Francia", answer: "Francia", yours: "Dentro del país", points: 1000, status: "ok" },
  { round: 2, game: "mundo", questionId: "q-2", prompt: "Chile", answer: "Chile", yours: null, points: 0, status: "none" },
];
// In final position: a tiebreak put Luis first with the same points.
const players = [
  { id: "luis", name: "Luis", score: 3000, rounds },
  { id: "ana", name: "Ana", score: 3000, rounds: [] },
  { id: "gst_1", name: "Invitado", score: 500, isGuest: true },
];
applyMatchStats(store, players, { game: "mundo", at: "2026-10-17T20:00:00.000Z", room: "ABCDE" });
assert.deepEqual(store.users.luis.history, [
  {
    at: "2026-10-17T20:00:00.000Z",
    game: "mundo",
    position: 1,
    players: 3,
    score: 3000,
    opponents: ["Ana", "Invitado"],
    room: "ABCDE",
    rounds,
  },
]);
assert.equal(store.users.ana.history[0].position, 2, "the place is the final one, tiebreak included");
assert.equal(store.users.ana.stats.gamesPlayed, 1, "the stats still add up");

// Out to the profile, never the room: how many questions. The account itself also gets
// its rounds ("Ver respuestas"), without the questions' ids; anyone else's view of it doesn't.
const shown = { at: "2026-10-17T20:00:00.000Z", game: "mundo", position: 1, players: 3, score: 3000, opponents: ["Ana", "Invitado"], questions: 2 };
const answered = rounds.map(({ questionId, ...round }) => round);
assert.deepEqual(sanitizeUser(store.users.luis).history, [{ ...shown, rounds: answered }]);
assert.ok(sanitizeUser(store.users.luis).history[0].rounds.every((r) => !("questionId" in r)), "no question ids");
assert.deepEqual(sanitizeUserPublic(store.users.luis).history, [shown]);

// Newest first, a match with no points too, and only the last ones are kept.
for (let i = 0; i < MATCH_HISTORY_LIMIT + 5; i += 1) applyMatchStats(store, [{ id: "ana", name: "Ana", score: i }], { game: "opciones" });
assert.equal(MATCH_HISTORY_LIMIT, 10);
assert.equal(store.users.ana.history.length, 10);
assert.equal(store.users.ana.history[0].score, MATCH_HISTORY_LIMIT + 4);

console.log("matchHistory.test ok");
