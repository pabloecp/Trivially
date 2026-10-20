import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { REY_PICK_MS, REY_POINTS, mergeReyConfig, pickReyRounds, reyPool } from "./rey.js";
import { RoomManager } from "./roomManager.js";

// Rey de la colina: the king picks one of three questions, the others write the answer; the first right one takes
// the crown (the round ends at once), and when nobody gets it the king keeps the crown and scores its points.
// (Without a question bank, the pool is the capitals of geo/countries.js.)
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);

// ---- The settings and the draw ----
assert.deepEqual(mergeReyConfig({}, { rounds: 99, roundMs: 1000 }), { ...mergeReyConfig({}), rounds: 20, roundMs: 15000 });
const pool = reyPool(mgr.quizQuestions);
const rounds = pickReyRounds(pool, mergeReyConfig({}, { rounds: 5, categories: ["geografia"] }));
assert.equal(rounds.length, 5);
for (const round of rounds) {
  assert.equal(round.offers.length, 3);
  assert.deepEqual(round.offers.map((o) => o.difficulty), ["facil", "media", "dificil"], "one of each, easiest first");
  assert.equal(new Set(round.offers.map((o) => o.id)).size, 3);
  assert.equal(round.offers[2].points, REY_POINTS.dificil);
}
const oneLevel = pickReyRounds(pool, mergeReyConfig({}, { rounds: 5, categories: ["geografia"], difficulties: ["media"] }));
assert.ok(oneLevel.every((r) => r.offers.length === 3 && r.offers.every((o) => o.difficulty === "media")));
assert.deepEqual(pickReyRounds(pool, mergeReyConfig({}, { difficulties: [] })), []);

// ---- The room ----
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "rey" });
assert.throws(() => mgr.start(room, "host-1"), /al menos 2 jugadores|hacen falta/);
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3" });
mgr.updateConfig(room, "host-1", { rey: { categories: ["geografia"], rounds: 5 } });
assert.ok(mgr.publicState(room).questionCounts.categories.geografia > 100);
mgr.updateConfig(room, "host-1", { rey: { difficulties: [] } });
assert.throws(() => mgr.start(room, "host-1"), /al menos una dificultad/);
mgr.updateConfig(room, "host-1", { rey: { difficulties: ["facil", "media", "dificil"] } });

mgr.start(room, "host-1");
stop(room);
assert.equal(room.phase, "countdown");
assert.equal(room.totalRounds, 5);
const first = room.king;
assert.ok(["host-1", "p-2", "p-3"].includes(first), "a king is drawn");
assert.equal(room.phaseEndsAt - room.phaseStartedAt, REY_PICK_MS, "the king's turn to pick");

// During the king's turn everyone sees the three offers, but never their answers.
let pub = mgr.publicState(room, "p-2");
assert.equal(pub.rey.kingId, first);
assert.equal(pub.rey.offers.length, 3);
assert.ok(pub.rey.offers.every((o) => o.text && !("answer" in o)));
assert.equal(JSON.stringify(pub).includes(room.tracks[0].offers[0].answer), false, "no answer in the state");
assert.equal(pub.question, null);
const other = ["host-1", "p-2", "p-3"].find((id) => id !== first);
assert.throws(() => mgr.reyPick(room, other, 0), /Solo el rey/);
assert.throws(() => mgr.reyPick(room, first, 7), /Elige una de las preguntas/);
assert.throws(() => mgr.submitAnswer(room, other, "París"), /No se aceptan|aún no ha elegido/);

// ---- Round 1: nobody gets it, the king keeps the crown and scores the hard question's points ----
const offers = room.tracks[0].offers;
mgr.reyPick(room, first, 2);
stop(room);
assert.equal(room.phase, "playing");
assert.equal(room.tracks[0].id, offers[2].id, "the picked offer is the round");
assert.equal(room.tracks[0].kingId, first);
pub = mgr.publicState(room, other);
assert.equal(pub.question.text, offers[2].text);
assert.equal(pub.question.answer, null, "no answer while playing");
assert.equal(pub.rey.offers, null);
assert.throws(() => mgr.reyPick(room, first, 0), /Ahora no se elige/);
assert.throws(() => mgr.submitAnswer(room, first, "x"), /Eres el rey/);
const challengers = ["host-1", "p-2", "p-3"].filter((id) => id !== first);
mgr.submitAnswer(room, challengers[0], "respuesta equivocada");
assert.equal(room.phase, "playing", "one challenger still to answer");
mgr.submitAnswer(room, challengers[1], "otra equivocada");
stop(room);
assert.equal(room.phase, "reveal", "every challenger failed: the round ends early");
assert.equal(room.king, first);
assert.equal(room.players.get(first).score, REY_POINTS.dificil);
pub = mgr.publicState(room);
assert.equal(pub.rey.survived, true);
assert.equal(pub.rey.points, REY_POINTS.dificil);
assert.equal(pub.rey.dethronedBy, null);
assert.equal(pub.question.answer, offers[2].answer);

// ---- Round 2: a right answer takes the crown at once ----
mgr.advance(room);
stop(room);
assert.equal(room.phase, "countdown");
const offers2 = room.tracks[1].offers;
mgr.reyPick(room, first, 0);
stop(room);
const challenger = challengers[0];
mgr.submitAnswer(room, challenger, offers2[0].answer);
stop(room);
assert.equal(room.phase, "reveal", "the first right answer ends the round");
assert.equal(room.king, challenger, "and takes the crown");
assert.equal(room.players.get(first).score, REY_POINTS.dificil, "the old king scores nothing");
assert.equal(room.players.get(challenger).score, 0, "the new king has no points yet");
pub = mgr.publicState(room);
assert.equal(pub.rey.dethronedBy, challenger);
assert.equal(pub.rey.roundKingId, first);
assert.equal(pub.rey.kingId, challenger);

// ---- Round 3: the new king; a time-out picks a question for them, and a pause... ----
mgr.advance(room);
stop(room);
assert.equal(room.king, challenger);
room.timer = null;
mgr.reyPick(room, null, null);
stop(room);
assert.equal(room.phase, "playing", "no pick: one is picked for the king");
assert.equal(room.tracks[2].kingId, challenger);
// Nobody answers: the time runs out and the king keeps the crown.
mgr.beginReveal(room);
stop(room);
assert.equal(room.king, challenger);
assert.ok(room.players.get(challenger).score >= 1);

// ---- A king who leaves: a connected player is drawn ----
mgr.disconnect(room.players.get(challenger).socketId);
mgr.advance(room);
stop(room);
assert.notEqual(room.king, challenger, "a connected player is drawn");
assert.ok(room.players.get(room.king).connected);
assert.equal(room.phaseEndsAt - room.phaseStartedAt, REY_PICK_MS, "the new king gets their turn to pick");

// ---- Back to the lobby: no king ----
mgr.resetMatch(room);
assert.equal(room.king, null);
console.log("reyRoom ok");
