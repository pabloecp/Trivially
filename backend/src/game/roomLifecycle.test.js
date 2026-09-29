import assert from "node:assert/strict";
import { RoomManager } from "./roomManager.js";

const fakeCatalog = { songs: [], artists: [], albums: [], genres: [], playlists: [] };
const mgr = new RoomManager({ catalog: fakeCatalog, store: {}, reconnectGraceMs: 20 });
const broadcasts = [];
mgr.onPhaseChange = (room) => broadcasts.push(room.code);

const host = { id: "host-1", name: "HostUser", avatar: "#FF0000", socketId: "sock-1" };
const guest = { id: "guest-2", name: "GuestUser", avatar: "#00FF00", socketId: "sock-2" };

// A party starts on the Home screen, with no game picked
const room = mgr.create({ host });
mgr.addPlayer(room, guest);
assert.equal(room.game, null);
assert.equal(mgr.publicState(room).game, null);
assert.throws(() => mgr.start(room, "host-1"), /Elige un juego/);

// Only the host moves the room, and only into known games
assert.throws(() => mgr.setGame(room, "guest-2", "musica"), /Solo el Host/);
assert.throws(() => mgr.setGame(room, "host-1", "ajedrez"), /no está disponible/);
mgr.setGame(room, "host-1", "musica");
assert.equal(room.game, "musica");
assert.equal(room.phase, "lobby");
assert.equal(mgr.publicState(room).game, "musica");

// Sending everyone back Home abandons the match in progress
room.phase = "playing";
room.players.get("guest-2").score = 500;
mgr.setGame(room, "host-1", null);
assert.equal(room.game, null);
assert.equal(room.phase, "lobby");
assert.equal(room.players.get("guest-2").score, 0);

// A dropped connection keeps the seat and the host role during the grace period
mgr.disconnect("sock-1");
assert.equal(room.players.get("host-1").connected, false);
assert.equal(room.hostId, "host-1");
mgr.addPlayer(room, { ...host, socketId: "sock-1b" });
assert.equal(room.players.get("host-1").connected, true);
assert.equal(room.hostId, "host-1");

// Rejoining from a new socket before the old one closes: the old one closing later doesn't kick the player
mgr.addPlayer(room, { ...guest, socketId: "sock-2b" });
assert.equal(mgr.disconnect("sock-2"), null);
assert.equal(room.players.get("guest-2").connected, true);

// After the grace period the player is removed and the host role moves on
mgr.disconnect("sock-1b");
await new Promise((resolve) => setTimeout(resolve, 60));
assert.equal(room.players.has("host-1"), false);
assert.equal(room.hostId, "guest-2");
assert.ok(broadcasts.includes(room.code));

// Players who left mid-match are cleared out when the room goes back to a lobby
const room2 = mgr.create({ host, game: "musica" });
mgr.addPlayer(room2, { ...guest, socketId: "sock-3" });
room2.phase = "playing";
mgr.leave("sock-3");
assert.equal(room2.players.get("guest-2").connected, false);
mgr.restart(room2, "host-1");
assert.equal(room2.players.has("guest-2"), false);

// The last connected player leaving closes the room
mgr.leave("sock-2b");
assert.equal(mgr.get(room.code), undefined);

console.log("roomLifecycle.test ok");
