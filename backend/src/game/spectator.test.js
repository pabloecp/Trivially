import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const host = { id: "host-1", name: "Host", socketId: "s1" };
const room = mgr.create({ host, mode: "multi", game: "musica" });
mgr.addPlayer(room, { id: "guest-2", name: "Ana", socketId: "s2" });

// In the lobby, anyone who arrives plays.
assert.equal(room.players.get("guest-2").spectator, undefined);
mgr.start(room, "host-1");
mgr.beginPlaying(room);

// Arriving mid-match makes you a spectator: you see the match, not play it.
mgr.addPlayer(room, { id: "late-3", name: "Beto", socketId: "s3" });
const late = room.players.get("late-3");
assert.equal(late.spectator, true);
assert.equal(late.status, "mirando");
const pub = mgr.publicState(room, "late-3");
assert.equal(pub.me.spectator, true);
assert.equal(pub.players.find((p) => p.id === "late-3").spectator, true);
assert.equal(pub.players.find((p) => p.id === "host-1").spectator, false);
assert.ok(pub.audio, "the spectator gets the round like the players");

// A spectator can't answer, skip, pin or pick a year.
assert.throws(() => mgr.submitAnswer(room, "late-3", "lo que sea"), /viendo la partida/);
assert.throws(() => mgr.skip(room, "late-3"), /viendo la partida/);
assert.throws(() => mgr.placePin(room, "late-3", { lng: 0, lat: 0 }), /viendo la partida/);
assert.throws(() => mgr.placeYear(room, "late-3", { year: 1900 }), /viendo la partida/);
assert.equal(late.lastAnswer, null);

// The round doesn't wait for the spectator: once the players answer, it is revealed.
mgr.skip(room, "host-1");
assert.equal(room.phase, "playing");
mgr.skip(room, "guest-2");
assert.equal(room.phase, "reveal");
assert.equal(late.lastAnswer, null);
clearTimeout(room.timer);

// A reconnecting spectator keeps watching.
mgr.addPlayer(room, { id: "late-3", name: "Beto", socketId: "s3b" });
assert.equal(room.players.get("late-3").spectator, true);

// Results leave spectators out.
mgr.finish(room);
const results = mgr.publicState(room).results;
assert.deepEqual(results.map((r) => r.id).sort(), ["guest-2", "host-1"]);

// Arriving when the match is over (its results) is not watching: they play the next one.
mgr.addPlayer(room, { id: "late-4", name: "Carla", socketId: "s4" });
assert.equal(room.players.get("late-4").spectator, undefined);

// The next match (back to the lobby) brings the spectator in as a player.
mgr.restart(room, "host-1");
assert.equal(room.players.get("late-3").spectator, false);
assert.equal(room.players.get("late-3").status, "conectado");
assert.equal(mgr.publicState(room, "late-3").me.spectator, false);
assert.equal(room.phase, "lobby");

console.log("spectator.test ok");
