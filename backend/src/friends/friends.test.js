import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// The friendships file of the test, never the real one.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-"));
process.env.FRIENDS_FILE = path.join(dir, "friends.json");

const { Friendships, FRIEND_LIMITS } = await import("./friendships.js");
const { friendCodeOf, normalizeFriendCode, userByFriendCode } = await import("./friendCode.js");
const { FriendsHub } = await import("./friendsHub.js");
const { RoomManager, JOIN_ASK_GAP_MS } = await import("../game/roomManager.js");
const { readLocalCatalog } = await import("../catalog/catalogProvider.js");

const store = {
  users: {
    ana: { id: "ana", name: "Ana", isGuest: false },
    beto: { id: "beto", name: "Beto", isGuest: false },
    cami: { id: "cami", name: "Cami", isGuest: false },
    gst_x: { id: "gst_x", name: "Invitado", isGuest: true },
  },
};
const friends = new Friendships({ store, local: true });

// Friend codes: accounts have one, stable, findable in any spelling; guests have none.
const code = friendCodeOf(store, "ana");
assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
assert.equal(friendCodeOf(store, "ana"), code);
assert.equal(friendCodeOf(store, "gst_x"), null);
assert.equal(userByFriendCode(store, code.toLowerCase().replace("-", " ")).id, "ana");
assert.equal(normalizeFriendCode("abc"), null);
assert.equal(userByFriendCode(store, "AAAA-AAAA"), null);

// A request by code: pending until the other accepts; the one who asked can't accept their own.
assert.equal(friends.requestByCode("beto", code).status, "pending");
assert.deepEqual(friends.incoming("ana"), ["beto"]);
assert.deepEqual(friends.outgoing("beto"), ["ana"]);
assert.throws(() => friends.requestByCode("beto", code), /Ya le enviaste/);
assert.throws(() => friends.accept("beto", "ana"), /No hay una solicitud/);
friends.accept("ana", "beto");
assert.ok(friends.areFriends("ana", "beto") && friends.areFriends("beto", "ana"));
assert.throws(() => friends.requestByCode("beto", code), /Ya son amigos/);

// Not yourself, not guests, not made-up codes.
assert.throws(() => friends.requestByCode("ana", code), /propio código/);
assert.throws(() => friends.request("gst_x", "ana"), /cuenta/);
assert.throws(() => friends.request("ana", "gst_x"), /No encontramos/);
assert.throws(() => friends.requestByCode("ana", "ZZZZ-ZZZZ"), /No encontramos ese código/);

// Both asking each other at once makes them friends.
const camiCode = friendCodeOf(store, "cami");
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
for (let i = 0; i < FRIEND_LIMITS.asksPerMinute - 1; i += 1) {
  assert.throws(() => friends.requestByCode("dani", "ZZZZ-ZZZZ"), /No encontramos/);
}
assert.throws(() => friends.requestByCode("dani", camiCode), /muchas solicitudes/);

// A deleted account takes its friendships with it.
assert.deepEqual(friends.removeAllOf("cami"), ["ana"]);
assert.deepEqual(friends.friendsOf("ana"), []);

// ---- What the friends tab shows, and what a friend can do about a room ----
friends.request("beto", "ana");
friends.accept("ana", "beto");
const mgr = new RoomManager({ catalog: readLocalCatalog(), store, questions: [] });
const hub = new FriendsHub({ store, friends, rooms: mgr });
let view = hub.view("beto");
assert.equal(view.friends[0].id, "ana");
assert.equal(view.friends[0].online, false);
assert.equal(view.friends[0].room, null);
assert.equal(view.code, friendCodeOf(store, "beto"));

const room = mgr.create({ host: { id: "ana", name: "Ana", socketId: "s1" }, mode: "multi", game: null });
view = hub.view("beto");
assert.equal(view.friends[0].online, true, "someone in a room is online");
assert.equal(view.friends[0].room.joinMode, "solicitud", "the default is asking the host");
assert.equal(view.friends[0].room.hostName, "Ana");
assert.equal("code" in view.friends[0].room, false, "the room's code is never in the friends tab");

// Only the host changes what friends can do, and only to a known option.
assert.throws(() => mgr.setJoinMode(room, "beto", "abierta"), /Solo el Host/);
assert.throws(() => mgr.setJoinMode(room, "ana", "todos"), /no existe/);

// "solicitud": the friend asks, the host answers, and it can't be repeated right away.
const now = Date.now();
mgr.addJoinRequest(room, { id: "beto", name: "Beto" }, now);
assert.equal(mgr.publicState(room).joinRequests.length, 1);
assert.equal(hub.view("beto").friends[0].room.requested, true);
assert.throws(() => mgr.addJoinRequest(room, { id: "beto", name: "Beto" }, now + 1000), /Espera/);
assert.throws(() => mgr.answerJoinRequest(room, "beto", "beto"), /Solo el Host/);
assert.equal(mgr.answerJoinRequest(room, "ana", "beto").userId, "beto");
assert.equal(mgr.publicState(room).joinRequests.length, 0);
assert.throws(() => mgr.answerJoinRequest(room, "ana", "beto"), /ya no está/);
// After the wait he can ask again; once in the room, his request is gone.
mgr.addJoinRequest(room, { id: "beto", name: "Beto" }, now + JOIN_ASK_GAP_MS + 1);
assert.equal(mgr.openJoinRequests(room).length, 1);
mgr.addPlayer(room, { id: "beto", name: "Beto", socketId: "s2" });
assert.equal(mgr.openJoinRequests(room).length, 0);
mgr.leave("s2");

// "abierta" and "invitacion" take no requests.
mgr.setJoinMode(room, "ana", "abierta");
assert.throws(() => mgr.addJoinRequest(room, { id: "beto", name: "Beto" }), /no recibe solicitudes/);
mgr.setJoinMode(room, "ana", "invitacion");
assert.equal(hub.view("beto").friends[0].room.joinMode, "invitacion");
assert.throws(() => mgr.addJoinRequest(room, { id: "beto", name: "Beto" }), /no recibe solicitudes/);
assert.equal(mgr.roomOfUser("ana"), room);
assert.equal(mgr.roomOfUser("cami"), null);

// Requests expire.
mgr.setJoinMode(room, "ana", "solicitud");
mgr.addJoinRequest(room, { id: "cami", name: "Cami" }, Date.now() - 61000);
assert.equal(mgr.openJoinRequests(room).length, 0);

console.log("friends.test ok");
