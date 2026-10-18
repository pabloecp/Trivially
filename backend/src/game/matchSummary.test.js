import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// The summary of the match shown at the end: every round of each player, with the right answer, what they answered,
// their points and how it went (results[].rounds).
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);
const room = mgr.create({ host: { id: "h", name: "Host", socketId: "s1" }, game: "opciones" });
mgr.addPlayer(room, { id: "a", name: "Ana", socketId: "s2" });
mgr.updateConfig(room, "h", { quiz: { rounds: 5 } });
mgr.start(room, "h");
stop(room);
// Two known rounds: four options, then a written one.
room.tracks[0] = { id: "q1", type: "choice", text: "¿Capital de Francia?", options: ["Roma", "París", "Lisboa", "Berlín"], answer: 1 };
room.tracks[1] = { id: "q2", type: "open", text: "¿Capital de Italia?", prompt: "¿Capital de Italia?", answer: "Roma", aliases: [], reject: [] };

// Round 1: the host is right, Ana picks Roma.
mgr.beginPlaying(room);
stop(room);
mgr.submitAnswer(room, "h", 1);
mgr.submitAnswer(room, "a", 0);
stop(room);
if (room.phase === "playing") mgr.beginReveal(room);
stop(room);

// Round 2: the host writes something wrong, Ana doesn't answer.
mgr.advance(room);
stop(room);
mgr.beginPlaying(room);
stop(room);
mgr.submitAnswer(room, "h", "Madrid");
mgr.beginReveal(room);
stop(room);

mgr.finish(room);
const results = mgr.publicState(room).results;
const host = results.find((p) => p.id === "h");
const ana = results.find((p) => p.id === "a");
assert.equal(host.rounds.length, 2);
const [h1, h2] = host.rounds;
assert.deepEqual({ ...h1, points: h1.points > 0 }, { round: 1, game: "opciones", prompt: "¿Capital de Francia?", answer: "París", yours: "París", points: true, status: "ok" });
assert.deepEqual(h2, { round: 2, game: "opciones", prompt: "¿Capital de Italia?", answer: "Roma", yours: "Madrid", points: 0, status: "bad" });
assert.deepEqual(ana.rounds, [
  { round: 1, game: "opciones", prompt: "¿Capital de Francia?", answer: "París", yours: "Roma", points: 0, status: "bad" },
  { round: 2, game: "opciones", prompt: "¿Capital de Italia?", answer: "Roma", yours: null, points: 0, status: "none" },
]);

// A new match starts with a clean summary.
mgr.replay(room, "h");
stop(room);
assert.deepEqual(room.players.get("a").rounds, []);
mgr.destroy(room);

// Rango: a close year scores without being right ("near").
const hist = mgr.create({ host: { id: "x", name: "X", socketId: "x1" }, game: "historia" });
mgr.updateConfig(hist, "x", { history: { styles: ["linea"] } });
mgr.start(hist, "x");
stop(hist);
Object.assign(hist.tracks[0], { year: 1989, min: 1930, max: 2030, era: "contemporanea", prompt: "Cae el Muro" });
mgr.beginPlaying(hist);
stop(hist);
mgr.placeYear(hist, "x", { year: 1985, lock: true });
stop(hist);
const near = hist.players.get("x").rounds[0];
assert.equal(near.status, "near");
assert.equal(near.answer, "1989");
assert.equal(near.yours, "1985, a 4 años");
assert.ok(near.points > 0);
mgr.destroy(hist);

// A playlist keeps each player's rounds of every game, one after another, and their best streak.
const { recordGame, rankedStandings } = await import("./playlist.js");
const run = { standings: {}, games: [] };
recordGame(run, "opciones", [{ id: "a", name: "Ana", score: 10, bestStreak: 2, rounds: [{ round: 1, game: "opciones", status: "ok" }] }], "a");
recordGame(run, "musica", [{ id: "a", name: "Ana", score: 5, bestStreak: 1, rounds: [{ round: 1, game: "musica", status: "bad" }] }], null);
const [anaRun] = rankedStandings(run);
assert.deepEqual(anaRun.rounds.map((r) => r.game), ["opciones", "musica"]);
assert.equal(anaRun.bestStreak, 2);

console.log("matchSummary.test ok");
