import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const room = mgr.create({ host: { id: "host-1", name: "Ana", socketId: "s1" }, mode: "multi", game: null });
mgr.addPlayer(room, { id: "guest-2", name: "Luis", socketId: "s2" });
mgr.addPlayer(room, { id: "guest-3", name: "Eva", socketId: "s3" });
mgr.toggleConfigPermission(room, "host-1", "guest-2");

// Only the host can pass it on, to someone else in the room who is connected.
assert.throws(() => mgr.giveHost(room, "guest-3", "guest-2"), /Solo el anfitrión/);
assert.throws(() => mgr.giveHost(room, "host-1", "host-1"), /Ya eres/);
assert.throws(() => mgr.giveHost(room, "host-1", "nadie"), /no está en la sala/);
room.players.get("guest-3").connected = false;
assert.throws(() => mgr.giveHost(room, "host-1", "guest-3"), /no está conectado/);
room.players.get("guest-3").connected = true;

// The new host is the host for everyone; the old one keeps the settings permission.
room.preview = "musica";
mgr.giveHost(room, "host-1", "guest-2");
const pub = mgr.publicState(room);
assert.equal(pub.hostId, "guest-2");
assert.equal(pub.hostName, "Luis");
assert.deepEqual(room.coHosts, ["host-1"]);
assert.equal(pub.players.find((p) => p.id === "host-1").canEditConfig, true);
assert.equal(pub.players.find((p) => p.id === "guest-2").isHost, true);
assert.equal(room.preview, null);

// The old host can't do host things any more; the new one can.
assert.throws(() => mgr.kick(room, "host-1", "guest-3"), /Solo el anfitrión/);
mgr.giveHost(room, "guest-2", "host-1");
assert.equal(room.hostId, "host-1");
assert.deepEqual(room.coHosts, ["guest-2"]);

console.log("giveHost.test ok");
