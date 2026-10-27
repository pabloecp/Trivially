import assert from "node:assert/strict";
import { effectiveRole, hasRole } from "./roles.js";
import { claimGuestStats, registerWithPassword, sanitizeUser } from "../db/store.js";

const store = { users: {} };

const owner = registerWithPassword(store, { name: "Boss", username: "boss_user", email: "boss@trivially.test", password: "pw" });
const alice = registerWithPassword(store, { name: "Alice", username: "alice_user", email: "alice@trivially.test", password: "pw" });
const bob = registerWithPassword(store, { name: "Bob", username: "bob_user", email: "bob@trivially.test", password: "pw" });

// New accounts are plain users; OWNER_IDS makes the owner (by id, not by name or email).
assert.equal(owner.role, "user");
process.env.OWNER_IDS = `usr_unrelated, ${owner.id}`;
assert.equal(sanitizeUser(store.users[owner.id]).role, "owner");
assert.equal(alice.role, "user");
assert.equal(effectiveRole({ id: "usr_x", email: "boss@trivially.test" }), "user", "email alone is not enough");

// Only two roles: a role saved on the account from the old ones (admin, moderator) or "owner" counts for nothing.
assert.equal(effectiveRole({ id: "usr_y", role: "admin" }), "user");
assert.equal(effectiveRole({ id: "usr_y", role: "owner" }), "user", "owner only comes from OWNER_IDS");
assert.equal(effectiveRole({ isGuest: true, id: owner.id }), "user", "guests never have a role");
assert.ok(hasRole(store.users[owner.id], "owner"));
assert.ok(!hasRole(store.users[bob.id], "owner"));
assert.ok(hasRole(store.users[bob.id], "user"));
assert.ok(!hasRole({ isGuest: true }, "user"));

// Every account gets its own id.
const ids = Object.keys(store.users);
assert.equal(new Set(ids).size, ids.length);
assert.ok(ids.every((id) => /^usr_\d+_[0-9a-f]+$/.test(id)));

// A registered account can't be "claimed" as if it were a guest (that would delete it).
assert.equal(claimGuestStats(store, alice.id, bob.id), null);
assert.ok(store.users[bob.id], "Bob's account must survive");

console.log("roles.test ok");
