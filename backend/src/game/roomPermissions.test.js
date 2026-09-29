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

console.log("roomPermissions.test ok");
