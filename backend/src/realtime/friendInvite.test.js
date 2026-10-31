import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "../game/roomManager.js";
import { attachSockets } from "./sockets.js";

// Inviting a friend to your group: they get the group's code (friend:invited) if they're your friend and online; the
// same friend once every INVITE_GAP_MS.
const sent = [];
const io = {
  use() {},
  to: (target) => ({ emit: (event, payload) => sent.push({ target, event, payload }) }),
  sockets: { sockets: new Map() },
  on(event, fn) {
    if (event === "connection") io.accept = fn;
  },
};
const store = {
  users: {
    usr_ana: { id: "usr_ana", name: "Ana", avatar: "#f00", email: "a@x.com" },
    usr_luis: { id: "usr_luis", name: "Luis", avatar: "#0f0", email: "l@x.com" },
    usr_eva: { id: "usr_eva", name: "Eva", avatar: "#00f", email: "e@x.com" },
  },
};
const rooms = new RoomManager({ catalog: readLocalCatalog(), store });
const friends = { areFriends: (a, b) => [a, b].sort().join() === "usr_ana,usr_luis" };
const online = new Set(["usr_luis", "usr_eva"]);
const hub = { attach() {}, connect() {}, touch() {}, refresh() {}, isOnline: (id) => online.has(id), disconnect() {} };
attachSockets(io, rooms, { friends, hub });

function connect(id, userId) {
  const handlers = {};
  const socket = {
    id,
    data: { userId },
    connected: true,
    on: (event, fn) => (handlers[event] = fn),
    onAny() {},
    join() {},
    leave() {},
    emit() {},
    timeout: () => ({ emitWithAck: async () => [] }),
    call: (event, payload) => new Promise((resolve) => handlers[event](payload, resolve)),
  };
  io.accept(socket);
  return socket;
}

const ana = connect("s-ana", "usr_ana");
// Not in a group yet.
assert.match((await ana.call("friend:invite", { friendId: "usr_luis" })).error, /Crea una sala/);
const code = (await ana.call("group:create", { user: { name: "Ana", avatar: "#f00" }, plan: { game: "opciones", audience: "publica" } })).group.code;

// Not a friend: no.
assert.match((await ana.call("friend:invite", { friendId: "usr_eva" })).error, /no es tu amiga/);
// A friend offline: no.
online.delete("usr_luis");
assert.match((await ana.call("friend:invite", { friendId: "usr_luis" })).error, /no está conectado/);
online.add("usr_luis");

// Luis gets the group's code, who invites him and the game.
assert.equal((await ana.call("friend:invite", { friendId: "usr_luis" })).ok, true);
const invite = sent.find((e) => e.event === "friend:invited");
assert.deepEqual(invite, { target: "user:usr_luis", event: "friend:invited", payload: { code, fromName: "Ana", fromAvatar: "#f00", game: "opciones" } });
// Again right away: wait.
assert.match((await ana.call("friend:invite", { friendId: "usr_luis" })).error, /espera/);

// Already in the group: nothing to invite.
const luis = connect("s-luis", "usr_luis");
assert.equal((await luis.call("group:join", { user: { name: "Luis", avatar: "#0f0" }, code })).ok, true);
assert.match((await ana.call("friend:invite", { friendId: "usr_luis" })).error, /Ya está en tu sala/);

for (const r of [...rooms.rooms.values()]) rooms.destroy(r);
console.log("friendInvite.test ok");
