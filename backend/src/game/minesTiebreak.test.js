import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// Campo de minas' tiebreak: when two or more players share the top score at the end, only they play a small board,
// by turns and with no points: one cell more than tied players, one right answer fewer than players and two mines.
// A right answer gets the player through; a mine or not picking leaves them out. If nobody finds a right answer, the
// ones who stepped on a mine play another turn with those mines in sight. Several through play another tiebreak;
// nobody who picked anything leaves the tie as it was.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);

// A room of Campo de minas whose only round was just played, with these scores.
function endedRoom(scores) {
  const ids = Object.keys(scores);
  const room = mgr.create({ host: { id: ids[0], name: ids[0], socketId: `s-${ids[0]}` }, mode: "multi", game: "minas" });
  ids.slice(1).forEach((id) => mgr.addPlayer(room, { id, name: id, socketId: `s-${id}` }));
  mgr.updateConfig(room, ids[0], { mines: { styles: ["carrera"], turnMs: 8000 } });
  mgr.start(room, ids[0]);
  stop(room);
  room.tracks = room.tracks.slice(0, 1);
  room.totalRounds = 1;
  ids.forEach((id) => (room.players.get(id).score = scores[id]));
  return room;
}
// The tiebreak's board as a known one: `true` right, `false` a mine.
function setCells(room, list) {
  room.tracks[room.currentRound].cells = list.map((correct, i) => ({ text: `Casilla ${i}`, correct, by: null, at: null, turn: null }));
}
const advance = (room) => {
  mgr.advance(room);
  stop(room);
};
const play = (room) => {
  mgr.beginPlaying(room);
  stop(room);
};

// ---- No tie: the match just ends ----
const clear = endedRoom({ a: 300, b: 200 });
advance(clear);
assert.equal(clear.phase, "finished");
assert.equal(clear.tiebreak, null);

// ---- Two tied: both step on a mine, come back, and the faster one finds the right answer ----
const room = endedRoom({ host: 200, ana: 500, luis: 500 });
const [host, ana, luis] = ["host", "ana", "luis"].map((id) => room.players.get(id));
advance(room);
assert.equal(room.phase, "countdown");
assert.deepEqual(room.tiebreak.playerIds, ["ana", "luis"]);
const board = room.tracks[room.currentRound];
assert.equal(board.cells.length, 3, "two tied: three cells");
assert.equal(board.cells.filter((c) => c.correct).length, 1, "one right answer fewer than players");
assert.equal(board.style, "turnos", "always by turns, even when the match was a race");
assert.equal(host.minefield, null, "the host watches");
let pub = mgr.publicState(room, "ana");
assert.equal(pub.question.size, 3);
assert.deepEqual(pub.tiebreak.playerIds, ["ana", "luis"]);
assert.equal(pub.tiebreak.over, false);

setCells(room, [true, false, false]);
play(room);
assert.equal(room.turn, 1);
assert.throws(() => mgr.pickCell(room, "host", { cell: 0, turn: 1 }), /empatados/);
assert.equal(mgr.pickCell(room, "ana", { cell: 1, turn: 1 }), false);
assert.equal(ana.minefield.out, "mina");
assert.equal(room.turn, 1, "the turn waits for Luis");
mgr.pickCell(room, "luis", { cell: 2, turn: 1 });
stop(room);
assert.equal(room.phase, "playing", "nobody found the right answer: another turn");
assert.equal(room.turn, 2);
assert.equal(room.tiebreak.revivedTurn, 2);
assert.equal(ana.minefield.out, null, "both come back");
assert.equal(luis.minefield.out, null);
pub = mgr.publicState(room, "ana");
assert.equal(pub.question.cells[1].correct, false, "the mines they stepped on stay in sight");
assert.throws(() => mgr.pickCell(room, "ana", { cell: 2, turn: 2 }), /ya eligió/);
mgr.pickCell(room, "luis", { cell: 0, turn: 2 });
stop(room);
assert.equal(room.phase, "reveal", "no right answer left: the turn ends");
assert.equal(ana.minefield.out, "tarde");
assert.equal(ana.lastAnswer.text, "Sin casilla correcta");
assert.equal(luis.lastAnswer.text, "Acertó");
assert.equal(room.tiebreak.winnerId, "luis");
assert.equal(room.tiebreak.reason, "acierto");
assert.equal(luis.score, 500, "a tiebreak gives no points");
advance(room);
assert.equal(room.phase, "finished");
pub = mgr.publicState(room);
assert.equal(pub.results[0].id, "luis");
assert.equal(pub.results[0].tiebreakWinner, true);
assert.equal(mgr.matchWinner(room, mgr.rankedPlayers(room)), "luis", "the tiebreak's winner wins the match");

// ---- Three tied: two find a right answer and play another tiebreak; there, the only one who picks wins ----
const trio = endedRoom({ a: 400, b: 400, c: 400 });
advance(trio);
assert.equal(trio.tracks[trio.currentRound].cells.length, 4, "three tied: four cells");
assert.equal(trio.tracks[trio.currentRound].cells.filter((c) => c.correct).length, 2);
setCells(trio, [true, true, false, false]);
play(trio);
mgr.pickCell(trio, "a", { cell: 0, turn: 1 });
mgr.pickCell(trio, "c", { cell: 2, turn: 1 });
assert.equal(trio.phase, "playing", "a right answer is still free: the turn waits for B");
mgr.pickCell(trio, "b", { cell: 1, turn: 1 });
stop(trio);
assert.equal(trio.phase, "reveal");
assert.deepEqual(trio.tiebreak.survivors, ["a", "b"]);
assert.equal(trio.tiebreak.winnerId, null);
advance(trio);
assert.equal(trio.phase, "countdown");
assert.equal(trio.tiebreak.round, 2);
assert.deepEqual(trio.tiebreak.playerIds, ["a", "b"], "only who got through");
assert.equal(trio.players.get("c").minefield, null);
setCells(trio, [true, false, false]);
play(trio);
mgr.pickCell(trio, "b", { cell: 1, turn: 1 });
mgr.endTurn(trio, true);
stop(trio);
assert.equal(trio.phase, "reveal", "A didn't pick: out, and B is the only one left");
assert.equal(trio.players.get("a").minefield.out, "tiempo");
assert.equal(trio.players.get("a").lastAnswer.text, "No eligió");
assert.equal(trio.tiebreak.winnerId, "b");
assert.equal(trio.tiebreak.reason, "solo");
advance(trio);
assert.equal(trio.phase, "finished");
assert.equal(mgr.publicState(trio).results[0].id, "b");

// ---- Nobody picks: the tie stands, and the match ends ----
const idle = endedRoom({ x: 100, y: 100 });
advance(idle);
setCells(idle, [true, false, false]);
play(idle);
mgr.endTurn(idle, true);
stop(idle);
assert.equal(idle.phase, "reveal");
assert.equal(idle.tiebreak.over, true);
assert.equal(idle.tiebreak.winnerId, null);
advance(idle);
assert.equal(idle.phase, "finished", "no endless tiebreaks");
assert.equal(mgr.matchWinner(idle, mgr.rankedPlayers(idle)), null, "a tie is nobody's win");

// ---- A tied player who left: the other one wins without playing ----
const gone = endedRoom({ m: 100, n: 100, o: 100 });
advance(gone);
setCells(gone, [true, true, false, false]);
play(gone);
mgr.pickCell(gone, "m", { cell: 0, turn: 1 });
mgr.pickCell(gone, "n", { cell: 1, turn: 1 });
stop(gone);
assert.deepEqual(gone.tiebreak.survivors, ["m", "n"]);
mgr.leave("s-n");
advance(gone);
assert.equal(gone.phase, "finished");
assert.equal(gone.tiebreak.winnerId, "m");

console.log("minesTiebreak ok");
