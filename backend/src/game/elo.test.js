import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { BLOB_ACCOUNT, BLOB_WHITE } from "../db/store.js";
import { botRoster, pickBots } from "./bots.js";
import { addTogether, applyElo, countsTogether, eloDeltas, ELO_START, searchElo, skillFor, TOGETHER_LIMIT } from "./elo.js";
import { RoomManager } from "./roomManager.js";

// Elo by place. A lobby of five at each stretch: fast (500), balanced (3500), slow (6000).
const lobby = (rating) => eloDeltas([1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, rating, points: (6 - n) * 100 })));
const row = (rating) => [1, 2, 3, 4, 5].map((n) => lobby(rating).get(`p${n}`));
assert.deepEqual(row(500), [60, 40, 25, 10, -10], "ganar rápido: top 4 gana poco, el último pierde poco");
assert.deepEqual(row(3500), [35, 15, 0, -15, -35], "equilibrado");
assert.deepEqual(row(6000), [20, 5, -10, -25, -40], "ganar lento: top 2 sube poco, top 3 ya pierde");
assert.ok(row(2400).every((v, i) => v <= row(500)[i] && v >= row(3500)[i]), "it blends between stretches");
assert.equal(eloDeltas([{ id: "a", rating: 500, points: 5 }, { id: "b", rating: 500, points: 5 }]).get("a"), 25, "a draw is the middle of the table");
// Beating stronger rivals is worth more.
const strong = eloDeltas([{ id: "a", rating: 500, points: 9 }, { id: "b", rating: 1500, points: 1 }]).get("a");
assert.ok(strong > 60, "a win over a stronger one gains more");
// Rivals that don't count move nothing.
const none = eloDeltas([{ id: "a", rating: 500, points: 9 }, { id: "b", rating: 500, points: 1 }], () => false);
assert.equal(none.get("a"), 0);

const who = {};
applyElo(who, "opciones", 20);
assert.equal(ELO_START, 500);
assert.equal(who.elo.opciones.rating, ELO_START + 20);
assert.equal(who.elo.opciones.games, 1);
applyElo(who, "opciones", -5000);
assert.equal(who.elo.opciones.rating, 0, "never below the minimum");
assert.equal(searchElo(null, "musica"), ELO_START);

// More than TOGETHER_LIMIT matches together: they stop counting.
const x = { id: "x" };
const y = { id: "y" };
for (let i = 0; i < TOGETHER_LIMIT; i += 1) {
  assert.ok(countsTogether(x, y), `match ${i + 1} counts`);
  addTogether(x, ["y"]);
}
assert.ok(!countsTogether(x, y), "the next one doesn't");
assert.ok(skillFor(500) < skillFor(2500) && skillFor(2500) < skillFor(5000), "stronger elo, stronger bot");

// Bots: guests are white; accounts use white or an account colour; they come close to the asked elo.
for (const b of botRoster().values()) assert.ok(b.isGuest ? b.avatar === BLOB_WHITE : [BLOB_WHITE, ...BLOB_ACCOUNT].includes(b.avatar), "a colour the bot can have");
const low = pickBots(4, { target: 400 });
const high = pickBots(4, { target: 5000 });
const avg = (list) => list.reduce((s, b) => s + b.skill, 0) / list.length;
assert.ok(avg(low) < avg(high), "bots follow the elo asked for");

// Matchmaking by elo, and the games moving it.
const store = { users: {} };
const account = (id, rating) => {
  store.users[id] = { id, name: id, isGuest: false, avatar: "#2F6BFF", stats: { totalScore: 0, bestScore: 0, gamesPlayed: 0, wins: 0, bestStreak: 0, correctAnswers: 0 }, elo: { opciones: { rating, games: 3, best: rating } } };
  return { id, name: id, socketId: `s_${id}` };
};
const mgr = new RoomManager({ catalog: readLocalCatalog(), store });
const novice = account("novice", 700);
const expert = account("expert", 1700);
const roomA = mgr.findMatch(novice, { kind: "casual", game: "opciones" });
clearTimeout(roomA.matchmaking.botTimer);
const roomB = mgr.findMatch(expert, { kind: "casual", game: "opciones" });
clearTimeout(roomB.matchmaking.botTimer);
assert.notEqual(roomA, roomB, "very different elo: another room");
assert.equal(mgr.findMatch(account("peer", 760), { kind: "casual", game: "opciones" }), roomA, "a close elo: the same room");
for (const r of [...mgr.rooms.values()]) mgr.destroy(r);

// A game of a public match moves the account's elo; rivals played too often don't count.
const alice = account("alice", 1000);
const bob = account("bob", 1000);
const room = mgr.findMatch(alice, { kind: "casual", game: "opciones" });
clearTimeout(room.matchmaking.botTimer);
mgr.findMatch(bob, { kind: "casual", game: "opciones" });
const players = [...room.players.values()];
const pts = (p) => (p.id === "alice" ? 800 : 100);
mgr.rateGame(room, "opciones", players.filter((p) => !p.bot), pts);
assert.ok(store.users.alice.elo.opciones.rating > 1000, "the winner gains");
assert.ok(store.users.bob.elo.opciones.rating < 1000, "the loser loses");
for (let i = 0; i < TOGETHER_LIMIT; i += 1) addTogether(store.users.alice, ["bob"]);
const before = store.users.alice.elo.opciones.rating;
mgr.rateGame(room, "opciones", players.filter((p) => !p.bot), pts);
assert.equal(store.users.alice.elo.opciones.rating, before, "after too many matches together it no longer moves");
const discount = mgr.rivalDiscount(players.filter((p) => !p.bot));
assert.equal(discount.get("alice"), 0, "and neither does the rank");
for (const r of [...mgr.rooms.values()]) mgr.destroy(r);
console.log("elo ok");
