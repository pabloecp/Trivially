import assert from "node:assert/strict";
import { scoreAnswer } from "./scoring.js";

const fast = scoreAnswer({ correct: true, remainingMs: 14000, durationMs: 15000, streak: 0 });
const slow = scoreAnswer({ correct: true, remainingMs: 1000, durationMs: 15000, streak: 0 });
const miss = scoreAnswer({ correct: false, remainingMs: 14000, durationMs: 15000, streak: 4 });
const streak = scoreAnswer({ correct: true, remainingMs: 14000, durationMs: 15000, streak: 3 });

assert.ok(fast.points > slow.points);
// Every round is worth at most 1000 points; a right answer, at least 500.
assert.ok(fast.points <= 1000 && slow.points >= 500);
assert.equal(miss.points, 0);
assert.equal(miss.streak, 0);
// A streak is counted, but adds no points.
assert.equal(streak.points, fast.points);
assert.equal(streak.streak, 4);
console.log("scoring.test ok");
