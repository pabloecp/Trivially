import assert from "node:assert/strict";
import {
  deleteUser,
  linkGoogle,
  registerWithPassword,
  sanitizeUserPublic,
  unlinkGoogle,
  upsertUser,
} from "./store.js";

const testStore = { users: {} };

// Test 1: Minimum password length (2 chars is allowed, 1 char fails)
assert.throws(() => {
  registerWithPassword(testStore, { name: "A", email: "a@b.com", password: "1" });
}, /al menos 2 caracteres/);

const user1 = registerWithPassword(testStore, { name: "User 2Chars", email: "2c@yoavlly.test", password: "ab" });
assert.equal(user1.name, "User 2Chars");
assert.equal(user1.email, "2c@yoavlly.test");
assert.equal(typeof user1.id, "string");

// Test 2: Public sanitization removes sensitive info
const rawUser = testStore.users[user1.id];
const publicUser = sanitizeUserPublic(rawUser);
assert.equal(publicUser.id, user1.id);
assert.equal(publicUser.name, "User 2Chars");
assert.equal(publicUser.email, undefined, "Email must not be leaked");
assert.equal(publicUser.passwordHash, undefined, "Hash must not be leaked");

// Test 3: Link Google to existing password user
const linkedUser = linkGoogle(testStore, user1.id, {
  googleId: "g_9999",
  email: "2c@yoavlly.test",
  avatar: "https://google.com/pic.jpg",
});
assert.equal(linkedUser.googleId, "g_9999");

// Test 4: Unlink Google (since user has password, it works)
const unlinkedUser = unlinkGoogle(testStore, user1.id);
assert.equal(unlinkedUser.googleId, undefined);

// Test 5: Delete user
assert.throws(() => {
  deleteUser(testStore, user1.id, "Wrong Name");
}, /no coincide/);

deleteUser(testStore, user1.id, "User 2Chars");
assert.equal(testStore.users[user1.id], undefined);

console.log("All store tests passed!");
