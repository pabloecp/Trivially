import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "../game/roomManager.js";
import { attachSockets } from "./sockets.js";

// A stand-in for Socket.IO: enough of a server and its sockets to run the real handlers. Each socket keeps what the
// server sent it only (`events`) and the rooms it joined.
const sockets = new Map();
const io = {
  use() {},
  to: () => ({ emit() {} }),
  sockets: { sockets },
  on(event, fn) {
    if (event === "connection") io.accept = fn;
  },
};
const rooms = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} }, reconnectGraceMs: 30 });
attachSockets(io, rooms);

function connect(id, userId) {
  const handlers = {};
  const socket = {
    id,
    data: { userId },
    connected: true,
    joined: new Set(),
    events: [],
    on: (event, fn) => (handlers[event] = fn),
    join: (code) => socket.joined.add(code),
    leave: (code) => socket.joined.delete(code),
    emit: (event, payload) => socket.events.push({ event, payload }),
    timeout() {
      return { emitWithAck: async () => [] };
    },
    call: (event, payload) =>
      new Promise((resolve) => (payload === undefined ? handlers[event](resolve) : handlers[event](payload, resolve))),
    fire: (event) => handlers[event]?.(),
    lastRole: () => [...socket.events].reverse().find((e) => e.event === "room:role")?.payload,
  };
  sockets.set(id, socket);
  io.accept(socket);
  return socket;
}
const me = (name) => ({ name, avatar: "#fff" });

// Ana hosts from her phone; Luis and Eva join.
const anaPhone = connect("ana-phone", "usr_ana");
const code = (await anaPhone.call("room:create", { user: me("Ana"), game: "opciones" })).state.code;
const room = rooms.get(code);
const luisPhone = connect("luis-phone", "usr_luis");
await luisPhone.call("room:join", { user: me("Luis"), code });
const evaLaptop = connect("eva-laptop", "usr_eva");
await evaLaptop.call("room:join", { user: me("Eva"), code });
assert.equal(room.players.size, 3);
assert.equal(rooms.publicState(room).central, null);

// --- The host drags a player onto the spot ---
// A player without the settings permission can't (who may, and the host's own screen: centralPermissions.test.js).
assert.equal((await luisPhone.call("room:makeCentral", "usr_eva")).ok, false);

// Eva's laptop becomes the central device: her seat goes, and the laptop hears it with the room.
const made = await anaPhone.call("room:makeCentral", "usr_eva");
assert.equal(made.ok, true);
assert.equal(room.players.has("usr_eva"), false);
assert.equal(room.central.socketId, "eva-laptop");
assert.deepEqual(rooms.socketToRoom.get("eva-laptop"), { code, userId: "usr_eva", central: true });
assert.equal(evaLaptop.lastRole().role, "central");
assert.equal(evaLaptop.lastRole().state.code, code);
assert.deepEqual(made.state.central, { userId: "usr_eva", name: "Eva", avatar: "#FFFFFF", connected: true });

// The central device only shows the match: nothing it sends is taken.
const fromCentral = await evaLaptop.call("room:suggest", "opciones");
assert.equal(fromCentral.ok, false);
assert.match(fromCentral.error, /dispositivo central/);
assert.equal((await evaLaptop.call("room:start")).ok, false);
assert.equal(room.phase, "lobby");

// A reload of the central device puts it back (with the "central" flag), never as a player.
evaLaptop.fire("disconnect");
assert.equal(room.central.connected, false);
assert.equal(rooms.publicState(room).central.connected, false);
const evaReload = connect("eva-laptop-2", "usr_eva");
const back = await evaReload.call("room:join", { user: me("Eva"), code, central: true });
assert.equal(back.ok, true);
assert.equal(back.role, "central");
assert.equal(room.central.socketId, "eva-laptop-2");
assert.equal(room.central.connected, true);
assert.equal(room.players.has("usr_eva"), false);

// Taken off the spot, Eva's laptop plays again: her account has no other seat in the room.
const removed = await anaPhone.call("room:removeCentral");
assert.equal(removed.ok, true);
assert.equal(room.central, null);
assert.equal(room.players.get("usr_eva").socketId, "eva-laptop-2");
assert.equal(evaReload.lastRole().role, "player");
assert.equal(evaReload.lastRole().state.me.id, "usr_eva");

// --- The host opens the room on another device with the same account ---
const anaTv = connect("ana-tv", "usr_ana");
const offer = await anaTv.call("room:join", { user: me("Ana"), code });
assert.equal(offer.ok, false);
assert.equal(offer.sameRoom, true);
assert.equal(offer.isHost, true);
const tv = await anaTv.call("room:joinCentral", { user: me("Ana"), code });
assert.equal(tv.ok, true);
assert.equal(tv.role, "central");
assert.equal(room.central.socketId, "ana-tv");
// Her phone is still the host and still plays; the TV can't act as the host.
assert.equal(room.players.get("usr_ana").socketId, "ana-phone");
assert.equal((await anaTv.call("room:start")).ok, false);
assert.equal(room.phase, "lobby");

// --- Another player asks for it, and the host decides ---
const luisTv = connect("luis-tv", "usr_luis");
const luisOffer = await luisTv.call("room:join", { user: me("Luis"), code });
assert.equal(luisOffer.sameRoom, true);
assert.equal(luisOffer.isHost, false);
assert.equal(luisOffer.hostName, "Ana");
// Luis can't take it straight away.
assert.equal((await luisTv.call("room:joinCentral", { user: me("Luis"), code })).ok, false);
const asked = await luisTv.call("room:requestCentral", { user: me("Luis"), code });
assert.equal(asked.ok, true);
assert.deepEqual(
  rooms.publicState(room).centralRequests.map((r) => r.name),
  ["Luis"]
);
// Asking again right away is too soon.
assert.equal((await luisTv.call("room:requestCentral", { user: me("Luis"), code })).ok, false);

// Turned down: Luis's TV hears it, and the request is gone.
assert.equal((await luisPhone.call("room:centralAnswer", { id: asked.requestId, accept: true })).ok, false);
const no = await anaPhone.call("room:centralAnswer", { id: asked.requestId, accept: false });
assert.equal(no.ok, true);
assert.equal(no.accepted, false);
assert.equal(luisTv.lastRole().role, null);
assert.match(luisTv.lastRole().notice, /no aceptó/);
assert.equal(rooms.publicState(room).centralRequests.length, 0);

// Asked again later and accepted: it takes the TV's place, and Ana's TV (her account plays on her phone) leaves.
room.players.get("usr_luis").centralAskedAt = 0;
const again = await luisTv.call("room:requestCentral", { user: me("Luis"), code });
const yes = await anaPhone.call("room:centralAnswer", { id: again.requestId, accept: true });
assert.equal(yes.accepted, true);
assert.equal(room.central.socketId, "luis-tv");
assert.equal(luisTv.lastRole().role, "central");
assert.equal(anaTv.lastRole().role, null);
assert.equal(rooms.socketToRoom.has("ana-tv"), false);
assert.equal(room.players.get("usr_luis").socketId, "luis-phone");

// A request whose device closes goes away.
room.players.get("usr_eva").centralAskedAt = 0;
const evaTablet = connect("eva-tablet", "usr_eva");
await evaTablet.call("room:requestCentral", { user: me("Eva"), code });
assert.equal(room.centralRequests.length, 1);
evaTablet.fire("disconnect");
assert.equal(room.centralRequests.length, 0);

// The central device isn't a seat: the room still starts with the players, and a match never waits for it.
assert.equal((await anaPhone.call("room:start")).ok, true);
assert.equal(room.participants.has("usr_luis"), true);
assert.equal(room.participants.size, 3);
// Mid-match a player can't be dragged onto the spot.
assert.equal((await anaPhone.call("room:makeCentral", "usr_eva")).ok, false);

// When the room closes, the central device hears it.
await luisPhone.call("room:leave");
await evaReload.call("room:leave");
await anaPhone.call("room:leave");
assert.equal(rooms.get(code), undefined);
assert.equal(luisTv.lastRole().role, null);
assert.match(luisTv.lastRole().notice, /se cerró/);

// A dropped central device that doesn't come back in time leaves its place empty.
const hostB = connect("b-host", "usr_b");
const codeB = (await hostB.call("room:create", { user: me("Bea"), game: null })).state.code;
const roomB = rooms.get(codeB);
const bTv = connect("b-tv", "usr_b");
await bTv.call("room:joinCentral", { user: me("Bea"), code: codeB });
assert.equal(roomB.central.socketId, "b-tv");
bTv.fire("disconnect");
await new Promise((resolve) => setTimeout(resolve, 60));
assert.equal(roomB.central, null);
// It can't come back as the central any more.
const late = connect("b-tv-2", "usr_b");
assert.equal((await late.call("room:join", { user: me("Bea"), code: codeB, central: true })).ok, false);

for (const c of [...rooms.rooms.keys()]) rooms.destroy(rooms.get(c));
console.log("centralDevice.test ok");
