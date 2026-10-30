import assert from "node:assert/strict";
import {
  deleteGuest,
  deleteUser,
  ensureUsernames,
  linkGoogle,
  loginWithPassword,
  playerAvatar,
  registerWithPassword,
  sanitizeUserPublic,
  unlinkGoogle,
  updateUserAvatar,
  updateUsername,
  upsertGoogleUser,
  upsertUser,
} from "./store.js";

const testStore = { users: {} };

// Test 1: Minimum password length (2 chars is allowed, 1 char fails)
assert.throws(() => {
  registerWithPassword(testStore, { name: "A", username: "usuario_a", email: "a@b.com", password: "1" });
}, /al menos 2 caracteres/);

const user1 = registerWithPassword(testStore, { name: "User 2Chars", username: "user_2chars", email: "2c@trivially.test", password: "ab" });
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
const user2 = registerWithPassword(testStore, { name: "Registrado", username: "registrado", email: "r@trivially.test", password: "ab" });
assert.equal(deleteGuest(testStore, user2.id), false);
assert.ok(testStore.users[user2.id]);

// Test 7: Avatar is one of the Blob's colours (gold only for owners) or the Google photo; picking a color keeps the
// photo for later
assert.throws(() => updateUserAvatar(testStore, user2.id, "google"), /Google/);
assert.throws(() => updateUserAvatar(testStore, user2.id, "https://evil.test/x.png"), /no válido/);
assert.throws(() => updateUserAvatar(testStore, user2.id, "#33A8C7"), /no válido/);
assert.throws(() => updateUserAvatar(testStore, user2.id, "#FFC93C"), /owners/);
assert.equal(updateUserAvatar(testStore, user2.id, "#8fd3ff").avatar, "#8FD3FF");
assert.equal(updateUserAvatar(testStore, user2.id, "#FFFFFF").avatar, "#FFFFFF");
const gUser = upsertGoogleUser(testStore, { name: "G", email: "g@trivially.test", avatar: "https://photo.test/g.jpg", googleId: "g_1" });
assert.equal(gUser.avatar, "https://photo.test/g.jpg");
updateUserAvatar(testStore, gUser.id, "#FFA6D2");
upsertGoogleUser(testStore, { email: "g@trivially.test", avatar: "https://photo.test/g2.jpg", googleId: "g_1" });
assert.equal(testStore.users[gUser.id].avatar, "#FFA6D2");
assert.equal(updateUserAvatar(testStore, gUser.id, "google").avatar, "https://photo.test/g2.jpg");

// The colour a browser sends can't skip those rules: a guest's gold or account colour isn't saved, and in rooms a
// player shows the account's colour only while they can use it.
const fakeGuest = upsertUser(testStore, { id: "gst_fake01", name: "Falso", avatar: "#FFC93C", isGuest: true });
assert.notEqual(fakeGuest.avatar, "#FFC93C");
upsertUser(testStore, { id: "gst_fake01", name: "Falso", avatar: "#8FD3FF" });
assert.notEqual(testStore.users.gst_fake01.avatar, "#8FD3FF");
upsertUser(testStore, { id: user2.id, name: "Registrado", avatar: "#FFC93C" });
assert.equal(testStore.users[user2.id].avatar, "#FFFFFF");
assert.equal(playerAvatar(undefined), "#FFFFFF");
assert.equal(playerAvatar({ isGuest: true, avatar: "#FFA6D2" }), "#FFFFFF");
assert.equal(playerAvatar({ isGuest: false, role: "user", avatar: "#FFC93C" }), "#FFFFFF");
assert.equal(playerAvatar({ isGuest: false, role: "user", avatar: "#FFA6D2" }), "#FFA6D2");
deleteGuest(testStore, "gst_fake01");

// Usernames ("@pepe"): needed to register, unique, and the way to sign in (names for the games aren't unique).
assert.throws(() => registerWithPassword(testStore, { name: "Otro", username: "ab", email: "o@trivially.test", password: "ab" }), /al menos 3/);
assert.throws(() => registerWithPassword(testStore, { name: "Otro", username: "@Registrado", email: "o@trivially.test", password: "ab" }), /en uso/);
const pepe = registerWithPassword(testStore, { name: "Pepe", username: "@Pepe_23", email: "pepe@trivially.test", password: "ab" });
assert.equal(pepe.username, "pepe_23");
assert.equal(sanitizeUserPublic(testStore.users[pepe.id]).username, "pepe_23");
assert.equal(pepe.usernameInfo.changesLeft, 3);
assert.equal("usernameHistory" in pepe, false);
assert.equal(loginWithPassword(testStore, { identifier: "@PEPE_23", password: "ab" }).id, pepe.id);
assert.equal(loginWithPassword(testStore, { identifier: "pepe@trivially.test", password: "ab" }).id, pepe.id);
assert.throws(() => loginWithPassword(testStore, { identifier: "Pepe", password: "ab" }), /no encontrado/, "the game name doesn't identify anyone");
// Another Pepe for the games is fine: only usernames are unique.
const otherPepe = registerWithPassword(testStore, { name: "Pepe", username: "pepe_24", email: "pepe2@trivially.test", password: "ab" });
assert.notEqual(otherPepe.id, pepe.id);
assert.equal(updateUsername(testStore, pepe.id, "pepe_cool").username, "pepe_cool");
assert.throws(() => updateUsername(testStore, pepe.id, "pepe_24"), /en uso/);
// Accounts from before usernames get one made from their name.
testStore.users.old = { id: "old", name: "María José", isGuest: false, email: "mj@trivially.test", stats: {} };
assert.equal(ensureUsernames(testStore), 1);
assert.equal(testStore.users.old.username, "maria_jose");
assert.equal(ensureUsernames(testStore), 0);

console.log("All store tests passed!");
