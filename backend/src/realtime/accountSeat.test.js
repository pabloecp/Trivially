import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "../game/roomManager.js";
import { attachSockets } from "./sockets.js";

// A stand-in for Socket.IO: enough of a server and its sockets to run the real handlers.
const sockets = new Map();
const io = {
  use() {},
  to: () => ({ emit() {} }),
  sockets: { sockets },
  on(event, fn) {
    if (event === "connection") io.accept = fn;
  },
};
const rooms = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
attachSockets(io, rooms);

// `pingAnswered`: whether the tab answers the server's "room:ping" (false = a connection that dropped silently).
function connect(id, userId, pingAnswered = true) {
  const handlers = {};
  const socket = {
    id,
    data: { userId },
    connected: true,
    pingAnswered,
    on: (event, fn) => (handlers[event] = fn),
    join() {},
    leave() {},
    timeout() {
      return { emitWithAck: async () => (socket.pingAnswered ? [] : Promise.reject(new Error("timeout"))) };
    },
    // Events without a payload take the ack as their only argument.
    call: (event, payload) =>
      new Promise((resolve) => (payload === undefined ? handlers[event](resolve) : handlers[event](payload, resolve))),
  };
  sockets.set(id, socket);
  io.accept(socket);
  return socket;
}
const me = (name) => ({ name, avatar: "#fff" });

// The first tab creates a room.
const tabA = connect("a1", "usr_1");
const created = await tabA.call("room:create", { user: me("Ana"), game: null });
assert.equal(created.ok, true);
const code = created.state.code;

// A second tab of the same account can neither join that room nor start another one. Joining the same room says so,
// and that it may be the room's central device (straight away: it's the host's account).
const tabB = connect("b1", "usr_1");
const joinSame = await tabB.call("room:join", { user: me("Ana"), code });
assert.equal(joinSame.ok, false);
assert.equal(joinSame.busy, true);
assert.equal(joinSame.sameRoom, true);
assert.equal(joinSame.isHost, true);
assert.match(joinSame.error, /Ya estás jugando en esta sala/);
const createAgain = await tabB.call("room:create", { user: me("Ana"), game: null });
assert.equal(createAgain.ok, false);
assert.equal(createAgain.busy, true);
assert.equal(rooms.rooms.size, 1);
assert.equal(rooms.get(code).players.get("usr_1").socketId, "a1");

// Someone else's account joins as always.
const other = connect("c1", "usr_2");
assert.equal((await other.call("room:join", { user: me("Luis"), code })).ok, true);

// The tab that is already in can reload / reconnect on the same connection without being blocked by itself.
assert.equal((await tabA.call("room:join", { user: me("Ana"), code })).ok, true);

// A connection that stopped answering (a dropped one the server hasn't noticed) gives the seat to the new one.
tabA.pingAnswered = false;
const takeover = await tabB.call("room:join", { user: me("Ana"), code });
assert.equal(takeover.ok, true);
assert.equal(rooms.get(code).players.get("usr_1").socketId, "b1");

// A connection that is already closed doesn't block either.
const tabC = connect("d1", "usr_3");
const roomC = (await tabC.call("room:create", { user: me("Eva"), game: null })).state.code;
tabC.connected = false;
const tabD = connect("e1", "usr_3");
assert.equal((await tabD.call("room:join", { user: me("Eva"), code: roomC })).ok, true);

// Once the account has left its room, it can enter another one.
await tabD.call("room:leave");
const tabE = connect("f1", "usr_3");
assert.equal((await tabE.call("room:create", { user: me("Eva"), game: null })).ok, true);

for (const code of [...rooms.rooms.keys()]) rooms.destroy(rooms.get(code));
console.log("accountSeat.test ok");
