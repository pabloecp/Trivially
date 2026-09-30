import assert from "node:assert/strict";
import { effectiveRole, hasRole } from "./roles.js";
import { claimGuestStats, listUsers, registerWithPassword, sanitizeUser, setUserRole } from "../db/store.js";

const store = { users: {} };

const owner = registerWithPassword(store, { name: "Boss", email: "boss@trivially.test", password: "pw" });
const admin = registerWithPassword(store, { name: "Admin", email: "admin@trivially.test", password: "pw" });
const alice = registerWithPassword(store, { name: "Alice", email: "alice@trivially.test", password: "pw" });
const bob = registerWithPassword(store, { name: "Bob", email: "bob@trivially.test", password: "pw" });

// New accounts are plain users; OWNER_IDS makes the owner (by id, not by name or email).
assert.equal(owner.role, "user");
process.env.OWNER_IDS = `usr_unrelated, ${owner.id}`;
assert.equal(sanitizeUser(store.users[owner.id]).role, "owner");
assert.equal(alice.role, "user");
assert.equal(effectiveRole({ id: "usr_x", email: "boss@trivially.test" }), "user", "email alone is not enough");

// Every account gets its own id.
const ids = Object.keys(store.users);
assert.equal(new Set(ids).size, ids.length);
assert.ok(ids.every((id) => /^usr_\d+_[0-9a-f]+$/.test(id)));
assert.equal(effectiveRole({ isGuest: true, role: "admin" }), "user", "guests never have a role");
assert.equal(effectiveRole({ email: "x@y.z", role: "owner" }), "admin", "owner only comes from OWNER_IDS");

// Plain users can't change roles.
assert.throws(() => setUserRole(store, alice.id, bob.id, "moderator"), /permiso/);

// Owner promotes an admin; the admin manages users/moderators but not admins or the owner.
assert.equal(setUserRole(store, owner.id, admin.id, "admin").role, "admin");
assert.equal(setUserRole(store, admin.id, alice.id, "moderator").role, "moderator");
assert.equal(setUserRole(store, admin.id, alice.id, "user").role, "user");
assert.throws(() => setUserRole(store, admin.id, bob.id, "admin"), /igual o superior/);
assert.throws(() => setUserRole(store, admin.id, owner.id, "user"), /mismo rango o superior/);
assert.throws(() => setUserRole(store, admin.id, admin.id, "user"), /propio rol/);
assert.throws(() => setUserRole(store, owner.id, bob.id, "owner"), /configuración del servidor/);
assert.throws(() => setUserRole(store, owner.id, bob.id, "superuser"), /no válido/);

assert.ok(hasRole(store.users[admin.id], "moderator"));
assert.ok(!hasRole(store.users[bob.id], "moderator"));

// Role is part of the sanitized user and the admin list.
assert.equal(sanitizeUser(store.users[admin.id]).role, "admin");
assert.equal(listUsers(store, { role: "admin" }).length, 1);
assert.equal(listUsers(store, { search: "bob" })[0].id, bob.id);

// A registered account can't be "claimed" as if it were a guest (that would delete it).
assert.equal(claimGuestStats(store, alice.id, bob.id), null);
assert.ok(store.users[bob.id], "Bob's account must survive");

console.log("roles.test ok");
