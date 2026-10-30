import assert from "node:assert/strict";
import { playlistWinner, publicRun, rankedStandings } from "./playlist.js";

// A match of several games (a public match or a Clásico, game/playlist.js): whoever wins the most games wins it
// (points across all of them break a tie).

// ---- Who wins ----
const run = { standings: { a: { wins: 2, points: 100 }, b: { wins: 1, points: 5000 }, c: { wins: 2, points: 300 } } };
assert.deepEqual(
  rankedStandings(run).map((s) => s.id),
  ["c", "a", "b"],
  "the most games won, then the most points"
);
assert.equal(playlistWinner(rankedStandings(run)), "c");
assert.equal(playlistWinner(rankedStandings({ standings: { a: { wins: 1, points: 9 }, b: { wins: 1, points: 9 } } })), null, "a full tie");
assert.equal(playlistWinner(rankedStandings({ standings: { a: { wins: 0, points: 900 } } })), null, "nobody won a game");

// The final screen says who won each game of a playlist: whoever scored the most in it (all of them on a tie, nobody
// when nobody scored), from the points each round gave to its game, in play order.
{
  const run = { name: "P", order: "orden", items: [{ game: "opciones" }, { game: "musica" }, { game: "minas" }], standings: {}, games: [], index: 2 };
  run.itemPoints = { 0: { a: 900, b: 400 }, 1: { a: 300, b: 300 }, 2: { a: 0, b: 0 } };
  assert.deepEqual(publicRun(run).results, [
    { variant: "opciones", winners: ["a"] },
    { variant: "musica", winners: ["a", "b"] },
    { variant: "minas", winners: [] },
  ]);
}

console.log("playlist ok");
