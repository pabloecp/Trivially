import assert from "node:assert/strict";
import { RANK_TIERS, applyRank, rankDeltas } from "./rank.js";

const players = (...scores) => scores.map((score, i) => ({ id: `u${i + 1}`, score }));

// A duel: the winner gains, the loser loses.
let d = rankDeltas(players(900, 400));
assert.equal(d.get("u1"), 25);
assert.equal(d.get("u2"), -15);

// Five players, each place its points; 3 games are worth half as much again.
d = rankDeltas(players(500, 400, 300, 200, 100));
assert.deepEqual([...d.values()], [30, 15, 5, -5, -15]);
d = rankDeltas(players(500, 400, 300, 200, 100), { games: 3 });
assert.deepEqual([...d.values()], [45, 23, 8, -7, -22]);

// A room that ended with fewer players uses that count's table.
d = rankDeltas(players(500, 400, 300));
assert.deepEqual([...d.values()], [30, 5, -15]);

// Equal scores share their places' points, unless a tiebreak settled who was first.
d = rankDeltas(players(500, 500));
assert.equal(d.get("u1"), 5);
assert.equal(d.get("u2"), 5);
d = rankDeltas(players(500, 500), { winnerId: "u1" });
assert.equal(d.get("u1"), 25);
assert.equal(d.get("u2"), -15);

// Alone, nothing moves.
assert.equal(rankDeltas(players(800)).get("u1"), 0);

// Rank points never go below 0; matches, wins and the best are counted.
const user = {};
applyRank(user, -15, false);
assert.deepEqual(user.rank, { points: 0, matches: 1, wins: 0, best: 0 });
applyRank(user, 30, true);
applyRank(user, -5, false);
assert.deepEqual(user.rank, { points: 25, matches: 3, wins: 1, best: 30 });

// The tiers go up from 0.
assert.equal(RANK_TIERS[0].min, 0);
assert.ok(RANK_TIERS.every((t, i) => i === 0 || t.min > RANK_TIERS[i - 1].min));

console.log("rank ok");
