import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { GroupManager } from "../game/groups.js";
import { RoomManager } from "../game/roomManager.js";
import { sampleQuestions } from "../questions/sampleQuestions.js";
import { attachSockets } from "./sockets.js";

// Groups and matches: a group is who goes together, a room is a match. Nobody has a group until they make one; its
// leader takes everyone into a private match of the group's or a public one (all in the same room), and back to Inicio.
const io = {
  use() {},
  // A socket's own id reaches that socket (what the server does with every connection); a room's broadcasts are kept apart.
  to: (target) => ({ emit: (event, payload) => io.sockets.sockets.get(target)?.got.push({ event, payload }) }),
  sockets: { sockets: new Map() },
  on(event, fn) {
    if (event === "connection") io.accept = fn;
  },
};
const store = { users: {} };
const rooms = new RoomManager({ catalog: readLocalCatalog(), store, questions: sampleQuestions() });
const groups = new GroupManager({ rooms, reconnectGraceMs: 30 });
attachSockets(io, rooms, { groups });

function connect(name) {
  const handlers = {};
  const socket = {
    id: `s-${name}`,
    data: { userId: `gst_${name}` },
    connected: true,
    got: [],
    on: (event, fn) => (handlers[event] = fn),
    onAny() {},
    join() {},
    leave() {},
    emit(event, payload) {
      socket.got.push({ event, payload });
    },
    timeout: () => ({ emitWithAck: async () => [] }),
    call: (event, ...args) => new Promise((resolve) => handlers[event](...args, resolve)),
    drop: () => handlers.disconnect(),
    // The last time this connection heard `event`.
    last: (event) => [...socket.got].reverse().find((e) => e.event === event)?.payload,
  };
  io.sockets.sockets.set(socket.id, socket);
  io.accept(socket);
  return socket;
}
const user = (name) => ({ user: { name } });
const roomOf = (socket) => rooms.get(rooms.socketToRoom.get(socket.id)?.code || "") || null;
const stopBots = () => {
  for (const room of rooms.rooms.values()) {
    clearTimeout(room.matchmaking?.botTimer);
    clearTimeout(room.matchmaking?.timer);
  }
};

const ana = connect("ana");
const beto = connect("beto");
const cami = connect("cami");

// Nobody has a group to begin with: Ana makes one, with what she was going to play.
const made = await ana.call("group:create", { ...user("Ana"), plan: { game: "opciones", audience: "publica" } });
assert.equal(made.ok, true);
const code = made.group.code;
assert.equal(made.group.leaderId, "gst_ana");
assert.deepEqual(made.group.plan, { game: "opciones", audience: "publica" });
assert.equal(made.group.place, null, "on Inicio");
assert.match((await ana.call("group:create", user("Ana"))).error, /Ya estás en un grupo/);

// Beto joins with the code (checked first); a wrong code says so.
assert.match((await beto.call("group:check", "ZZZZZ")).error, /No hay ningún grupo/);
assert.equal((await beto.call("group:check", code)).ok, true);
const joined = await beto.call("group:join", { ...user("Beto"), code });
assert.equal(joined.ok, true);
assert.equal(joined.room, null, "the group is on Inicio: so is he");
assert.equal(ana.last("group:state").members.length, 2, "Ana sees him come in");

// Only the leader decides.
assert.match((await beto.call("group:plan", { audience: "grupo" })).error, /Solo el líder/);
assert.match((await beto.call("match:find", { ...user("Beto"), kind: "casual", game: "opciones" })).error, /Solo el líder/);
assert.match((await beto.call("room:create", { ...user("Beto"), game: "opciones" })).error, /Solo el líder/);
assert.equal((await ana.call("group:plan", { audience: "grupo", game: "rey" })).group.plan.game, "rey");
// A public plan only has public games.
assert.equal((await ana.call("group:plan", { audience: "publica" })).group.plan.game, "opciones");

// A private match of the group's: Ana makes it and Beto is taken into it.
const priv = await ana.call("room:create", { ...user("Ana"), game: "rey" });
const room = rooms.get(priv.state.code);
assert.equal(room.groupCode, code);
assert.equal(room.hostId, "gst_ana", "the leader is its host");
assert.deepEqual([...room.players.keys()].sort(), ["gst_ana", "gst_beto"]);
assert.equal(beto.last("room:moved").code, room.code);
assert.equal(beto.last("room:moved").state.code, room.code);
assert.equal(rooms.publicState(room).groupCode, code, "the match shows the group's code, to invite more");
assert.deepEqual(ana.last("group:state").place, { code: room.code, public: false, game: "rey", own: true });

// Cami joins the group while it's in its match: straight into it.
const camiIn = await cami.call("group:join", { ...user("Cami"), code });
assert.equal(camiIn.room.code, room.code);
assert.ok(room.players.has("gst_cami"));

// Beto goes back to Inicio alone: still in the group, not with it; with the code again he's back in its match.
await beto.call("room:leave");
assert.equal(roomOf(beto), null);
assert.equal(ana.last("group:state").members.find((m) => m.id === "gst_beto").here, false);
assert.equal((await beto.call("group:join", { ...user("Beto"), code })).room.code, room.code);

// The leader and the host are the same person: passing one passes the other.
assert.equal((await ana.call("group:leader", "gst_beto")).ok, true);
assert.equal(room.hostId, "gst_beto");
assert.equal(groups.get(code).leaderId, "gst_beto");
assert.equal((await beto.call("room:giveHost", "gst_ana")).ok, true);
assert.equal(groups.get(code).leaderId, "gst_ana");

// Back to Inicio, all together: the match is gone with them.
assert.match((await beto.call("group:home", {})).error, /Solo el líder/);
assert.equal((await ana.call("group:home", { plan: { audience: "publica", game: "historia" } })).ok, true);
assert.equal(rooms.get(room.code), undefined);
for (const s of [ana, beto, cami]) assert.equal(roomOf(s), null);
assert.equal(beto.last("room:moved").code, null);
assert.deepEqual(groups.get(code).plan, { game: "historia", audience: "publica" });

// A public match: the three get seats in the same room, which a stranger can share.
const dani = connect("dani");
const alone = await dani.call("match:find", { ...user("Dani"), kind: "casual", game: "historia" });
stopBots();
const found = await ana.call("match:find", { ...user("Ana"), kind: "casual", game: "historia" });
stopBots();
const pub = rooms.get(found.state.code);
assert.equal(pub.code, alone.state.code, "the group sits with Dani");
assert.deepEqual([...pub.players.keys()].sort(), ["gst_ana", "gst_beto", "gst_cami", "gst_dani"]);
assert.equal(cami.last("room:moved").code, pub.code);
assert.equal(ana.last("group:state").place.public, true);
assert.equal(pub.groupCode, null, "nobody's group owns a public match");

// Cancelling the search takes the whole group out of it, but not Dani.
assert.equal((await ana.call("group:home", {})).ok, true);
assert.deepEqual([...pub.players.keys()], ["gst_dani"]);
assert.equal(groups.get(code).roomCode, null);

// Searching again; once it plays, the group can't leave until it's over; then "Buscar otra partida" takes everyone.
const again = rooms.get((await ana.call("match:find", { ...user("Ana"), kind: "casual", game: "historia" })).state.code);
stopBots();
assert.equal(again, pub);
rooms.addBot(again);
rooms.checkMatchFull(again);
stopBots();
rooms.startMatch(again);
clearTimeout(again.timer);
assert.match((await ana.call("group:home", {})).error, /Espera a que termine/);
rooms.finish(again);
clearTimeout(again.timer);
const next = rooms.get((await ana.call("match:find", { ...user("Ana"), kind: "casual", game: "historia" })).state.code);
stopBots();
assert.notEqual(next, again);
assert.deepEqual([...next.players.keys()].sort(), ["gst_ana", "gst_beto", "gst_cami"]);
assert.ok(again.players.has("gst_dani"), "Dani stays with his results");

// A group of six can't play in public: nobody moves.
const extra = ["eva", "fede", "gabi"].map(connect);
for (const s of extra) await s.call("group:join", { user: { name: s.id }, code });
const tooMany = await ana.call("match:find", { ...user("Ana"), kind: "casual", game: "historia" });
assert.match(tooMany.error, /5 como mucho y tu grupo es de 6/);
assert.ok(next.players.get("gst_beto")?.connected, "Beto is still where he was");

// The leader takes someone out (and out of the group's match), and someone leaves.
assert.equal((await ana.call("group:kick", { userId: "gst_gabi" })).ok, true);
assert.equal(extra[2].last("group:left").reason, "sacado");
assert.equal(groups.get(code).members.has("gst_gabi"), false);
assert.equal((await ana.call("group:kick", { userId: "gst_fede", block: true })).ok, true);
assert.match((await extra[1].call("group:join", { user: { name: "fede" }, code })).error, /te bloqueó/);
await extra[0].call("group:leave", {});
assert.equal(groups.get(code).members.has("gst_eva"), false);

// Without a group you play alone: a private match nobody else comes into.
const solo = await dani.call("room:create", { ...user("Dani"), game: "opciones" });
assert.equal(rooms.get(solo.state.code).groupCode, null);
assert.equal(rooms.publicState(rooms.get(solo.state.code)).groupCode, null);
// Making a group there makes it the group's match.
const danis = await dani.call("group:create", { ...user("Dani"), plan: { game: "opciones", audience: "grupo" } });
assert.equal(rooms.get(solo.state.code).groupCode, danis.group.code);
assert.equal(danis.group.place.own, true);
// Joining another group takes you out of yours (and of its match).
assert.equal((await dani.call("group:join", { ...user("Dani"), code })).room, null);
assert.equal(groups.get(danis.group.code), undefined, "nobody left in Dani's group");
assert.equal(groups.ofUser("gst_dani").code, code);

// Taken out of the group's private match by its host (the leader): out of the group too.
const lia = connect("lia");
const mati = connect("mati");
const theirs = (await lia.call("group:create", { ...user("Lía"), plan: { game: "opciones", audience: "grupo" } })).group.code;
await mati.call("group:join", { ...user("Mati"), code: theirs });
const match = rooms.get((await lia.call("room:create", { ...user("Lía"), game: "opciones" })).state.code);
assert.ok(match.players.has("gst_mati"));
assert.equal((await lia.call("room:kick", "gst_mati")).ok, true);
assert.equal(groups.get(theirs).members.has("gst_mati"), false);
assert.equal(mati.last("group:left").reason, "sacado");
// Leaving the group takes you out of its match too, but the last one keeps it as their own.
await lia.call("group:leave", {});
assert.equal(groups.get(theirs), undefined);
assert.ok(match.players.get("gst_lia")?.connected, "Lía plays alone now");
assert.equal(match.groupCode, null);

// A dropped connection keeps the place a while; past it, the player is out (the leader too: the next one leads).
ana.drop();
assert.equal(groups.get(code).leaderId, "gst_ana", "a reload changes nothing");
await new Promise((r) => setTimeout(r, 60));
assert.equal(groups.get(code).members.has("gst_ana"), false);
assert.notEqual(groups.get(code).leaderId, "gst_ana");
assert.ok(beto.last("group:state").leaderId !== "gst_ana", "the others hear it");

for (const r of [...rooms.rooms.values()]) rooms.destroy(r);
console.log("groups.test ok");
