import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager, artistsOf } from "./roomManager.js";

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

// Each artist of a song apart, the main one first; acts whose name has a comma or an "&" stay one.
assert.deepEqual(artistsOf("Tainy, Alvaro Diaz"), ["tainy", "alvaro diaz"]);
assert.deepEqual(artistsOf("Bad Bunny & Drake"), ["bad bunny", "drake"]);
assert.deepEqual(artistsOf("Anuel AA, Daddy Yankee & KAROL G"), ["anuel aa", "daddy yankee", "karol g"]);
assert.deepEqual(artistsOf("ROSALÍA feat. The Weeknd"), ["rosalia", "the weeknd"]);
assert.deepEqual(artistsOf("Tyler, The Creator"), ["tyler the creator"]);
assert.deepEqual(artistsOf("Tyler, The Creator, Kali Uchis"), ["tyler the creator", "kali uchis"]);
assert.deepEqual(artistsOf("Earth, Wind & Fire"), ["earth wind fire"]);
assert.deepEqual(artistsOf("Bad Bunny, Jowell & Randy & Ñengo Flow"), ["bad bunny", "jowell randy", "nengo flow"]);
assert.deepEqual(artistsOf("Jesse & Joy"), ["jesse joy"]);
assert.deepEqual(artistsOf("Charli xcx"), ["charli xcx"]);

// The three wrong options are by the same main artist when there are enough of theirs (the catalog has many of
// Bad Bunny's, his duets included): a Bad Bunny song with three more Bad Bunny songs. With too few, other songs fill
// the rest.
const a = mgr.create({ host: { id: "a-1", name: "A", socketId: "s7" }, mode: "multi", game: "musica" });
mgr.updateConfig(a, "a-1", { formats: ["opciones"] });
const songs = mgr.catalog.songs;
const bunny = songs.find((s) => s.artistName === "Bad Bunny");
for (let i = 0; i < 5; i += 1) {
  const t = mgr.withFormat(a, bunny, [bunny]);
  assert.equal(t.type, "choice");
  assert.equal(new Set(t.options).size, 4);
  assert.ok(t.options.every((o) => /Bad Bunny/i.test(o)), `all of Bad Bunny's: ${t.options.join(" | ")}`);
}
// Then the song's other artists: a duet of someone with no other songs and Tainy brings Tainy's songs.
const duet = { id: "x-duo", title: "Dueto inventado", artistName: "Artista Inventado, Tainy" };
const d = mgr.withFormat(a, duet, [duet]);
assert.ok(d.options.filter((o) => o !== d.options[d.answer]).every((o) => /Tainy/i.test(o)), `Tainy's: ${d.options.join(" | ")}`);
const alone = { id: "x-solo", title: "Canción única", artistName: "Artista Que No Existe" };
const t = mgr.withFormat(a, alone, [alone]);
assert.equal(t.type, "choice", "other artists fill in");
assert.equal(new Set(t.options).size, 4);

console.log("musicFormats.test ok");
