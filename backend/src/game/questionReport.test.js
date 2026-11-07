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

// Any player of the room can report, owner or not; someone outside the room can't.
assert.equal(mgr.questionReport(room, "user").reporter.name, "User");
assert.throws(() => mgr.questionReport(room, "stranger"), /Solo los jugadores/);

// The report has the question with its answer, the settings and who was in the room.
const report = mgr.questionReport(room, "owner", { verified: true });
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
assert.equal(report.reporter.verified, true);

// More to tell what was wrong: the clock, what the reporter's screen had, the rounds before, where its counts are.
mgr.addPlayer(room, { id: "late", name: "Late", socketId: "s3" });
const full = mgr.questionReport(room, "late", { client: { userAgent: "Mozilla/5.0 Prueba" } });
assert.equal(full.version, 2);
assert.equal(full.reporter.client.userAgent, "Mozilla/5.0 Prueba");
assert.equal(full.timing.phaseStartedAt, room.phaseStartedAt);
assert.ok(full.timing.roundMs > 0);
assert.equal(full.players.find((p) => p.id === "late").spectator, true, "joined mid-match: watching, but can report");
assert.equal(full.seen.code, room.code, "what the reporter's screen received");
assert.equal(full.seen.question?.answer, undefined, "and only that: not the answer before the reveal");
assert.deepEqual(full.match.earlierRounds, []);
assert.deepEqual(full.statsKey, { game: "musica", questionId: track.lyric?.id || track.id, variant: `${track.lyric ? "letra" : "titulo"}:${track.type === "choice" ? "opciones" : "escribir"}` });
assert.equal(full.players.find((p) => p.id === "user").playing, true);
assert.equal(full.players.find((p) => p.id === "user").bot, false);
assert.ok(full.server.uptimeS >= 0);

// Once per round; the next round can be reported again.
assert.throws(() => mgr.questionReport(room, "owner"), /Ya reportaste/);
mgr.advance(room);
clearTimeout(room.timer);
const second = mgr.questionReport(room, "owner");
assert.equal(second.round, 2);
assert.equal(second.match.earlierRounds.length, 1, "the rounds already played");

mgr.destroy(room);
console.log("questionReport.test ok");
