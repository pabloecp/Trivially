import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// An owner's "Saltar": straight to the next question, no reveal and no countdown; what was answered still counts.
process.env.OWNER_IDS = "owner";
const store = {
  users: {
    owner: { id: "owner", name: "Owner", email: "o@x.com" },
    user: { id: "user", name: "User", email: "u@x.com" },
  },
};
const mgr = new RoomManager({ catalog: readLocalCatalog(), store });
const stop = (room) => clearTimeout(room.timer);
const room = mgr.create({ host: { id: "user", name: "User", socketId: "s1" }, game: "opciones" });
mgr.addPlayer(room, { id: "owner", name: "Owner", socketId: "s2" });
mgr.updateConfig(room, "user", { quiz: { rounds: 5 } });

assert.throws(() => mgr.skipRound(room, "owner"), /ninguna pregunta/, "nothing to skip in the lobby");
mgr.start(room, "user");
stop(room);
room.tracks[0] = { id: "q1", type: "choice", text: "¿Capital de Francia?", options: ["Roma", "París", "Lisboa", "Berlín"], answer: 1 };

// Only owners.
assert.throws(() => mgr.skipRound(room, "user"), /Solo los owners/);

// From the countdown of round 1: round 2 is playing straight away.
mgr.beginPlaying(room);
stop(room);
mgr.submitAnswer(room, "user", 1);
mgr.skipRound(room, "owner");
stop(room);
assert.equal(room.currentRound, 1);
assert.equal(room.phase, "playing", "no reveal and no countdown");
assert.ok(room.players.get("user").score > 0, "the answer given before the skip counts");
assert.equal(room.players.get("user").rounds.length, 1);

// A paused match goes on.
mgr.pause(room, "user");
mgr.skipRound(room, "owner");
stop(room);
assert.equal(room.paused, null);
assert.equal(room.currentRound, 2);
assert.equal(room.phase, "playing");

// From a reveal, and after the last round the match ends.
mgr.beginReveal(room);
stop(room);
mgr.skipRound(room, "owner");
stop(room);
assert.equal(room.currentRound, 3);
mgr.skipRound(room, "owner");
stop(room);
mgr.skipRound(room, "owner");
stop(room);
assert.equal(room.phase, "finished");
mgr.destroy(room);

console.log("ownerSkip.test ok");
