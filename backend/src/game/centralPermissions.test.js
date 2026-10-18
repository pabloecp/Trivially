import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// Who can make a player's screen the room's central device: the host or a player with the settings permission, on any
// player, themselves too. The host's own screen passes the host role to the next connected player first.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const room = mgr.create({ host: { id: "h", name: "Host", socketId: "sh" }, game: "opciones" });
mgr.addPlayer(room, { id: "a", name: "Ana", socketId: "sa" });
mgr.addPlayer(room, { id: "b", name: "Beto", socketId: "sb" });

// Without the permission: no.
assert.throws(() => mgr.makeCentral(room, "a", "b"), /permiso/);
// With it, Ana picks her own screen.
mgr.toggleConfigPermission(room, "h", "a");
mgr.makeCentral(room, "a", "a");
assert.equal(room.central.userId, "a");
assert.equal(room.players.has("a"), false);
// The host takes it off (an editor could too) and Ana plays again.
mgr.removeCentral(room, "h");
assert.equal(room.players.has("a"), true);

// The host picks their own screen: the host role passes on first.
mgr.makeCentral(room, "h", "h");
assert.equal(room.central.userId, "h");
assert.notEqual(room.hostId, "h");
assert.ok(room.players.has(room.hostId), "a player still in the room is the host now");

// Alone in a room, the host can't: nobody would run the match.
const alone = mgr.create({ host: { id: "x", name: "Solo", socketId: "sx" }, game: "opciones" });
assert.throws(() => mgr.makeCentral(alone, "x", "x"), /otro jugador/);

for (const r of [...mgr.rooms.values()]) mgr.destroy(r);
console.log("centralPermissions.test ok");
