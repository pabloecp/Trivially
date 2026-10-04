import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const host = { id: "host-1", name: "Host", socketId: "s1" };
const room = mgr.create({ host, mode: "multi", game: "mundo" });
assert.equal(room.game, "mundo");
assert.ok(mgr.publicState(room).songsReady >= 25, "the lobby reports how many questions are ready");

mgr.updateConfig(room, "host-1", { rounds: 5 });
mgr.start(room, "host-1");
assert.equal(room.tracks.length, 5);
assert.equal(new Set(room.tracks.map((q) => q.id)).size, 5, "no repeated questions");

// Countdown and playing show the prompt, never the answer.
let pub = mgr.publicState(room, "host-1");
assert.equal(pub.phase, "countdown");
assert.ok(pub.question.prompt);
assert.equal(pub.audio, null);
assert.equal(pub.reveal, null);
mgr.beginPlaying(room);
pub = mgr.publicState(room, "host-1");
assert.equal(pub.searchCatalog, undefined);
const secret = room.tracks[0];
assert.ok(!JSON.stringify(pub).includes(secret.answer), "the answer is not sent while playing");

// A small typo still counts; points are given and the room goes to the reveal (the host is alone).
mgr.submitAnswer(room, "host-1", secret.answer.slice(0, -1) + (secret.answer.endsWith("a") ? "o" : "a"));
const me = room.players.get("host-1");
if (me.lastAnswer.correct) assert.ok(me.score > 0);
assert.equal(room.phase, "reveal");
pub = mgr.publicState(room, "host-1");
assert.equal(pub.reveal.answer, secret.answer);
clearTimeout(room.timer);

// An exact answer is correct and earns points; a wrong one doesn't.
mgr.advance(room);
mgr.beginPlaying(room);
const second = room.tracks[1];
mgr.submitAnswer(room, "host-1", second.answer);
assert.equal(me.lastAnswer.correct, true);
assert.ok(me.lastPoints > 0);
assert.equal(me.correct >= 1, true);
clearTimeout(room.timer);

mgr.advance(room);
mgr.beginPlaying(room);
mgr.submitAnswer(room, "host-1", "respuesta absurda 123");
assert.equal(me.lastAnswer.correct, false);
assert.equal(me.lastPoints, 0);
clearTimeout(room.timer);

// Music still works and unknown games are refused.
assert.throws(() => mgr.setGame(room, "host-1", "inexistente"), /no está disponible/);
mgr.setGame(room, "host-1", "musica");
assert.equal(room.game, "musica");
console.log("questionRoom.test ok");
