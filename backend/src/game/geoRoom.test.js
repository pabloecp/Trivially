import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { LOCATION_ROUND_MS } from "./geo.js";
import { RoomManager } from "./roomManager.js";

// Encuentra el país: map rounds (pins) and the tiebreak for first place.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);
const host = { id: "host-1", name: "Host", socketId: "s1" };
const room = mgr.create({ host, mode: "multi", game: "mundo" });
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3" });

// Lobby: the settings (no kinds of question and no seconds to write: it is only a pin on the map), and how many
// countries they can draw.
const DIFFICULTIES = ["facil", "media", "dificil"];
assert.deepEqual(room.config.geo, { rounds: 5, difficulties: DIFFICULTIES });
const all = mgr.publicState(room).questionsReady;
assert.ok(all > 150 && all < 250, `one question per country (${all})`);
assert.equal(mgr.publicState(room).songsReady, undefined);
// An older client's kinds and seconds are ignored.
mgr.updateConfig(room, "host-1", { geo: { kinds: ["capital"], roundMs: 30000 } });
assert.deepEqual(room.config.geo, { rounds: 5, difficulties: DIFFICULTIES });
assert.equal(mgr.publicState(room).questionsReady, all);
// Every difficulty can be unticked: there is then nothing to play.
mgr.updateConfig(room, "host-1", { geo: { difficulties: [] } });
assert.equal(mgr.publicState(room).questionsReady, 0);
assert.throws(() => mgr.start(room, "host-1"), /dificultad/);
mgr.updateConfig(room, "host-1", { geo: { rounds: 6, difficulties: ["facil"] } });
assert.ok(mgr.publicState(room).questionsReady < all, "fewer difficulties, fewer questions");

mgr.start(room, "host-1");
stop(room);
assert.equal(room.tracks.length, 6);
assert.ok(room.tracks.every((t) => t.kind === "location"), "never a capital or a flag");
assert.equal(new Set(room.tracks.map((t) => t.country)).size, 6, "never the same country twice");
// The first round asks for Spain.
Object.assign(room.tracks[0], { name: "España", answer: "España", country: "ES", map: ["Spain"] });

// A map round: 10 s; pins can move until locked, the last one counts, and nothing says where the country is.
let pub = mgr.publicState(room, "p-2");
assert.equal(pub.phase, "countdown");
assert.deepEqual(pub.question, { round: 1, kind: "location", difficulty: "facil", prompt: null, name: null });
mgr.beginPlaying(room);
stop(room);
assert.equal(room.phaseEndsAt - room.phaseStartedAt, LOCATION_ROUND_MS);
pub = mgr.publicState(room, "p-2");
assert.equal(pub.question.name, "España");
assert.ok(!JSON.stringify(pub).includes('"Spain"'), "the map shape of the answer isn't sent");
assert.throws(() => mgr.submitAnswer(room, "p-2", "España"), /Toca el mapa/);
assert.throws(() => mgr.placePin(room, "p-2", { lng: 200, lat: 0 }), /no está en el mapa/);
assert.equal(mgr.placePin(room, "p-2", { lng: 0, lat: -60 }), false, "a pin that isn't locked changes nothing for the others");
assert.equal(room.players.get("p-2").lastAnswer, null);
assert.deepEqual(mgr.publicState(room, "p-2").me.pin, [0, -60]);
assert.equal(mgr.publicState(room, "host-1").players.find((p) => p.id === "p-2").answered, false);
// The host leaves a pin in Paris without locking it; Ana moves hers to Madrid and locks it.
mgr.placePin(room, "host-1", { lng: 2.35, lat: 48.86 });
const before = room.players.get("p-2").score;
assert.equal(mgr.placePin(room, "p-2", { lng: -3.7, lat: 40.4, lock: true }), true);
assert.equal(mgr.placePin(room, "p-2", { lng: 2, lat: 2 }), false, "a locked pin doesn't move");
assert.equal(room.players.get("p-2").lastAnswer.inside, undefined, "pins are only judged at the reveal");
mgr.beginReveal(room);
stop(room);
const ana = room.players.get("p-2");
const hostPlayer = room.players.get("host-1");
assert.deepEqual(ana.lastAnswer.pin, [-3.7, 40.4]);
assert.equal(ana.lastAnswer.inside, true);
assert.equal(ana.lastPoints, 1000);
assert.equal(ana.score, before + 1000);
assert.equal(hostPlayer.lastAnswer.inside, false, "the last pin counts even if it wasn't locked");
assert.equal(hostPlayer.lastAnswer.text, "A 681 km");
assert.ok(hostPlayer.lastPoints > 0 && hostPlayer.lastPoints < 1000);
assert.equal(room.players.get("p-3").lastAnswer.text, "", "no pin, no points");
pub = mgr.publicState(room);
assert.deepEqual(pub.reveal.map, ["Spain"]);
assert.equal(pub.players.find((p) => p.id === "host-1").lastAnswer.nearest.length, 2);
assert.equal(room.phaseEndsAt - room.phaseStartedAt, 3000, "the same wait between rounds as every mode");

// ---- Tiebreak ----
// Ana and the host finish level; Luis is behind and only watches.
function tiedRoom() {
  const r = mgr.create({ host: { id: "a", name: "A", socketId: "ta" }, mode: "multi", game: "mundo" });
  mgr.addPlayer(r, { id: "b", name: "B", socketId: "tb" });
  mgr.addPlayer(r, { id: "c", name: "C", socketId: "tc" });
  mgr.updateConfig(r, "a", { geo: { rounds: 5 } });
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
  return r;
}

// A tiebreak with a known country, so the test can put pins inside it or not.
function useSpain(r) {
  Object.assign(r.tracks[r.currentRound], { name: "España", answer: "España", country: "ES", map: ["Spain"] });
}

let t = tiedRoom();
assert.equal(t.phase, "countdown", "the tie starts a tiebreak instead of ending the match");
assert.deepEqual(t.tiebreak.playerIds.sort(), ["a", "b"]);
assert.equal(t.currentRound, t.totalRounds, "a round after the last one");
assert.equal(t.tracks[t.currentRound].kind, "location");
assert.equal(mgr.publicState(t).totalRounds, 5);
assert.equal(t.players.get("c").status, "mirando");
useSpain(t);
mgr.beginPlaying(t);
stop(t);
assert.throws(() => mgr.placePin(t, "c", { lng: -3.7, lat: 40.4 }), /desempate/);
// A pin can move until it is confirmed; an unconfirmed one inside the country doesn't end the round.
assert.equal(mgr.placePin(t, "a", { lng: 2.35, lat: 48.86 }), false);
assert.equal(mgr.placePin(t, "a", { lng: -4, lat: 40 }), false);
assert.equal(t.phase, "playing");
// B confirms first, outside: a confirmed pin is final.
assert.equal(mgr.placePin(t, "b", { lng: 2.35, lat: 48.86, lock: true }), true);
assert.equal(mgr.placePin(t, "b", { lng: -3.7, lat: 40.4, lock: true }), false, "no second try");
assert.equal(t.phase, "playing");
// A confirms Spain: that ends the round there and then, and A wins.
mgr.placePin(t, "a", { lng: -3.7, lat: 40.4, lock: true });
stop(t);
assert.equal(t.phase, "reveal");
assert.equal(t.tiebreak.winnerId, "a");
assert.equal(t.tiebreak.reason, "dentro");
assert.equal(t.players.get("a").score, 3000, "a tiebreak gives no points");
mgr.advance(t);
assert.equal(t.phase, "finished");
let results = mgr.publicState(t).results;
assert.deepEqual(results.map((r) => r.id), ["a", "b", "c"]);
assert.equal(results[0].tiebreakWinner, true);
assert.equal(results[1].tiebreakWinner, false);

// Whoever confirms the country first wins, even if the other already had an unconfirmed pin inside.
t = tiedRoom();
useSpain(t);
mgr.beginPlaying(t);
mgr.placePin(t, "a", { lng: -3.7, lat: 40.4 });
mgr.placePin(t, "b", { lng: -5, lat: 40, lock: true });
stop(t);
assert.equal(t.phase, "reveal");
assert.equal(t.tiebreak.winnerId, "b");
assert.equal(t.players.get("a").lastAnswer.inside, true);
assert.throws(() => mgr.placePin(t, "a", { lng: -3.7, lat: 40.4, lock: true }), /No se aceptan/);

// Nobody confirmed and time ran out: the pin that found the country first wins.
t = tiedRoom();
useSpain(t);
mgr.beginPlaying(t);
mgr.placePin(t, "b", { lng: -5, lat: 40 });
mgr.placePin(t, "a", { lng: -3.7, lat: 40.4 });
t.players.get("a").pin.at -= 5000;
mgr.beginReveal(t);
stop(t);
assert.equal(t.tiebreak.winnerId, "a");

// Nobody inside: the closest pin wins, however late it came.
t = tiedRoom();
useSpain(t);
mgr.beginPlaying(t);
mgr.placePin(t, "a", { lng: 2.35, lat: 48.86, lock: true }); // París, ~680 km
assert.equal(t.phase, "playing");
mgr.placePin(t, "b", { lng: 7.27, lat: 43.7, lock: true }); // Niza, ~450 km
stop(t);
assert.equal(t.phase, "reveal");
assert.equal(t.tiebreak.winnerId, "b");
assert.equal(t.tiebreak.reason, "cerca");
mgr.advance(t);
assert.deepEqual(mgr.publicState(t).results.map((r) => r.id).slice(0, 2), ["b", "a"]);

// No pins: another tiebreak, up to three; after that the tie stands.
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

// If the other tied player has left, there's no tiebreak to play.
const solo = mgr.create({ host: { id: "x", name: "X", socketId: "tx" }, mode: "multi", game: "mundo" });
mgr.addPlayer(solo, { id: "y", name: "Y", socketId: "ty" });
mgr.updateConfig(solo, "x", { geo: { rounds: 5 } });
mgr.start(solo, "x");
stop(solo);
solo.currentRound = solo.totalRounds - 1;
mgr.leave("ty");
mgr.beginPlaying(solo);
mgr.beginReveal(solo);
mgr.advance(solo);
assert.equal(solo.phase, "finished");

// Going back to the lobby clears the tiebreak.
mgr.restart(t, "a");
assert.equal(t.tiebreak, null);
assert.equal(mgr.publicState(t).tiebreak, null);

// Music still works and unknown games are refused.
assert.throws(() => mgr.setGame(room, "host-1", "inexistente"), /no está disponible/);
mgr.setGame(room, "host-1", "musica");
assert.equal(room.game, "musica");
console.log("geoRoom.test ok");
