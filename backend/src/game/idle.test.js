import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { IDLE_ROUNDS, RoomManager } from "./roomManager.js";

// A player who doesn't answer in IDLE_ROUNDS rounds in a row stops being waited for: once everyone else answered, the
// round ends without them. Answering again counts them in once more.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);
const room = mgr.create({ host: { id: "h", name: "Host", socketId: "s1" }, game: "opciones" });
mgr.addPlayer(room, { id: "a", name: "Ana", socketId: "s2" });
mgr.updateConfig(room, "h", { quiz: { rounds: 10 } });
mgr.start(room, "h");
stop(room);
// Every round: four options, the right one the second.
room.tracks = room.tracks.map((t, i) => ({ id: `q${i}`, type: "choice", text: `Pregunta ${i}`, options: ["A", "B", "C", "D"], answer: 1 }));

const play = (answers) => {
  mgr.beginPlaying(room);
  stop(room);
  for (const id of answers) mgr.submitAnswer(room, id, 1);
  stop(room);
  const endedEarly = room.phase === "reveal";
  if (room.phase === "playing") mgr.beginReveal(room);
  stop(room);
  mgr.advance(room);
  stop(room);
  return endedEarly;
};

assert.equal(IDLE_ROUNDS, 3);
// Ana doesn't answer: the host's answer doesn't end the round while she still counts.
assert.equal(play(["h"]), false, "round 1 waits for Ana");
assert.equal(play(["h"]), false, "round 2 waits for Ana");
assert.equal(play(["h"]), false, "round 3 waits for Ana");
assert.equal(room.players.get("a").idle, true, "three rounds without answering: inactive");
assert.equal(mgr.publicState(room).players.find((p) => p.id === "a").idle, true, "everyone sees it");

// From now on the host's answer ends the round at once.
assert.equal(play(["h"]), true, "round 4 doesn't wait for Ana");

// Ana answers again: she counts again (and the round, with both answered, ends early as always).
mgr.beginPlaying(room);
stop(room);
mgr.submitAnswer(room, "a", 1);
assert.equal(room.players.get("a").idle, false, "answering counts her in again");
assert.equal(room.phase, "playing", "the host hasn't answered yet");
mgr.submitAnswer(room, "h", 1);
stop(room);
assert.equal(room.phase, "reveal");
mgr.advance(room);
stop(room);
assert.equal(play(["h"]), false, "round 6 waits for Ana again");

// A new match starts with nobody inactive.
mgr.finish(room);
mgr.replay(room, "h");
stop(room);
assert.equal(room.players.get("a").idle, false);
assert.equal(room.players.get("a").idleRounds, 0);
mgr.destroy(room);

console.log("idle.test ok");
