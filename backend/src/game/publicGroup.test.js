import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { cleanMatchRequest, DUELS_OPEN, groupMatchSize, PUBLIC_GAMES, PUBLIC_VARIANT } from "./matchmaking.js";
import { RoomManager } from "./roomManager.js";
import { sampleQuestions } from "../questions/sampleQuestions.js";

// "Partida pública" with a game picked: a public match of that game alone, and a group (game/groups.js) that searches
// for one together: a seat for each of its players in the same room.

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

// It starts with that game alone, in its public way, and nothing after it (it isn't first to two wins).
mgr.startMatch(trivia);
clearTimeout(trivia.timer);
assert.deepEqual(trivia.matchmaking.games, [PUBLIC_VARIANT.opciones]);
assert.equal(trivia.run.items.length, 1);
assert.equal(trivia.run.winsToWin, undefined);
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

// A group searching together: its leader and the others sit in the same room, which needs a seat for each of them. Here
// a stranger was already searching: the four fill it with him.
const waiting = mgr.findMatch(user(20), { kind: "casual", game: "opciones" });
clearTimeout(waiting.matchmaking.botTimer);
assert.equal(mgr.findMatch(user(10), { kind: "casual", game: "opciones" }, [user(11), user(12), user(13)]), waiting);
assert.deepEqual([...waiting.players.keys()].sort(), ["u10", "u11", "u12", "u13", "u20"]);
assert.equal(waiting.hostId, null, "a public room has no host");
assert.ok(waiting.matchmaking.startsAt, "five of five: about to start");
clearTimeout(waiting.matchmaking.timer);

// Not enough seats left in the one searching: a room of their own (bots fill the rest of it).
const pair = mgr.findMatch(user(30), { kind: "casual", game: "opciones" }, [user(31)]);
clearTimeout(pair.matchmaking.botTimer);
assert.notEqual(pair, waiting);
const four = mgr.findMatch(user(40), { kind: "casual", game: "opciones" }, [user(41), user(42), user(43)]);
clearTimeout(four.matchmaking.botTimer);
assert.notEqual(four, pair, "two and four don't fit in five");
assert.equal(mgr.connectedCount(four), 4);
// Another game's queue, or a game that isn't public, never.
assert.throws(() => mgr.findMatch(user(60), { kind: "casual", game: "rey" }, [user(61)]), /solo se puede jugar con tu grupo/);
// A group of six doesn't fit in a public match.
assert.throws(
  () => mgr.findMatch(user(50), { kind: "casual", game: "opciones" }, [51, 52, 53, 54, 55].map(user)),
  /5 como mucho y tu grupo es de 6/
);
// Someone of the group the room blocked keeps the whole group out of it.
pair.blocked = new Set(["u71"]);
const other = mgr.findMatch(user(70), { kind: "casual", game: "opciones" }, [user(71)]);
clearTimeout(other.matchmaking.botTimer);
assert.notEqual(other, pair);
for (const room of [waiting, pair, four, other]) mgr.destroy(room);

// "Restablecer": a game's settings back to a new room's.
const reset = mgr.create({ host: user(30), game: "opciones" });
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
