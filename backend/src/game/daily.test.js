import assert from "node:assert/strict";
import { applyMatchStats, sanitizeUser } from "../db/store.js";
import { applyDaily, CHALLENGES, challengeFor, dailyView, dayKey } from "./daily.js";

// Ten challenges, each asking for 3 to 5 matches' worth.
assert.equal(CHALLENGES.length, 10);
assert.equal(new Set(CHALLENGES.map((c) => c.id)).size, 10);
assert.ok(CHALLENGES.every((c) => c.target >= 3 || c.target >= 20), "each one is sized for a few matches");

// The same account gets the same challenge all day, and over many days they vary.
const now = Date.parse("2026-10-31T18:00:00Z");
assert.equal(challengeFor("usr_a", "2026-10-31").id, challengeFor("usr_a", "2026-10-31").id);
const seen = new Set();
for (let d = 1; d <= 60; d += 1) seen.add(challengeFor("usr_a", `2026-11-${String(d).padStart(2, "0")}`).id);
assert.ok(seen.size >= 6, "challenges are drawn at random");
assert.equal(dayKey(Date.parse("2026-10-31T05:30:00Z")), "2026-10-30", "the day turns at midnight in Mexico");

// Matches add to it until it's done, once; the count of completed challenges goes up by one.
const user = { id: "usr_a", isGuest: false };
const id = challengeFor(user.id, dayKey(now)).id;
assert.deepEqual({ ...dailyView(user, now), goal: 0, how: 0 }, { id, goal: 0, how: 0, target: dailyView(user, now).target, progress: 0, done: false, total: 0 });
const win = { game: "opciones", public: true, position: 1, players: 5, score: 4000, correct: 5, bestStreak: 5 };
let finished = false;
for (let i = 0; i < 12 && !finished; i += 1) finished = applyDaily(user, { ...win, game: ["opciones", "musica", "mundo", "historia"][i % 4] }, now);
assert.ok(finished, "a run of wins completes any challenge");
assert.equal(user.dailyDone, 1);
assert.equal(dailyView(user, now).done, true);
assert.equal(applyDaily(user, win, now), false, "done: nothing more to add");
assert.equal(user.dailyDone, 1);
// Tomorrow it starts over (and the total stays).
const tomorrow = now + 24 * 3600 * 1000;
assert.equal(dailyView(user, tomorrow).progress, 0);
assert.equal(dailyView(user, tomorrow).total, 1);

// Through a finished match, and what the account sees.
const store = { users: { usr_b: { id: "usr_b", name: "Bea", isGuest: false, stats: { totalScore: 0, bestScore: 0, gamesPlayed: 0, wins: 0, bestStreak: 0, correctAnswers: 0 } } } };
applyMatchStats(store, [{ id: "usr_b", name: "Bea", score: 3000, correct: 4, bestStreak: 4 }, { id: "gst_x", name: "Otro", score: 100, isGuest: true }], { game: "opciones", public: true });
assert.ok(sanitizeUser(store.users.usr_b).daily.progress >= 0);
assert.equal(typeof sanitizeUser(store.users.usr_b).daily.goal, "string");
assert.equal(dailyView({ id: "gst_y", isGuest: true }), null, "guests have none");
console.log("daily ok");
