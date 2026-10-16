import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// Owners come from OWNER_IDS.
process.env.OWNER_IDS = "owner";
const store = {
  users: {
    owner: { id: "owner", name: "Owner", email: "o@x.com" },
    user: { id: "user", name: "User", email: "u@x.com" },
  },
};
const mgr = new RoomManager({ catalog: readLocalCatalog(), store });
const room = mgr.create({ host: { id: "user", name: "User", socketId: "s1" }, game: "musica" });
mgr.addPlayer(room, { id: "owner", name: "Owner", socketId: "s2" });

// Nothing to report in the lobby.
assert.throws(() => mgr.questionReport(room, "owner"), /ninguna pregunta/);
mgr.start(room, "user");
clearTimeout(room.timer);

// Only owners can report, whatever room they're in.
assert.throws(() => mgr.questionReport(room, "user"), /Solo los owners/);

// The report has the question with its answer, the settings and who was in the room.
const report = mgr.questionReport(room, "owner");
const track = room.tracks[room.currentRound];
assert.equal(report.game, "musica");
assert.equal(report.question.id, track.id);
assert.equal(report.prompt, `${track.title} - ${track.artistName}`);
assert.equal(report.round, 1);
assert.equal(report.settings.rounds, room.config.rounds);
assert.deepEqual(report.settings.languages, room.config.languages);
assert.equal(report.room.players, 2);
assert.equal(report.players.length, 2);
assert.equal(report.reporter.name, "Owner");

// Once per round; the next round can be reported again.
assert.throws(() => mgr.questionReport(room, "owner"), /Ya reportaste/);
mgr.advance(room);
clearTimeout(room.timer);
assert.equal(mgr.questionReport(room, "owner").round, 2);

mgr.destroy(room);
console.log("questionReport.test ok");
