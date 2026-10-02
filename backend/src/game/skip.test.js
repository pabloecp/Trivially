import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const host = { id: "host-1", name: "Host", socketId: "s1" };
const guest = { id: "guest-2", name: "Guest", socketId: "s2" };
const room = mgr.create({ host, mode: "multi", game: "musica" });
mgr.addPlayer(room, guest);
mgr.start(room, "host-1");

// "Saltar" only works while the song is playing.
assert.throws(() => mgr.skip(room, "guest-2"), /No se aceptan respuestas/);
mgr.beginPlaying(room);

// Skipping counts as an answer with no points and breaks the streak.
room.players.get("guest-2").streak = 3;
mgr.skip(room, "guest-2");
const skipped = room.players.get("guest-2");
assert.equal(skipped.lastAnswer.skipped, true);
assert.equal(skipped.lastAnswer.correct, false);
assert.equal(skipped.lastPoints, 0);
assert.equal(skipped.streak, 0);
assert.equal(room.phase, "playing", "the host hasn't answered yet");

// Skipping twice changes nothing.
mgr.skip(room, "guest-2");
assert.equal(skipped.score, 0);

// Once everyone has answered or skipped, the song is revealed right away.
mgr.skip(room, "host-1");
assert.equal(room.phase, "reveal");
clearTimeout(room.timer);

// Playing alone, skipping reveals the song straight away instead of waiting for other players.
const solo = mgr.create({ host: { id: "solo-1", name: "Solo", socketId: "s3" }, mode: "multi", game: "musica" });
mgr.start(solo, "solo-1");
mgr.beginPlaying(solo);
mgr.skip(solo, "solo-1");
assert.equal(solo.phase, "reveal");
clearTimeout(solo.timer);

console.log("skip.test ok");
