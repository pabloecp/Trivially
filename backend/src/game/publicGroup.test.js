import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { cleanMatchRequest, DUELS_OPEN, groupMatchSize, PUBLIC_GAMES, PUBLIC_VARIANT } from "./matchmaking.js";
import { RoomManager } from "./roomManager.js";
import { sampleQuestions } from "../questions/sampleQuestions.js";

// "Partida pública" with a game picked: a public match of that game alone, and a group (a private room) that
// searches for one together and goes back to its own room afterwards.

// A game's queue: that game only, for five unless said otherwise ("Uno contra Uno" isn't offered: DUELS_OPEN); Rey de
// la colina and Farsante aren't public. A group searching together is for five too, whatever its size.
assert.equal(DUELS_OPEN, false);
assert.deepEqual(cleanMatchRequest({ kind: "casual", game: "opciones" }), { kind: "casual", rounds: 5, size: 5, game: "opciones" });
assert.throws(() => cleanMatchRequest({ kind: "casual", game: "farsante" }), /solo se puede jugar con tu grupo/);
assert.throws(() => cleanMatchRequest({ kind: "casual", game: "rey" }), /solo se puede jugar con tu grupo/);
assert.equal(groupMatchSize(1), 5);
assert.equal(groupMatchSize(2), 5);
assert.equal(groupMatchSize(9), 5);

const store = { users: {} };
const mgr = new RoomManager({ catalog: readLocalCatalog(), store, questions: sampleQuestions() });
const user = (i) => ({ id: `u${i}`, name: `Jugador ${i}`, socketId: `s${i}` });
const kicked = [];
mgr.onKicked = (socketId, info) => kicked.push({ socketId, ...info });

// Players looking for Trivia share a room; one looking for Rango doesn't go in it, nor one with the roulette.
const trivia = mgr.findMatch(user(1), { kind: "casual", game: "opciones" });
clearTimeout(trivia.matchmaking.botTimer);
assert.equal(trivia.matchmaking.game, "opciones");
assert.equal(trivia.matchmaking.size, 5);
const rango = mgr.findMatch(user(2), { kind: "casual", game: "historia" });
clearTimeout(rango.matchmaking.botTimer);
assert.notEqual(rango, trivia, "another game: another room");
const roulette = mgr.findMatch(user(3), { kind: "casual", size: 2 });
clearTimeout(roulette.matchmaking.botTimer);
assert.notEqual(roulette, trivia, "the roulette's rooms are apart");
assert.equal(mgr.findMatch(user(4), { kind: "casual", game: "opciones" }), trivia, "same game: same room");
assert.ok(!trivia.matchmaking.startsAt, "two of five: still searching");
while (mgr.connectedCount(trivia) < trivia.matchmaking.size) mgr.addBot(trivia);
mgr.checkMatchFull(trivia);
assert.ok(trivia.matchmaking.startsAt, "five of five: about to start");
clearTimeout(trivia.matchmaking.timer);
assert.equal(mgr.publicState(trivia).matchmaking.game, "opciones");

// It starts with that game alone, in its public way, and no decider.
mgr.startMatch(trivia);
clearTimeout(trivia.timer);
assert.deepEqual(trivia.matchmaking.games, [PUBLIC_VARIANT.opciones]);
assert.equal(trivia.run.items.length, 1);
assert.equal(trivia.run.decider, null);
assert.equal(trivia.game, "opciones");
assert.equal(trivia.phase, "intro");
mgr.destroy(trivia);

// Every public game can be played by name.
for (const game of PUBLIC_GAMES) {
  const room = mgr.findMatch(user(`${game}-1`), { kind: "casual", game });
  clearTimeout(room.matchmaking.botTimer);
  const item = mgr.publicGameItem(room, "casual", game);
  assert.equal(item.game, game, `${game} se puede jugar en público`);
  mgr.destroy(room);
}

// A group: the host picks who plays ("grupo" by default) and only the host can.
const group = mgr.create({ host: user(10), game: "opciones" });
mgr.addPlayer(group, user(11));
assert.equal(group.audience, "grupo");
assert.throws(() => mgr.setAudience(group, "u11", "publica"), /Solo el anfitrión/);
mgr.setAudience(group, "u10", "publica");
assert.equal(mgr.publicState(group).audience, "publica");
assert.throws(() => mgr.setAudience(group, "u10", "todos"), /no existe/);

// Rey de la colina can't be searched for in public.
mgr.setGame(group, "u10", "rey");
assert.throws(() => mgr.findPublicForGroup(group, "u10"), /solo se puede jugar con tu grupo/);
mgr.setGame(group, "u10", "opciones");
mgr.updateConfig(group, "u10", { quiz: { rounds: 10 } });
assert.throws(() => mgr.findPublicForGroup(group, "u11"), /Solo el anfitrión/);

// The group searches together: its room opens to Trivia's queue, for five.
mgr.findPublicForGroup(group, "u10");
clearTimeout(group.matchmaking.botTimer);
assert.equal(group.hostId, null, "a public room has no host");
assert.equal(group.matchmaking.size, 5);
assert.deepEqual(mgr.publicState(group).matchmaking.group, { hostId: "u10", members: ["u10", "u11"] });
assert.throws(() => mgr.findToJoin(group.code, "u99"), /partida pública/, "nobody joins it by code meanwhile");

// Cancelling gives the room back to the group as it was.
assert.throws(() => mgr.closePublic(group, "u99"), /Solo los del grupo/);
mgr.closePublic(group, "u11");
assert.equal(group.matchmaking, null);
assert.equal(group.hostId, "u10", "its host again");
assert.equal(group.config.quiz.rounds, 10, "its settings kept");
assert.equal(group.game, "opciones");

// Searching again: a stranger looking for Trivia sits in the group's room, and bots fill it.
mgr.findPublicForGroup(group, "u10");
clearTimeout(group.matchmaking.botTimer);
assert.equal(mgr.findMatch(user(20), { kind: "casual", game: "opciones" }), group, "a stranger joins the group's search");
while (mgr.connectedCount(group) < group.matchmaking.size) mgr.addBot(group);
mgr.checkMatchFull(group);
assert.ok(group.matchmaking.startsAt, "full");
clearTimeout(group.matchmaking.timer);
mgr.startMatch(group);
clearTimeout(group.timer);
assert.equal(group.run.items[0].config.rounds, 5, "the public match's settings, not the group's");
assert.throws(() => mgr.closePublic(group, "u10"), /Espera a que termine/);

// Over: "Volver al grupo" sends the stranger home and the group is in its own room again, with its settings.
mgr.finish(group);
assert.equal(group.phase, "finished");
mgr.closePublic(group, "u10");
assert.deepEqual([...group.players.keys()].sort(), ["u10", "u11"]);
assert.deepEqual(kicked, [{ socketId: "s20", code: group.code, reason: "grupo" }]);
assert.equal(group.phase, "lobby");
assert.equal(group.game, "opciones");
assert.equal(group.config.quiz.rounds, 10);
assert.equal(group.hostId, "u10");
assert.equal(group.run, null);

// The group left and a stranger stayed: an ordinary public room from then on.
mgr.findPublicForGroup(group, "u10");
clearTimeout(group.matchmaking.botTimer);
mgr.findMatch(user(21), { kind: "casual", game: "opciones" });
clearTimeout(group.matchmaking.timer);
group.matchmaking.startsAt = null;
mgr.leave("s10");
mgr.leave("s11");
assert.equal(group.matchmaking.group, null);

// "Restablecer": a game's settings back to a new room's.
const reset = mgr.create({ host: user(30), game: "opciones", audience: "publica" });
assert.equal(reset.audience, "publica");
assert.equal(mgr.publicState(reset).settingsChanged, false);
mgr.updateConfig(reset, "u30", { quiz: { rounds: 15, roundMs: 25000 } });
assert.equal(mgr.publicState(reset).settingsChanged, true);
mgr.updateConfig(reset, "u30", { reset: "opciones" });
assert.equal(reset.config.quiz.rounds, 5);
assert.equal(mgr.publicState(reset).settingsChanged, false);
mgr.setGame(reset, "u30", "musica");
mgr.updateConfig(reset, "u30", { rounds: 20 });
mgr.updateConfig(reset, "u30", { reset: "musica" });
assert.equal(reset.config.rounds, 5);

for (const room of [...mgr.rooms.values()]) mgr.destroy(room);
console.log("publicGroup ok");
