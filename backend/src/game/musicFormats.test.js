import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// Adivina la canción's "Modos": closed rounds (four songs, one right) and open ones (the title typed).
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const host = { id: "host-1", name: "Host", socketId: "s1" };
const room = mgr.create({ host, mode: "multi", game: "musica" });
mgr.addPlayer(room, { id: "guest-2", name: "Guest", socketId: "s2" });

// Both are ticked in a new room, and the rounds are shared evenly.
assert.deepEqual(room.config.formats, ["opciones", "escribir"]);
mgr.updateConfig(room, "host-1", { rounds: 10 });
mgr.start(room, "host-1");
while (room.tracks.length < room.totalRounds) {
  room.currentRound = room.tracks.length - 1;
  mgr.pickAhead(room);
}
room.currentRound = 0;
const closed = room.tracks.filter((t) => t.type === "choice");
assert.equal(closed.length, 5);
assert.equal(room.tracks.filter((t) => t.type === "open").length, 5);
// A closed round: four different songs, the right one among them.
for (const t of closed) {
  assert.equal(t.options.length, 4);
  assert.equal(new Set(t.options).size, 4);
  assert.ok(t.options[t.answer].startsWith(t.title));
}
clearTimeout(room.timer);

// Only closed rounds: the options show while playing, the right one only at the reveal, graded at the reveal.
const c = mgr.create({ host: { id: "c-1", name: "C", socketId: "s3" }, mode: "multi", game: "musica" });
mgr.addPlayer(c, { id: "c-2", name: "D", socketId: "s4" });
mgr.updateConfig(c, "c-1", { formats: ["opciones"] });
mgr.start(c, "c-1");
let state = mgr.publicState(c);
assert.equal(state.choice.type, "choice");
assert.equal(state.choice.options, null, "no options during the countdown");
mgr.beginPlaying(c);
state = mgr.publicState(c);
assert.equal(state.choice.options.length, 4);
assert.equal(state.choice.answer, null);
const track = c.tracks[0];
assert.throws(() => mgr.submitAnswer(c, "c-1", 9), /opciones/);
mgr.submitAnswer(c, "c-1", track.answer);
assert.equal(c.players.get("c-1").score, 0, "graded only at the reveal");
mgr.submitAnswer(c, "c-2", (track.answer + 1) % 4);
clearTimeout(c.timer);
assert.equal(c.phase, "reveal");
assert.ok(c.players.get("c-1").score >= 500);
assert.equal(c.players.get("c-1").lastAnswer.correct, true);
assert.equal(c.players.get("c-2").score, 0);
state = mgr.publicState(c);
assert.equal(state.choice.answer, track.answer);
assert.equal(state.choice.picks[track.answer], 1);
assert.equal(state.reveal.title, track.title);
clearTimeout(c.timer);

// Only open rounds: as before, the typed title.
const o = mgr.create({ host: { id: "o-1", name: "O", socketId: "s5" }, mode: "multi", game: "musica" });
mgr.updateConfig(o, "o-1", { formats: ["escribir"] });
mgr.start(o, "o-1");
assert.equal(mgr.publicState(o).choice.type, "open");
mgr.beginPlaying(o);
mgr.submitAnswer(o, "o-1", o.tracks[0].title);
clearTimeout(o.timer);
assert.equal(o.players.get("o-1").lastAnswer.correct, true);

// Nothing ticked: the match can't start.
const n = mgr.create({ host: { id: "n-1", name: "N", socketId: "s6" }, mode: "multi", game: "musica" });
mgr.updateConfig(n, "n-1", { formats: [] });
assert.throws(() => mgr.start(n, "n-1"), /al menos un modo/);

console.log("musicFormats.test ok");
