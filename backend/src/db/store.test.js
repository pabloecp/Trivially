import assert from "node:assert/strict";
import {
  deleteGuest,
  deleteUser,
  linkGoogle,
  registerWithPassword,
  sanitizeUserPublic,
  unlinkGoogle,
  updateUserAvatar,
  upsertGoogleUser,
  upsertUser,
} from "./store.js";

const testStore = { users: {} };

// Test 1: Minimum password length (2 chars is allowed, 1 char fails)
assert.throws(() => {
  registerWithPassword(testStore, { name: "A", email: "a@b.com", password: "1" });
}, /al menos 2 caracteres/);

const user1 = registerWithPassword(testStore, { name: "User 2Chars", email: "2c@trivially.test", password: "ab" });
assert.equal(user1.name, "User 2Chars");
assert.equal(user1.email, "2c@trivially.test");
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
  email: "2c@trivially.test",
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

// Test 6: Guests are removed on sign-out; registered accounts never are
upsertUser(testStore, { id: "gst_test01", name: "Invitado", isGuest: true });
assert.equal(deleteGuest(testStore, "gst_test01"), true);
assert.equal(testStore.users.gst_test01, undefined);
const user2 = registerWithPassword(testStore, { name: "Registrado", email: "r@trivially.test", password: "ab" });
assert.equal(deleteGuest(testStore, user2.id), false);
assert.ok(testStore.users[user2.id]);

// Test 7: Avatar is a color or the Google photo; picking a color keeps the photo for later
assert.throws(() => updateUserAvatar(testStore, user2.id, "google"), /Google/);
assert.throws(() => updateUserAvatar(testStore, user2.id, "https://evil.test/x.png"), /no válido/);
assert.equal(updateUserAvatar(testStore, user2.id, "#33A8C7").avatar, "#33A8C7");
const gUser = upsertGoogleUser(testStore, { name: "G", email: "g@trivially.test", avatar: "https://photo.test/g.jpg", googleId: "g_1" });
assert.equal(gUser.avatar, "https://photo.test/g.jpg");
updateUserAvatar(testStore, gUser.id, "#FF8A00");
upsertGoogleUser(testStore, { email: "g@trivially.test", avatar: "https://photo.test/g2.jpg", googleId: "g_1" });
assert.equal(testStore.users[gUser.id].avatar, "#FF8A00");
assert.equal(updateUserAvatar(testStore, gUser.id, "google").avatar, "https://photo.test/g2.jpg");

console.log("All store tests passed!");
