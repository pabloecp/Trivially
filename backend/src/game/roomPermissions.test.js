import assert from "node:assert/strict";
import { RoomManager } from "./roomManager.js";

const fakeCatalog = { songs: [], artists: [], albums: [], genres: [], playlists: [] };
const mgr = new RoomManager({ catalog: fakeCatalog, store: {} });

const host = { id: "host-1", name: "HostUser", avatar: "#FF0000", socketId: "sock-1" };
const player2 = { id: "player-2", name: "PlayerTwo", avatar: "#00FF00", socketId: "sock-2" };
const player3 = { id: "player-3", name: "PlayerThree", avatar: "#0000FF", socketId: "sock-3" };

const room = mgr.create({ host, mode: "multi" });
mgr.addPlayer(room, player2);
mgr.addPlayer(room, player3);

// Initially only host has config permission
assert.equal(mgr.canEditConfig(room, "host-1"), true);
assert.equal(mgr.canEditConfig(room, "player-2"), false);
assert.equal(mgr.canEditConfig(room, "player-3"), false);

// Player 2 cannot configure
assert.throws(() => {
  mgr.updateConfig(room, "player-2", { rounds: 10 });
}, /No tienes permisos/);

// Non-host cannot grant permission
assert.throws(() => {
  mgr.toggleConfigPermission(room, "player-2", "player-3");
}, /Solo el Host/);

// Host grants permission to Player 2
const res1 = mgr.toggleConfigPermission(room, "host-1", "player-2");
assert.equal(res1.granted, true);
assert.equal(mgr.canEditConfig(room, "player-2"), true);

// Now Player 2 can update room config!
mgr.updateConfig(room, "player-2", { rounds: 7 });
assert.equal(room.config.rounds, 7);

// Rounds stay within 5–25 and the time to guess within 15–35 s.
mgr.updateConfig(room, "host-1", { rounds: 99, roundMs: 2000 });
assert.equal(room.config.rounds, 25);
assert.equal(room.config.roundMs, 15000);
mgr.updateConfig(room, "host-1", { rounds: 1, roundMs: 60000 });
assert.equal(room.config.rounds, 5);
assert.equal(room.config.roundMs, 35000);

// State reflects permissions
const stateP2 = mgr.publicState(room, "player-2");
assert.equal(stateP2.me.canEditConfig, true);
const p2Obj = stateP2.players.find((p) => p.id === "player-2");
assert.equal(p2Obj.canEditConfig, true);

// Host revokes permission from Player 2
const res2 = mgr.toggleConfigPermission(room, "host-1", "player-2");
assert.equal(res2.granted, false);
assert.equal(mgr.canEditConfig(room, "player-2"), false);

// Player 2 cannot configure anymore
assert.throws(() => {
  mgr.updateConfig(room, "player-2", { rounds: 3 });
}, /No tienes permisos/);

// Kicking: only the host, never themselves; the player loses their seat, permission and can't come back.
mgr.toggleConfigPermission(room, "host-1", "player-3");
assert.throws(() => mgr.kick(room, "player-2", "player-3"), /Solo el anfitrión/);
assert.throws(() => mgr.kick(room, "host-1", "host-1"), /a ti mismo/);
const kicked = mgr.kick(room, "host-1", "player-3");
assert.equal(kicked.socketId, "sock-3");
assert.equal(room.players.has("player-3"), false);
assert.equal(room.coHosts.includes("player-3"), false);
assert.equal(mgr.socketToRoom.has("sock-3"), false);
assert.throws(() => mgr.addPlayer(room, { ...player3, socketId: "sock-3b" }), /te sacó/);
assert.throws(() => mgr.kick(room, "host-1", "player-3"), /no está en la sala/);

console.log("roomPermissions.test ok");
