import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { eraOf } from "./history.js";
import { RoomManager } from "./roomManager.js";

// Historia: an event, a timeline and a year per player; the closer, the more points. Ties for first place are settled
// like Geografía's: the first to confirm the exact year wins, otherwise the closest.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "historia" });
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3" });

// Lobby: the settings, and how many events they can draw.
assert.deepEqual(room.config.history.eras, ["antigua", "media", "moderna", "contemporanea"]);
assert.ok(mgr.publicState(room).questionsReady > 200);
assert.equal(mgr.publicState(room).songsReady, undefined);
// Every age can be unticked: there is then nothing to play.
mgr.updateConfig(room, "host-1", { history: { eras: [] } });
assert.equal(mgr.publicState(room).questionsReady, 0);
mgr.updateConfig(room, "host-1", { history: { eras: ["antigua", "media", "moderna", "contemporanea"] } });
assert.throws(() => mgr.updateConfig(room, "p-2", { history: { rounds: 10 } }), /permisos/);
const all = mgr.publicState(room).questionsReady;
mgr.updateConfig(room, "host-1", { history: { eras: ["moderna"] } });
assert.ok(mgr.publicState(room).questionsReady < all, "fewer ages, fewer events");
mgr.updateConfig(room, "host-1", { history: { eras: ["antigua", "media", "moderna", "contemporanea"], rounds: 5, roundMs: 20000 } });

mgr.start(room, "host-1");
stop(room);
assert.equal(room.tracks.length, 5);
assert.equal(room.totalRounds, 5);
assert.equal(new Set(room.tracks.map((t) => t.year)).size, 5);

// The rounds below use known events.
const known = (r, year, min, max) => Object.assign(r.tracks[r.currentRound], { year, min, max, era: eraOf(year), prompt: "Evento de prueba" });
const next = () => {
  mgr.advance(room);
  stop(room);
};
const noYearShown = (state, year, label) => {
  assert.equal(state.reveal, null, `${label}: sin revelación`);
  assert.ok(!JSON.stringify(state.question).includes(String(Math.abs(year))), `${label}: se filtra el año`);
  assert.ok(!("year" in state.question), `${label}: se filtra el año`);
};

// ---- A round ----
known(room, 1989, 1930, 2030);
let pub = mgr.publicState(room, "p-2");
assert.equal(pub.phase, "countdown");
assert.equal(pub.question.prompt, "Evento de prueba", "the event can be read during the countdown");
assert.equal(pub.question.min, null, "the timeline only comes with the round");
noYearShown(pub, 1989, "cuenta atrás");
assert.throws(() => mgr.placeYear(room, "p-2", { year: 1989 }), /No se aceptan/);

mgr.beginPlaying(room);
stop(room);
assert.equal(room.phaseEndsAt - room.phaseStartedAt, 20000, "the seconds chosen in the settings");
pub = mgr.publicState(room, "p-2");
assert.equal(pub.question.min, 1930);
assert.equal(pub.question.max, 2030);
noYearShown(pub, 1989, "jugando");
assert.throws(() => mgr.submitAnswer(room, "p-2", "1989"), /línea del tiempo/);
assert.throws(() => mgr.placeYear(room, "p-2", { year: 1900 }), /línea del tiempo/, "outside the timeline");
assert.throws(() => mgr.placeYear(room, "p-2", { year: new Date().getFullYear() + 1 }), /aún no ha llegado/, "the timeline's future");
assert.throws(() => mgr.placeYear(room, "p-2", { year: 1989.5 }), /línea del tiempo/);
assert.throws(() => mgr.placeYear(room, "p-2", { year: "mil" }), /línea del tiempo/);

// A year that isn't locked can move, and only its player knows it.
assert.equal(mgr.placeYear(room, "p-2", { year: 1950 }), false);
assert.equal(mgr.placeYear(room, "p-2", { year: 1985 }), false);
assert.equal(room.players.get("p-2").lastAnswer, null);
assert.equal(mgr.publicState(room, "p-2").me.guess, 1985);
assert.equal(mgr.publicState(room, "host-1").players.find((p) => p.id === "p-2").answered, false);
// Ana locks the exact year; the host leaves 1980 without locking it; Luis does nothing.
assert.equal(mgr.placeYear(room, "p-2", { year: 1989, lock: true }), true);
assert.equal(mgr.placeYear(room, "p-2", { year: 1990, lock: true }), false, "a locked year doesn't move");
assert.equal(mgr.publicState(room, "host-1").players.find((p) => p.id === "p-2").answered, true);
assert.equal(room.players.get("p-2").lastAnswer.correct, undefined, "years are only judged at the reveal");
mgr.placeYear(room, "host-1", { year: 1980 });
assert.equal(room.phase, "playing", "Luis still has time");

mgr.beginReveal(room);
stop(room);
assert.equal(room.phaseEndsAt - room.phaseStartedAt, 6000, "the timeline stays on screen");
const ana = room.players.get("p-2");
const host = room.players.get("host-1");
const luis = room.players.get("p-3");
assert.equal(ana.lastAnswer.correct, true);
assert.equal(ana.lastAnswer.diff, 0);
assert.equal(ana.lastAnswer.text, "1989, año exacto");
assert.equal(ana.lastPoints, 1000);
assert.equal(ana.correct, 1);
assert.equal(ana.streak, 1);
assert.equal(host.lastAnswer.year, 1980, "the last year counts even if it wasn't locked");
assert.equal(host.lastAnswer.locked, false);
assert.equal(host.lastAnswer.diff, 9);
assert.equal(host.lastAnswer.text, "1980, a 9 años");
assert.ok(host.lastPoints > 0 && host.lastPoints < ana.lastPoints);
assert.equal(host.correct, 0);
assert.equal(luis.lastAnswer.text, "", "no year, no points");
assert.equal(luis.lastPoints, 0);
pub = mgr.publicState(room);
assert.deepEqual(pub.reveal, { prompt: "Evento de prueba", year: 1989, min: 1930, max: 2030 });
assert.equal(pub.players.find((p) => p.id === "host-1").lastAnswer.year, 1980);

// ---- The closer, the more points; years before Christ, and no year 0 ----
next();
known(room, -44, -500, 500);
mgr.beginPlaying(room);
stop(room);
assert.throws(() => mgr.placeYear(room, "p-2", { year: 0 }), /año 0/);
mgr.placeYear(room, "p-2", { year: -40, lock: true });
mgr.placeYear(room, "host-1", { year: 1, lock: true });
mgr.placeYear(room, "p-3", { year: -300, lock: true });
stop(room);
assert.equal(room.phase, "reveal", "everyone locked: the round ends without waiting for the clock");
assert.equal(ana.lastAnswer.diff, 4);
assert.equal(host.lastAnswer.diff, 44, "from 44 a. C. to 1 d. C.");
assert.equal(luis.lastAnswer.diff, 256);
assert.ok(ana.lastPoints > host.lastPoints && host.lastPoints > luis.lastPoints);
assert.equal(ana.lastAnswer.text, "40 a. C., a 4 años");
assert.equal(ana.streak, 0, "only the exact year keeps a streak");

// ---- Tiebreak ----
// A and B finish level; C is behind and only watches.
function tiedRoom() {
  const r = mgr.create({ host: { id: "a", name: "A", socketId: "ta" }, mode: "multi", game: "historia" });
  mgr.addPlayer(r, { id: "b", name: "B", socketId: "tb" });
  mgr.addPlayer(r, { id: "c", name: "C", socketId: "tc" });
  mgr.start(r, "a");
  stop(r);
  r.players.get("a").score = 3000;
  r.players.get("b").score = 3000;
  r.players.get("c").score = 1200;
  r.currentRound = r.totalRounds - 1;
  mgr.beginPlaying(r);
  mgr.beginReveal(r);
  mgr.advance(r);
  stop(r);
  known(r, 1989, 1930, 2030);
  return r;
}

let t = tiedRoom();
assert.equal(t.phase, "countdown", "the tie starts a tiebreak instead of ending the match");
assert.deepEqual([...t.tiebreak.playerIds].sort(), ["a", "b"]);
assert.equal(t.currentRound, t.totalRounds, "a round after the last one");
assert.ok(!t.tracks.slice(0, -1).some((q) => q.id === t.tracks[t.currentRound].id), "a new event");
assert.equal(mgr.publicState(t).totalRounds, 5);
assert.equal(t.players.get("c").status, "mirando");
mgr.beginPlaying(t);
stop(t);
assert.throws(() => mgr.placeYear(t, "c", { year: 1989 }), /desempate/);
// The exact year without confirming it doesn't end the round.
assert.equal(mgr.placeYear(t, "a", { year: 1989 }), false);
assert.equal(t.phase, "playing");
// B confirms first, but not the exact year: a confirmed year is final.
assert.equal(mgr.placeYear(t, "b", { year: 1988, lock: true }), true);
assert.equal(mgr.placeYear(t, "b", { year: 1989, lock: true }), false, "no second try");
assert.equal(t.phase, "playing");
// A confirms the exact year: that ends the round there and then, and A wins.
mgr.placeYear(t, "a", { year: 1989, lock: true });
stop(t);
assert.equal(t.phase, "reveal");
assert.equal(t.tiebreak.winnerId, "a");
assert.equal(t.tiebreak.reason, "exacto");
assert.equal(t.players.get("a").score, 3000, "a tiebreak gives no points");
mgr.advance(t);
assert.equal(t.phase, "finished");
let results = mgr.publicState(t).results;
assert.deepEqual(results.map((r) => r.id), ["a", "b", "c"]);
assert.equal(results[0].tiebreakWinner, true);

// Whoever confirms the exact year first wins, even if the other already had it unconfirmed.
t = tiedRoom();
mgr.beginPlaying(t);
mgr.placeYear(t, "a", { year: 1989 });
mgr.placeYear(t, "b", { year: 1989, lock: true });
stop(t);
assert.equal(t.phase, "reveal");
assert.equal(t.tiebreak.winnerId, "b");
assert.equal(t.players.get("a").lastAnswer.correct, true);

// Nobody confirmed and time ran out: the exact year chosen first wins.
t = tiedRoom();
mgr.beginPlaying(t);
mgr.placeYear(t, "b", { year: 1989 });
mgr.placeYear(t, "a", { year: 1989 });
t.players.get("a").guess.at -= 5000;
mgr.beginReveal(t);
stop(t);
assert.equal(t.tiebreak.winnerId, "a");

// Nobody exact: the closest year wins, however late it came.
t = tiedRoom();
mgr.beginPlaying(t);
mgr.placeYear(t, "a", { year: 1980, lock: true });
assert.equal(t.phase, "playing");
mgr.placeYear(t, "b", { year: 1992, lock: true });
stop(t);
assert.equal(t.phase, "reveal");
assert.equal(t.tiebreak.winnerId, "b");
assert.equal(t.tiebreak.reason, "cerca");
mgr.advance(t);
assert.deepEqual(mgr.publicState(t).results.map((r) => r.id).slice(0, 2), ["b", "a"]);

// Just as close (one short, one over): nobody wins, and another tiebreak comes.
t = tiedRoom();
mgr.beginPlaying(t);
mgr.placeYear(t, "a", { year: 1986, lock: true });
mgr.placeYear(t, "b", { year: 1992, lock: true });
stop(t);
assert.equal(t.tiebreak.winnerId, null);
mgr.advance(t);
stop(t);
assert.equal(t.phase, "countdown");
assert.equal(t.tiebreak.round, 2);

// No years at all: another tiebreak, up to three; after that the tie stands.
t = tiedRoom();
for (let round = 1; round <= 3; round += 1) {
  assert.equal(t.tiebreak.round, round);
  assert.equal(t.phase, "countdown");
  mgr.beginPlaying(t);
  mgr.beginReveal(t);
  assert.equal(t.tiebreak.winnerId, null);
  mgr.advance(t);
  stop(t);
}
assert.equal(t.phase, "finished");
assert.equal(mgr.publicState(t).results.some((r) => r.tiebreakWinner), false);

// Going back to the lobby clears the tiebreak and the years.
mgr.restart(t, "a");
assert.equal(t.tiebreak, null);
assert.ok([...t.players.values()].every((p) => p.guess == null && p.lastAnswer == null));

// The room can move to and from Historia.
mgr.setGame(room, "host-1", "mundo");
assert.equal(room.game, "mundo");
mgr.setGame(room, "host-1", "historia");
assert.equal(room.game, "historia");
assert.equal(room.phase, "lobby");
console.log("historyRoom.test ok");
