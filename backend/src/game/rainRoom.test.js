import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RAIN_FALL_MS, RAIN_GRACE_MS, RAIN_REVEAL_MS } from "./rain.js";
import { RoomManager } from "./roomManager.js";

// Lluvia in a room: questions fall for a whole round and every player writes answers in their box. An answer counts
// for any question on screen that nobody has answered yet: the first to answer it takes it (it leaves everyone's
// screen) and scores by its difficulty (1, 3 or 5 points). Whoever has the most points when the time runs out wins
// the round. (Without a question bank, the pool is the
// capitals of geo/countries.js.)
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "lluvia" });
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3" });
const ana = room.players.get("p-2");
const luis = room.players.get("p-3");

// ---- Lobby: the settings and how many questions they can draw ----
assert.deepEqual(room.config.rain.difficulties, ["facil", "media", "dificil"]);
assert.equal(room.config.rain.categories.length, 10);
let pub = mgr.publicState(room);
assert.ok(pub.questionsReady > 100, "every capital");
assert.equal(pub.songsReady, undefined);
assert.ok(pub.questionCounts.categories.geografia > 100);
assert.ok(pub.questionCounts.difficulties.facil > 0);
mgr.updateConfig(room, "host-1", { rain: { categories: [] } });
assert.throws(() => mgr.start(room, "host-1"), /al menos una categoría/);
mgr.updateConfig(room, "host-1", { rain: { categories: ["ciencia"] } });
assert.equal(mgr.publicState(room).questionsReady, 0);
assert.throws(() => mgr.start(room, "host-1"), /hacen falta al menos 10/, "too few questions");
mgr.updateConfig(room, "host-1", { rain: { categories: ["geografia"], difficulties: [] } });
assert.throws(() => mgr.start(room, "host-1"), /al menos una dificultad/);
assert.throws(() => mgr.updateConfig(room, "p-2", { rain: { rounds: 4 } }), /permisos/);
mgr.updateConfig(room, "host-1", { rain: { difficulties: ["facil", "media", "dificil"], rounds: 2, roundMs: 30000 } });
assert.equal(room.config.rain.rounds, 2);

mgr.start(room, "host-1");
stop(room);
assert.equal(room.phase, "countdown");
assert.equal(room.tracks.length, 2);
assert.equal(room.totalRounds, 2);
assert.ok(room.tracks[0].drops.length > 5);
assert.ok(room.tracks[0].drops.every((d) => d.question.category === "Geografía"));
pub = mgr.publicState(room, "p-2");
assert.equal(pub.question.round, 1);
assert.deepEqual(pub.question.drops, [], "nothing falls during the countdown");
assert.throws(() => mgr.rainAnswer(room, "p-2", "París"), /No se aceptan/);

// The round below uses known questions: three that fall straight away, two a few seconds later and one at the end.
const question = (text, answer, difficulty, points) => ({ type: "open", text, answer, aliases: [], reject: [], category: "Geografía", difficulty, points });
const known = (at, lane, text, answer, difficulty, points) => ({ at, lane, points, question: question(text, answer, difficulty, points) });
room.tracks[0] = {
  id: "lluvia-1",
  kind: "rain",
  roundMs: 30000,
  fallMs: RAIN_FALL_MS,
  drops: [
    known(0, 0, "¿Cuál es la capital de Francia?", "París", "facil", 1),
    known(500, 1, "¿Cuál es la capital de Japón?", "Tokio", "media", 3),
    known(1000, 0.5, "¿Cuál es la capital de Italia?", "Roma", "media", 3),
    known(5000, 0, "¿Cuál es la capital de Australia?", "Canberra", "dificil", 5),
    known(8000, 1, "¿Cuál es la capital de Egipto?", "El Cairo", "dificil", 5),
    known(25000, 0.5, "¿Cuál es la capital de Perú?", "Lima", "facil", 1),
  ].map((d, id) => ({ id, ...d })),
};
// Where the rain is: `ms` into the round.
const at = (ms) => {
  room.phaseStartedAt = Date.now() - ms;
};
const send = (player, text) => {
  player.rain.sentAt = 0;
  return mgr.rainAnswer(room, player.id, text);
};

// ---- Playing ----
mgr.beginPlaying(room);
stop(room);
assert.equal(room.phase, "playing");
assert.equal(room.phaseEndsAt - room.phaseStartedAt, 30000, "the round lasts what the settings say");
at(1000);
pub = mgr.publicState(room, "p-2");
assert.deepEqual(
  pub.question.drops.map((d) => d.id),
  [0, 1, 2],
  "only what is on screen (and what shows in the next 2 s)"
);
assert.equal(pub.question.fallMs, RAIN_FALL_MS);
assert.ok(pub.question.drops.every((d) => d.answer === null && d.text && d.points), "never the answers while it rains");
assert.equal(pub.question.drops[1].difficulty, "media");
assert.equal(pub.question.fallen, 3);
assert.ok(pub.question.drops.every((d) => d.by === null), "nobody took any yet");
at(3500);
assert.ok(mgr.publicState(room).question.drops.some((d) => d.id === 3), "a question goes out a little before it shows");

at(1500);
// A right answer takes the question: it scores its points at once, and it's gone for everyone.
assert.deepEqual(send(ana, "paris"), { drop: 0, points: 1, answer: "París" });
assert.equal(ana.score, 1);
assert.equal(ana.rain.hits, 1);
pub = mgr.publicState(room);
const paris = pub.question.drops.find((d) => d.id === 0);
assert.equal(paris.by, "p-2", "everyone sees that Ana took it");
assert.ok(Math.abs(paris.takenAt - 1500) < 50, "and when");
assert.equal(paris.answer, null, "but not its answer");
const anaPub = pub.players.find((p) => p.id === "p-2");
assert.equal(anaPub.hits, 1);
assert.equal(anaPub.answered, false, "the round never waits for anyone");
// Too late for Luis: right, but Ana was first. It scores nothing and keeps his streak.
luis.streak = 2;
assert.deepEqual(send(luis, "París"), { takenBy: "Ana", answer: "París" });
assert.equal(luis.score, 0);
assert.equal(luis.streak, 2);
assert.equal(send(ana, "París"), null, "and Ana can't take it twice");
// Any question on screen: the medium ones, worth 3.
assert.deepEqual(send(luis, "Roma"), { drop: 2, points: 3, answer: "Roma" });
assert.deepEqual(send(ana, "tokio"), { drop: 1, points: 3, answer: "Tokio" });
assert.equal(ana.score, 4);
// One that hasn't shown yet doesn't count.
assert.equal(send(luis, "Canberra"), null);
assert.equal(luis.streak, 0, "a wrong answer breaks the streak");
at(6000);
assert.deepEqual(send(luis, "Canberra"), { drop: 3, points: 5, answer: "Canberra" });
assert.equal(luis.score, 8);
// Answers are taken one at a time.
assert.throws(() => mgr.rainAnswer(room, "p-2", "algo"), /despacio/);
assert.throws(() => send(ana, "   "), /Escribe/);
// One that left the screen a while ago doesn't count any more; a moment ago it still does (the network's delay).
at(25000 + RAIN_FALL_MS + RAIN_GRACE_MS + 400);
assert.equal(send(ana, "Lima"), null);
at(25000 + RAIN_FALL_MS + RAIN_GRACE_MS - 100);
assert.deepEqual(send(ana, "Lima"), { drop: 5, points: 1, answer: "Lima" });
// Written answers through the usual event work too.
at(9000);
ana.rain.sentAt = 0;
assert.deepEqual(mgr.submitAnswer(room, "p-2", "El Cairo"), { drop: 4, points: 5, answer: "El Cairo" });
assert.equal(ana.score, 10);
assert.throws(() => mgr.skip(room, "p-2"), /no se puede saltar/);

// Someone arriving now only watches.
mgr.addPlayer(room, { id: "p-4", name: "Eva", socketId: "s4" });
assert.throws(() => mgr.rainAnswer(room, "p-4", "Lima"), /viendo la partida/);
assert.equal(mgr.publicState(room).players.find((p) => p.id === "p-4").spectator, true);

// A pause stops the rain where it is, and no answer is taken meanwhile.
at(7000);
mgr.pause(room, "host-1");
assert.throws(() => send(ana, "Lima"), /pausa/);
const frozen = mgr.rainElapsed(room);
assert.ok(Math.abs(frozen - 7000) < 50);
mgr.resume(room, "host-1");
stop(room);
assert.ok(Math.abs(mgr.rainElapsed(room) - frozen) < 50, "it goes on from where it stopped");

// ---- Reveal: each player's round, who won it, and every answer ----
mgr.beginReveal(room);
stop(room);
assert.equal(room.phase, "reveal");
assert.equal(room.phaseEndsAt - room.phaseStartedAt, RAIN_REVEAL_MS);
assert.equal(ana.lastAnswer.text, "4 aciertos · 10 puntos");
assert.equal(ana.lastPoints, 10);
assert.equal(luis.lastAnswer.text, "2 aciertos · 8 puntos");
pub = mgr.publicState(room, "p-2");
assert.deepEqual(pub.question.winners, ["p-2"], "Ana won the round");
assert.equal(pub.question.best, 10);
assert.deepEqual(
  pub.question.drops.map((d) => d.answer),
  ["París", "Tokio", "Roma", "Canberra", "El Cairo", "Lima"],
  "every question that fell, with its answer"
);
assert.deepEqual(
  pub.question.drops.map((d) => d.by),
  ["p-2", "p-2", "p-3", "p-3", "p-2", "p-2"],
  "and who took it"
);
assert.throws(() => mgr.rainAnswer(room, "p-2", "Lima"), /No se aceptan/);
// A tie: both won the round.
luis.rain.points = 10;
mgr.gradeRain(room, room.tracks[0]);
assert.deepEqual(room.tracks[0].winners.sort(), ["p-2", "p-3"]);
luis.rain.points = 8;

// ---- The next round starts clean ----
mgr.advance(room);
stop(room);
assert.equal(room.phase, "countdown");
assert.equal(room.currentRound, 1);
assert.deepEqual(ana.rain, { hits: 0, points: 0, sentAt: 0 });
assert.equal(ana.score, 10, "the match adds up every round");
assert.equal(room.players.get("p-4").rain, null, "the spectator still only watches");

// ---- The end: by points ----
mgr.beginPlaying(room);
stop(room);
mgr.beginReveal(room);
stop(room);
assert.equal(ana.lastAnswer.text, "Sin aciertos");
assert.deepEqual(mgr.publicState(room).question.winners, [], "nobody scored: nobody won the round");
mgr.advance(room);
stop(room);
assert.equal(room.phase, "finished");
const results = mgr.publicState(room).results;
assert.deepEqual(
  results.map((r) => r.id),
  ["p-2", "p-3", "host-1"]
);
assert.equal(results[0].correct, 4);
assert.equal(room.board.matches, 1);
assert.equal(room.board.players["p-2"].wins, 1, "Ana won the match");

// ---- Back to the lobby ----
mgr.restart(room, "host-1");
assert.equal(room.phase, "lobby");
assert.equal(ana.rain, null);

// ---- In a playlist ----
const playlist = mgr.updatePlaylist(room, "host-1", { items: [{ game: "lluvia", config: { rounds: 9, roundMs: 45000, categories: ["ciencia"] } }] });
assert.deepEqual(playlist.items[0].config, { rounds: 5, roundMs: 45000, categories: ["ciencia"], difficulties: ["facil", "media", "dificil"] });
assert.match(mgr.itemProblem(room, playlist.items[0]), /hacen falta al menos 10/);
mgr.updatePlaylist(room, "host-1", { items: [{ game: "lluvia", config: { rounds: 1, categories: ["geografia"] } }] });
assert.equal(mgr.itemProblem(room, room.playlist.items[0]), null);
mgr.setGame(room, "host-1", "playlist");
assert.ok(mgr.playlistStatus(room)[room.playlist.items[0].id].counts.categories.geografia > 0);
mgr.start(room, "host-1");
stop(room);
assert.equal(room.game, "lluvia", "the playlist plays Lluvia");
assert.equal(room.tracks.length, 1);

// ---- In a random playlist: its rounds mixed with another game's, each one a whole shower ----
mgr.restart(room, "host-1");
mgr.updatePlaylist(room, "host-1", {
  order: "aleatorio",
  items: [
    { game: "lluvia", config: { rounds: 2, categories: ["geografia"] } },
    { game: "mundo", config: { rounds: 5 } },
  ],
});
mgr.start(room, "host-1");
stop(room);
assert.equal(room.run.mixed, true);
const gameOf = (t) => room.run.items[t.playlistItem].game;
const showers = room.tracks.filter((t) => gameOf(t) === "lluvia");
assert.equal(showers.length, 2);
assert.ok(showers.every((t) => t.kind === "rain" && t.drops.length > 5), "Lluvia's rounds are showers, never another game's");
const maps = room.tracks.filter((t) => gameOf(t) === "mundo");
assert.ok(maps.every((t) => (t.style !== "bandera" || t.flagToken) && (t.style !== "sombra" || t.shapeToken)), "flags and silhouettes get their token");
while (gameOf(room.tracks[room.currentRound]) !== "lluvia") {
  mgr.advance(room);
  stop(room);
}
assert.equal(room.game, "lluvia");
assert.ok(mgr.isRainRound(room));
assert.deepEqual(room.players.get("p-2").rain, { hits: 0, points: 0, sentAt: 0 });

console.log("rainRoom ok");
