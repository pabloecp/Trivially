import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// Campo de minas: a prompt and a 5 × 5 board, played in turns. Everyone still in picks one cell per turn and the
// first to pick a cell keeps it; a right answer scores, a mine (or not picking in time) leaves the player out until
// the next round. The round ends when every right answer is found or nobody is left standing.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "minas" });
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3" });
const host = room.players.get("host-1");
const ana = room.players.get("p-2");
const luis = room.players.get("p-3");

// Lobby: the settings, and how many boards they can draw.
assert.equal(room.config.mines.categories.length, 10);
assert.deepEqual(room.config.mines.styles, ["turnos", "carrera"], "both ways of playing ticked by default");
mgr.updateConfig(room, "host-1", { mines: { styles: [] } });
assert.throws(() => mgr.start(room, "host-1"), /al menos un modo de juego/, "no way of playing ticked: the match can't start");
mgr.updateConfig(room, "host-1", { mines: { styles: ["turnos"] } });
assert.equal(mgr.publicState(room).questionsReady, 300);
assert.equal(mgr.publicState(room).songsReady, undefined);
mgr.updateConfig(room, "host-1", { mines: { categories: [] } });
assert.equal(mgr.publicState(room).questionsReady, 0);
assert.throws(() => mgr.start(room, "host-1"), /al menos una categoría/, "nothing ticked: the match can't start");
assert.throws(() => mgr.updateConfig(room, "p-2", { mines: { rounds: 4 } }), /permisos/);
mgr.updateConfig(room, "host-1", { mines: { categories: ["arte"], difficulties: [] } });
assert.throws(() => mgr.start(room, "host-1"), /al menos una dificultad/, "no difficulty ticked: the match can't start");
mgr.updateConfig(room, "host-1", { mines: { difficulties: ["facil"] } });
assert.equal(mgr.publicState(room).questionsReady, 10);
assert.equal(mgr.publicState(room).questionCounts.categories.musica, 10, "the chips' counts");
assert.deepEqual(mgr.publicState(room).questionCounts.difficulties, { facil: 10, media: 10, dificil: 10 });
mgr.updateConfig(room, "host-1", {
  mines: { categories: ["ciencia", "historia", "arte"], difficulties: ["facil", "media", "dificil"], rounds: 3, turnMs: 8000 },
});

mgr.start(room, "host-1");
stop(room);
assert.equal(room.tracks.length, 3);
assert.equal(room.totalRounds, 3);
assert.equal(room.tracks[0].cells.length, 25);
assert.ok(room.tracks.every((t) => t.style === "turnos"));

// The rounds below use a known board: the first `hits` cells are right, the rest are mines.
function known(r, hits = 4) {
  const cells = Array.from({ length: 25 }, (_, i) => ({ text: `Casilla ${i}`, correct: i < hits, by: null, at: null, turn: null }));
  const style = r.tracks[r.currentRound]?.style || "turnos";
  r.tracks[r.currentRound] = { id: `t${r.currentRound}`, style, prompt: "Tablero de prueba", category: "ciencia", difficulty: "media", cells };
}
const next = () => {
  mgr.advance(room);
  stop(room);
};
const cellsOf = (state) => state.question.cells;

// ---- Countdown: the prompt, but no cells yet ----
known(room);
let pub = mgr.publicState(room, "p-2");
assert.equal(pub.phase, "countdown");
assert.equal(pub.question.prompt, "Tablero de prueba");
assert.equal(pub.question.category, "Ciencia");
assert.equal(pub.question.cells, null);
assert.equal(pub.question.total, 4, "how many right answers the board has");
assert.throws(() => mgr.pickCell(room, "p-2", { cell: 0, turn: 1 }), /No se aceptan/);

// ---- Turn 1 ----
mgr.beginPlaying(room);
stop(room);
assert.equal(room.turn, 1);
assert.equal(room.phaseEndsAt - room.phaseStartedAt, 13000, "the first turn has 5 s more to read the board");
pub = mgr.publicState(room, "p-2");
assert.equal(pub.question.turn, 1);
assert.equal(cellsOf(pub).length, 25);
assert.equal(cellsOf(pub)[0].text, "Casilla 0");
assert.ok(cellsOf(pub).every((c) => c.correct === null && c.by === null), "nothing says which cells are right");
assert.throws(() => mgr.submitAnswer(room, "p-2", "Casilla 0"), /casilla/);
assert.throws(() => mgr.skip(room, "p-2"), /saltar/);
assert.throws(() => mgr.pickCell(room, "p-2", { cell: 25, turn: 1 }), /no existe/);
assert.throws(() => mgr.pickCell(room, "p-2", { cell: "x", turn: 1 }), /no existe/);

// Ana finds a right answer: it scores at once and everyone sees it's hers.
assert.equal(mgr.pickCell(room, "p-2", { cell: 0, turn: 1 }), true);
assert.equal(ana.score, 100);
assert.equal(ana.correct, 1);
assert.equal(ana.streak, 1);
pub = mgr.publicState(room);
assert.equal(cellsOf(pub)[0].by, "p-2");
assert.equal(cellsOf(pub)[0].correct, true);
assert.equal(cellsOf(pub)[0].turn, 1);
assert.ok(cellsOf(pub).slice(1).every((c) => c.correct === null));
assert.equal(pub.question.found, 1);
assert.equal(pub.players.find((p) => p.id === "p-2").answered, true);
assert.equal(pub.players.find((p) => p.id === "host-1").answered, false);
assert.throws(() => mgr.pickCell(room, "p-2", { cell: 1, turn: 1 }), /Ya elegiste/, "one cell per turn");
// The first to pick a cell keeps it.
assert.throws(() => mgr.pickCell(room, "host-1", { cell: 0, turn: 1 }), /Ana ya eligió/);
// The host steps on a mine: out for the rest of the round, with the points they had.
assert.equal(mgr.pickCell(room, "host-1", { cell: 10, turn: 1 }), false);
assert.equal(host.minefield.out, "mina");
assert.equal(host.score, 0);
pub = mgr.publicState(room);
assert.equal(cellsOf(pub)[10].correct, false);
assert.equal(pub.players.find((p) => p.id === "host-1").out, "mina");
assert.throws(() => mgr.pickCell(room, "host-1", { cell: 11, turn: 1 }), /fuera/);
assert.equal(room.turn, 1, "Luis hasn't picked yet");
// Luis picks too: everyone still in has picked, so the next turn starts.
mgr.pickCell(room, "p-3", { cell: 1, turn: 1 });
stop(room);
assert.equal(room.phase, "playing");
assert.equal(room.turn, 2);
assert.equal(room.phaseEndsAt - room.phaseStartedAt, 8000, "the seconds of a turn");
assert.equal(mgr.publicState(room).question.turn, 2);
assert.equal(mgr.publicState(room).players.find((p) => p.id === "p-2").answered, false, "a new turn");

// ---- Turn 2 ----
assert.throws(() => mgr.pickCell(room, "p-2", { cell: 2, turn: 1 }), /terminó/, "a tap meant for the last turn");
mgr.pickCell(room, "p-2", { cell: 2, turn: 2 });
assert.equal(ana.score, 300, "the second hit of the round is worth 200");
assert.equal(room.turn, 2, "Luis still has time");
// Luis doesn't pick in time: he's out.
mgr.endTurn(room, true);
stop(room);
assert.equal(luis.minefield.out, "tiempo");
assert.equal(luis.streak, 0);
assert.equal(room.turn, 3);

// ---- Turn 3: Ana finds the last right answer, and the round ends there ----
mgr.pickCell(room, "p-2", { cell: 3, turn: 3 });
stop(room);
assert.equal(room.phase, "reveal");
assert.equal(room.phaseEndsAt - room.phaseStartedAt, 6000, "the whole board stays on screen");
assert.equal(ana.score, 600);
assert.equal(ana.streak, 3);
assert.equal(ana.lastPoints, 600);
assert.equal(ana.lastAnswer.text, "3 aciertos");
assert.equal(ana.lastAnswer.correct, true);
assert.equal(host.lastAnswer.text, "Mina a la primera");
assert.equal(host.lastAnswer.correct, false);
assert.equal(host.lastPoints, 0);
assert.equal(luis.lastAnswer.text, "1 acierto, sin tiempo");
assert.equal(luis.lastPoints, 100);
pub = mgr.publicState(room);
assert.ok(cellsOf(pub).every((c) => typeof c.correct === "boolean"), "the reveal shows every cell");
assert.equal(pub.question.turn, null);
assert.equal(pub.question.found, 4);
assert.equal(pub.players.find((p) => p.id === "p-2").lastAnswer.text, "3 aciertos");

// ---- Round 2: everyone steps on a mine ----
next();
known(room);
assert.equal(room.phase, "countdown");
assert.ok([...room.players.values()].every((p) => p.minefield && !p.minefield.out && p.minefield.hits === 0), "a fresh round");
mgr.beginPlaying(room);
stop(room);
assert.equal(room.turn, 1);
// Luis drops out mid-turn: the turn doesn't wait for him.
mgr.disconnect("s3");
mgr.pickCell(room, "host-1", { cell: 0, turn: 1 });
mgr.pickCell(room, "p-2", { cell: 1, turn: 1 });
stop(room);
assert.equal(room.turn, 2);
// He comes back and plays on.
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3b" });
mgr.pickCell(room, "p-3", { cell: 20, turn: 2 });
mgr.pickCell(room, "host-1", { cell: 21, turn: 2 });
assert.equal(room.phase, "playing", "Ana is still standing");
mgr.pickCell(room, "p-2", { cell: 22, turn: 2 });
stop(room);
assert.equal(room.phase, "reveal", "nobody left standing ends the round");
assert.equal(host.lastAnswer.text, "1 acierto, luego una mina");
assert.equal(luis.lastAnswer.text, "Mina a la primera");
assert.equal(host.streak, 0);

// ---- Round 3 (the last): a player who arrives mid-match watches it, and the turns don't wait for them ----
next();
known(room, 2);
mgr.beginPlaying(room);
stop(room);
mgr.addPlayer(room, { id: "p-4", name: "Eva", socketId: "s4" });
assert.equal(room.players.get("p-4").spectator, true);
assert.throws(() => mgr.pickCell(room, "p-4", { cell: 0, turn: 1 }), /viendo la partida/);
mgr.pickCell(room, "host-1", { cell: 0, turn: 1 });
mgr.pickCell(room, "p-2", { cell: 5, turn: 1 });
mgr.pickCell(room, "p-3", { cell: 1, turn: 1 });
stop(room);
assert.equal(room.phase, "reveal", "both right answers found");
assert.equal(room.players.get("p-4").lastAnswer, null, "Eva only watched");
next();
assert.equal(room.phase, "finished", "no tiebreak in Campo de minas");
const results = mgr.publicState(room).results;
assert.deepEqual(results.map((r) => r.id).slice(0, 3), ["p-2", "host-1", "p-3"]);
assert.equal(results[0].score, 700);
assert.equal(results[0].correct, 4);

// Going back to the lobby clears the round.
mgr.restart(room, "host-1");
assert.equal(room.turn, 0);
assert.ok([...room.players.values()].every((p) => p.minefield == null));

// The room can move to and from Campo de minas.
mgr.setGame(room, "host-1", "historia");
assert.equal(room.game, "historia");
assert.equal(mgr.publicState(room).players[0].out, undefined, "only Campo de minas sends who is out");
mgr.setGame(room, "host-1", "minas");
assert.equal(room.game, "minas");
assert.equal(room.phase, "lobby");

// A kicked player isn't waited for either.
const r2 = mgr.create({ host: { id: "a", name: "A", socketId: "ka" }, mode: "multi", game: "minas" });
mgr.addPlayer(r2, { id: "b", name: "B", socketId: "kb" });
mgr.updateConfig(r2, "a", { mines: { styles: ["turnos"] } });
mgr.start(r2, "a");
stop(r2);
known(r2);
mgr.beginPlaying(r2);
stop(r2);
mgr.pickCell(r2, "a", { cell: 0, turn: 1 });
assert.equal(r2.turn, 1);
mgr.kick(r2, "a", "b");
stop(r2);
assert.equal(r2.turn, 2, "the turn moved on without B");
stop(r2);

// Paused: nobody can pick, and a player leaving doesn't move the turn on until "Reanudar".
const r3 = mgr.create({ host: { id: "h", name: "H", socketId: "ph" }, mode: "multi", game: "minas" });
mgr.addPlayer(r3, { id: "g", name: "G", socketId: "pg" });
mgr.addPlayer(r3, { id: "k", name: "K", socketId: "pk" });
mgr.updateConfig(r3, "h", { mines: { styles: ["turnos"] } });
mgr.start(r3, "h");
stop(r3);
known(r3);
mgr.beginPlaying(r3);
stop(r3);
mgr.pickCell(r3, "h", { cell: 0, turn: 1 });
mgr.pickCell(r3, "g", { cell: 1, turn: 1 });
mgr.pause(r3, "h");
assert.throws(() => mgr.pickCell(r3, "k", { cell: 2, turn: 1 }), /pausa/);
mgr.kick(r3, "h", "k");
assert.equal(r3.turn, 1, "paused: the turn waits");
assert.ok(r3.paused, "still paused");
mgr.resume(r3, "h");
stop(r3);
assert.equal(r3.turn, 2, "on Reanudar the turn moves on without K");
assert.equal(r3.paused, null);
stop(r3);

// ---- A race ("carrera"): no turns, each player picks as many cells as they like until they step on a mine ----
const race = mgr.create({ host: { id: "c1", name: "Carla", socketId: "c1" }, mode: "multi", game: "minas" });
mgr.addPlayer(race, { id: "c2", name: "Dani", socketId: "c2" });
mgr.addPlayer(race, { id: "c3", name: "Eva", socketId: "c3" });
// An older client still sends a single `style`.
mgr.updateConfig(race, "c1", { mines: { style: "carrera", roundMs: 60000, rounds: 3 } });
assert.deepEqual(race.config.mines.styles, ["carrera"]);
mgr.start(race, "c1");
stop(race);
known(race, 5);
mgr.beginPlaying(race);
stop(race);
const [carla, dani, eva] = ["c1", "c2", "c3"].map((id) => race.players.get(id));
assert.equal(race.turn, 1, "a race is one turn: the whole round");
assert.equal(race.phaseEndsAt - race.phaseStartedAt, 60000, "the round's seconds, with no extra to read");
// Carla picks three right answers in a row: no waiting for the others.
assert.equal(mgr.pickCell(race, "c1", { cell: 0, turn: 1 }), true);
assert.equal(mgr.pickCell(race, "c1", { cell: 1, turn: 1 }), true);
assert.equal(mgr.pickCell(race, "c1", { cell: 2, turn: 1 }), true);
assert.equal(carla.score, 600, "100, 200 and 300");
pub = mgr.publicState(race);
assert.equal(pub.players.find((p) => p.id === "c1").answered, false, "nobody waits in a race");
assert.equal(pub.players.find((p) => p.id === "c1").hits, 3);
assert.equal(pub.players.find((p) => p.id === "c2").hits, 0);
// The faster one keeps a cell: Dani can't take Carla's.
assert.throws(() => mgr.pickCell(race, "c2", { cell: 1, turn: 1 }), /Carla ya eligió/);
mgr.pickCell(race, "c2", { cell: 3, turn: 1 });
// Eva steps on a mine: out, while the others play on.
assert.equal(mgr.pickCell(race, "c3", { cell: 20, turn: 1 }), false);
assert.equal(eva.minefield.out, "mina");
assert.throws(() => mgr.pickCell(race, "c3", { cell: 4, turn: 1 }), /fuera/);
assert.equal(race.phase, "playing");
// The last right answer ends the round.
mgr.pickCell(race, "c1", { cell: 4, turn: 1 });
stop(race);
assert.equal(race.phase, "reveal");
assert.equal(carla.lastAnswer.text, "4 aciertos");
assert.equal(carla.lastPoints, 1000);
assert.equal(dani.lastAnswer.text, "1 acierto");
assert.equal(eva.lastAnswer.text, "Mina a la primera");

// Round 2: the time runs out with players still standing. They survived it: nobody is out for not picking.
mgr.advance(race);
stop(race);
known(race, 5);
mgr.beginPlaying(race);
stop(race);
mgr.pickCell(race, "c2", { cell: 0, turn: 1 });
mgr.pickCell(race, "c3", { cell: 21, turn: 1 });
mgr.endTurn(race, true);
stop(race);
assert.equal(race.phase, "reveal");
assert.equal(carla.minefield.out, null);
assert.equal(carla.lastAnswer.text, "Sin aciertos");
assert.equal(dani.lastAnswer.text, "1 acierto");
assert.equal(dani.lastAnswer.out, null);

// Round 3: when everyone still connected is out, the round ends too; a dropped player isn't waited for.
mgr.advance(race);
stop(race);
known(race, 5);
mgr.beginPlaying(race);
stop(race);
mgr.disconnect("c3");
mgr.pickCell(race, "c1", { cell: 22, turn: 1 });
assert.equal(race.phase, "playing", "Dani is still standing");
mgr.pickCell(race, "c2", { cell: 23, turn: 1 });
stop(race);
assert.equal(race.phase, "reveal", "nobody left standing");
// Both ways ticked: the rounds share them evenly, and each round is played its own way.
const mix = mgr.create({ host: { id: "m1", name: "M", socketId: "m1" }, mode: "multi", game: "minas" });
mgr.updateConfig(mix, "m1", { mines: { styles: ["turnos", "carrera"], rounds: 4, turnMs: 5000, roundMs: 30000 } });
mgr.start(mix, "m1");
stop(mix);
assert.deepEqual(mix.tracks.map((t) => t.style).sort(), ["carrera", "carrera", "turnos", "turnos"]);
mix.currentRound = mix.tracks.findIndex((t) => t.style === "carrera");
assert.equal(mgr.roundMs(mix), 30000, "a race round lasts the round's seconds");
assert.equal(mgr.publicState(mix).question.style, "carrera");
mix.currentRound = mix.tracks.findIndex((t) => t.style === "turnos");
assert.equal(mgr.roundMs(mix), 5000, "a round by turns lasts the turn's seconds");

console.log("minesRoom.test ok");
