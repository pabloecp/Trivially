import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// The friendships file of the test, never the real one.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-"));
process.env.FRIENDS_FILE = path.join(dir, "friends.json");

const { Friendships, FRIEND_LIMITS } = await import("./friendships.js");

const { FriendsHub } = await import("./friendsHub.js");
const { RoomManager } = await import("../game/roomManager.js");
const { GroupManager, JOIN_ASK_GAP_MS } = await import("../game/groups.js");
const { readLocalCatalog } = await import("../catalog/catalogProvider.js");

const store = {
  users: {
    ana: { id: "ana", name: "Ana", username: "ana_gamer", isGuest: false },
    beto: { id: "beto", name: "Beto", username: "beto", isGuest: false },
    cami: { id: "cami", name: "Cami", username: "cami", isGuest: false },
    gst_x: { id: "gst_x", name: "Invitado", isGuest: true },
  },
};
const friends = new Friendships({ store, local: true });

// A request by username (any case, with or without @): pending until the other accepts; the one who asked can't
// accept their own.
assert.equal(friends.requestByUsername("beto", "@Ana_Gamer").status, "pending");
assert.deepEqual(friends.incoming("ana"), ["beto"]);
assert.deepEqual(friends.outgoing("beto"), ["ana"]);
assert.throws(() => friends.requestByUsername("beto", "ana_gamer"), /Ya le enviaste/);
assert.throws(() => friends.accept("beto", "ana"), /No hay una solicitud/);
friends.accept("ana", "beto");
assert.ok(friends.areFriends("ana", "beto") && friends.areFriends("beto", "ana"));
assert.throws(() => friends.requestByUsername("beto", "ana_gamer"), /Ya son amigos/);

// Not yourself, not guests, not made-up codes.
assert.throws(() => friends.requestByUsername("ana", "ana_gamer"), /propio/);
assert.throws(() => friends.request("gst_x", "ana"), /cuenta/);
assert.throws(() => friends.request("ana", "gst_x"), /No encontramos/);
assert.throws(() => friends.requestByUsername("ana", "nadie_asi"), /No encontramos a nadie/);
assert.equal(friends.relation("ana", "ana"), "self");

// Both asking each other at once makes them friends.
friends.request("ana", "cami");
assert.equal(friends.request("cami", "ana"), "accepted");
assert.deepEqual(friends.friendsOf("ana").sort(), ["beto", "cami"]);

// It is kept: a new service reads the same file.
const again = new Friendships({ store, local: true });
await again.init();
assert.ok(again.areFriends("ana", "beto"));

// Declining or cancelling removes the request; removing a friend ends it for both.
const dani = { id: "dani", name: "Dani", isGuest: false };
store.users.dani = dani;
friends.request("dani", "ana");
friends.remove("ana", "dani");
assert.equal(friends.get("ana", "dani"), null);
friends.remove("beto", "ana");
assert.equal(friends.areFriends("ana", "beto"), false);
assert.throws(() => friends.remove("beto", "ana"), /No son amigos/);

// Limits: too many requests in a minute.
store.users.cami2 = { id: "cami2", name: "Cami2", username: "cami2", isGuest: false };
for (let i = 0; i < FRIEND_LIMITS.asksPerMinute; i += 1) {
  store.users[`u${i}`] = { id: `u${i}`, name: `U${i}`, username: `usuario_${i}`, isGuest: false };
}
// (Dani already asked once above.)
for (let i = 0; i < FRIEND_LIMITS.asksPerMinute - 1; i += 1) friends.requestByUsername("dani", `usuario_${i}`);
assert.throws(() => friends.requestByUsername("dani", "cami2"), /muchas solicitudes/);
for (let i = 0; i < FRIEND_LIMITS.asksPerMinute - 1; i += 1) friends.remove("dani", `u${i}`);
for (let i = 0; i < FRIEND_LIMITS.searchesPerMinute; i += 1) friends.assertCanSearch("dani");
assert.throws(() => friends.assertCanSearch("dani"), /buscando muy rápido/);

// A deleted account takes its friendships with it.
assert.deepEqual(friends.removeAllOf("cami"), ["ana"]);
assert.deepEqual(friends.friendsOf("ana"), []);

// ---- What the friends tab shows, and what a friend can do about a group ----
friends.request("beto", "ana");
friends.accept("ana", "beto");
const mgr = new RoomManager({ catalog: readLocalCatalog(), store, questions: [] });
const groups = new GroupManager({ rooms: mgr });
const hub = new FriendsHub({ store, friends, rooms: mgr, groups });
let view = hub.view("beto");
assert.equal(view.friends[0].id, "ana");
assert.equal(view.friends[0].online, false);
assert.equal(view.friends[0].room, null);
assert.equal(view.username, "beto");
assert.equal(view.friends[0].username, "ana_gamer");

const group = groups.create({ id: "ana", name: "Ana", socketId: "s1" }, { game: "opciones", audience: "publica" });
view = hub.view("beto");
assert.equal(view.friends[0].online, true, "someone in a group is online");
assert.equal(view.friends[0].room.group, true);
assert.equal(view.friends[0].room.inRoom, false, "the group is on Inicio");
assert.equal(view.friends[0].room.joinMode, "solicitud", "the default is asking the leader");
assert.equal(view.friends[0].room.hostName, "Ana");
assert.equal(view.friends[0].room.players, 1);
assert.equal("code" in view.friends[0].room, false, "the group's code is never in the friends tab");

// Only the leader changes what friends can do, and only to a known option.
assert.throws(() => groups.setJoinMode(group, "beto", "abierta"), /Solo el líder/);
assert.throws(() => groups.setJoinMode(group, "ana", "todos"), /no existe/);

// "solicitud": the friend asks, the leader answers, and it can't be repeated right away.
const now = Date.now();
groups.addJoinRequest(group, { id: "beto", name: "Beto" }, now);
assert.equal(groups.publicGroup(group).joinRequests.length, 1);
assert.equal(hub.view("beto").friends[0].room.requested, true);
assert.throws(() => groups.addJoinRequest(group, { id: "beto", name: "Beto" }, now + 1000), /Espera/);
assert.throws(() => groups.answerJoinRequest(group, "beto", "beto"), /Solo el líder/);
assert.equal(groups.answerJoinRequest(group, "ana", "beto").userId, "beto");
assert.equal(groups.publicGroup(group).joinRequests.length, 0);
assert.throws(() => groups.answerJoinRequest(group, "ana", "beto"), /ya no está/);
// After the wait he can ask again; once in the group, his request is gone.
groups.addJoinRequest(group, { id: "beto", name: "Beto" }, now + JOIN_ASK_GAP_MS + 1);
assert.equal(groups.openJoinRequests(group).length, 1);
groups.join(group, { id: "beto", name: "Beto", socketId: "s2" });
assert.equal(groups.openJoinRequests(group).length, 0);
groups.removeMember(group, "beto");

// "abierta" and "invitacion" take no requests.
groups.setJoinMode(group, "ana", "abierta");
assert.throws(() => groups.addJoinRequest(group, { id: "beto", name: "Beto" }), /no recibe solicitudes/);
groups.setJoinMode(group, "ana", "invitacion");
assert.equal(hub.view("beto").friends[0].room.joinMode, "invitacion");
assert.throws(() => groups.addJoinRequest(group, { id: "beto", name: "Beto" }), /no recibe solicitudes/);
assert.equal(groups.ofUser("ana"), group);
assert.equal(groups.ofUser("cami"), null);

// Requests expire.
groups.setJoinMode(group, "ana", "solicitud");
groups.addJoinRequest(group, { id: "cami", name: "Cami" }, Date.now() - 61000);
assert.equal(groups.openJoinRequests(group).length, 0);

// A friend playing alone (a match of their own, no group): where they are, but nothing to join.
groups.removeMember(group, "ana");
assert.equal(groups.get(group.code), undefined, "the last one out: no group");
const room = mgr.create({ host: { id: "ana", name: "Ana", socketId: "s1" }, mode: "multi", game: "opciones" });
view = hub.view("beto");
assert.equal(view.friends[0].room.group, false);
assert.equal(view.friends[0].room.inRoom, true);
assert.equal(mgr.roomOfUser("ana"), room);
assert.equal(mgr.roomOfUser("cami"), null);
mgr.destroy(room);

console.log("friends.test ok");
