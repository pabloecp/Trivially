import assert from "node:assert/strict";
import {
  deleteGuest,
  deleteUser,
  fromRow,
  toRow,
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

const user1 = registerWithPassword(testStore, { name: "User 2Chars", username: "user_2chars", email: "2c@trivially.test", password: "abcd1234" });
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

// An account with a password asks for it too.
assert.throws(() => deleteUser(testStore, user1.id, "User 2Chars"), /Escribe tu contraseña/);
assert.throws(() => deleteUser(testStore, user1.id, "User 2Chars", "otra-clave"), /no es correcta/);
deleteUser(testStore, user1.id, "User 2Chars", "abcd1234");
assert.equal(testStore.users[user1.id], undefined);

// Test 6: Guests are removed on sign-out; registered accounts never are
upsertUser(testStore, { id: "gst_test01", name: "Invitado", isGuest: true });
assert.equal(deleteGuest(testStore, "gst_test01"), true);
assert.equal(testStore.users.gst_test01, undefined);
const user2 = registerWithPassword(testStore, { name: "Registrado", username: "registrado", email: "r@trivially.test", password: "abcd1234" });
assert.equal(deleteGuest(testStore, user2.id), false);
assert.ok(testStore.users[user2.id]);

// Test 7: Avatar is one of the Blob's colours or the Google photo; picking a color keeps the
// photo for later
assert.throws(() => updateUserAvatar(testStore, user2.id, "google"), /Google/);
assert.throws(() => updateUserAvatar(testStore, user2.id, "https://evil.test/x.png"), /no válido/);
assert.throws(() => updateUserAvatar(testStore, user2.id, "#33A8C7"), /no válido/);
assert.throws(() => updateUserAvatar(testStore, user2.id, "#FFC93C"), /no válido/, "the owners' gold is gone");
assert.equal(updateUserAvatar(testStore, user2.id, "#2f6bff").avatar, "#2F6BFF");
// The old account colours (celeste, rosa, menta, amarillo, naranja) still work: they are their new colour.
assert.equal(updateUserAvatar(testStore, user2.id, "#8fd3ff").avatar, "#2F6BFF");
assert.equal(updateUserAvatar(testStore, user2.id, "#FF8A00").avatar, "#FF5A1F");
assert.equal(updateUserAvatar(testStore, user2.id, "#1fd24a").avatar, "#1FD24A");
assert.equal(updateUserAvatar(testStore, user2.id, "#FFFFFF").avatar, "#FFFFFF");
const gUser = upsertGoogleUser(testStore, { name: "G", email: "g@trivially.test", avatar: "https://photo.test/g.jpg", googleId: "g_1" });
assert.equal(gUser.avatar, "https://photo.test/g.jpg");
updateUserAvatar(testStore, gUser.id, "#FF2FC0");
upsertGoogleUser(testStore, { email: "g@trivially.test", avatar: "https://photo.test/g2.jpg", googleId: "g_1" });
assert.equal(testStore.users[gUser.id].avatar, "#FF2FC0");
assert.equal(updateUserAvatar(testStore, gUser.id, "google").avatar, "https://photo.test/g2.jpg");

// The colour a browser sends can't skip those rules: a guest's account colour isn't saved, and in rooms a player shows
// the account's colour only while they can use it.
const fakeGuest = upsertUser(testStore, { id: "gst_fake01", name: "Falso", avatar: "#A63DFF", isGuest: true });
assert.notEqual(fakeGuest.avatar, "#A63DFF");
upsertUser(testStore, { id: "gst_fake01", name: "Falso", avatar: "#2F6BFF" });
assert.notEqual(testStore.users.gst_fake01.avatar, "#2F6BFF");
upsertUser(testStore, { id: "gst_fake01", name: "Falso", avatar: "#8FD3FF" });
assert.notEqual(testStore.users.gst_fake01.avatar, "#8FD3FF", "nor an old account colour");
assert.equal(playerAvatar(undefined), "#FFFFFF");
assert.equal(playerAvatar({ isGuest: true, avatar: "#FFA6D2" }), "#FFFFFF");
assert.equal(playerAvatar({ isGuest: false, role: "user", avatar: "#00A2FF" }), "#00A2FF");
assert.equal(playerAvatar({ isGuest: false, role: "user", avatar: "#FF8A00" }), "#FF5A1F");
assert.equal(playerAvatar({ isGuest: false, role: "user", avatar: "#FFA6D2" }), "#FF2FC0", "an old colour shows as its new one");
deleteGuest(testStore, "gst_fake01");

// Usernames ("@pepe"): needed to register, unique, and the way to sign in (names for the games aren't unique).
assert.throws(() => registerWithPassword(testStore, { name: "Otro", username: "ab", email: "o@trivially.test", password: "abcd1234" }), /al menos 3/);
assert.throws(() => registerWithPassword(testStore, { name: "Otro", username: "@Registrado", email: "o@trivially.test", password: "abcd1234" }), /en uso/);
const pepe = registerWithPassword(testStore, { name: "Pepe", username: "@Pepe_23", email: "pepe@trivially.test", password: "abcd1234" });
assert.equal(pepe.username, "pepe_23");
assert.equal(sanitizeUserPublic(testStore.users[pepe.id]).username, "pepe_23");
assert.equal(pepe.usernameInfo.changesLeft, 3);
assert.equal("usernameHistory" in pepe, false);
assert.equal(loginWithPassword(testStore, { identifier: "@PEPE_23", password: "abcd1234" }).id, pepe.id);
assert.equal(loginWithPassword(testStore, { identifier: "pepe@trivially.test", password: "abcd1234" }).id, pepe.id);
assert.throws(() => loginWithPassword(testStore, { identifier: "Pepe", password: "abcd1234" }), /incorrectos/, "the game name doesn't identify anyone");
// A login that fails says the same whatever the reason: no such account, a wrong password.
{
  const messageOf = (credentials) => {
    try {
      loginWithPassword(testStore, credentials);
    } catch (err) {
      return err.message;
    }
    return null;
  };
  const noAccount = messageOf({ identifier: "nadie@trivially.test", password: "abcd1234" });
  const wrong = messageOf({ identifier: "pepe@trivially.test", password: "no-es-esta" });
  assert.ok(noAccount && noAccount === wrong);
  assert.doesNotMatch(noAccount, /no encontrado|no existe/);
}
// Another Pepe for the games is fine: only usernames are unique.
const otherPepe = registerWithPassword(testStore, { name: "Pepe", username: "pepe_24", email: "pepe2@trivially.test", password: "abcd1234" });
assert.notEqual(otherPepe.id, pepe.id);
assert.equal(updateUsername(testStore, pepe.id, "pepe_cool").username, "pepe_cool");
assert.throws(() => updateUsername(testStore, pepe.id, "pepe_24"), /en uso/);
// Accounts from before usernames get one made from their name.
testStore.users.old = { id: "old", name: "María José", isGuest: false, email: "mj@trivially.test", stats: {} };
assert.equal(ensureUsernames(testStore), 1);
assert.equal(testStore.users.old.username, "maria_jose");
assert.equal(ensureUsernames(testStore), 0);

// Supabase keeps each account in columns (toRow) and brings it back the same (fromRow); a field without a column of its
// own goes in `extra`, and an account still saved whole in `data` (from before the columns) is read from there.
{
  const account = {
    id: "usr_cols",
    name: "Columnas",
    username: "columnas",
    email: "c@trivially.test",
    avatar: "#2F6BFF",
    isGuest: false,
    role: "owner",
    passwordHash: "h",
    passwordSalt: "s",
    stats: { totalScore: 10, gamesPlayed: 1, artistHits: { a: 1 } },
    elo: { opciones: { rating: 1010, games: 1, best: 1010 } },
    history: [{ at: "2026-11-06T00:00:00.000Z", game: "opciones", position: 1 }],
    dailyDone: 3,
    usernameAuto: false,
    friendCode: "ABC123",
  };
  const row = toRow(account);
  assert.equal(row.username, "columnas");
  assert.equal(row.password_hash, "h");
  assert.equal(row.daily_done, 3);
  assert.equal(row.spotify, null);
  assert.deepEqual(row.extra, { friendCode: "ABC123" });
  assert.equal(row.data, null);
  assert.deepEqual(fromRow(row), account);
  assert.equal(fromRow({ ...row, data: { id: "usr_cols", name: "Antes" } }).name, "Antes");
}

// A new password signs the account out everywhere else: sessions and tokens from before it stop counting.
{
  const { endSessions, sanitizeUser, sessionStillValid, setPassword, sweepGuests, touchGuest, upsertGoogleUser, upsertUser, loginWithPassword: login } = await import("./store.js");
  const s = { users: {} };
  const ana = registerWithPassword(s, { name: "Ana", username: "ana_sesiones", email: "ana@trivially.test", password: "abcd1234" });
  const before = Date.now() - 1000;
  assert.equal(sessionStillValid(s.users[ana.id], before), true, "nothing ended yet");
  assert.equal(sessionStillValid(s.users[ana.id], undefined), true, "an old cookie with no date still counts");
  assert.throws(() => setPassword(s, ana.id, "x"), /al menos 2 caracteres/);
  setPassword(s, ana.id, "otra-clave-larga");
  assert.equal(sessionStillValid(s.users[ana.id], before), false);
  assert.equal(sessionStillValid(s.users[ana.id], undefined), false);
  assert.equal(sessionStillValid(s.users[ana.id], Date.now()), true, "the session opened after it counts");
  assert.equal(sanitizeUser(s.users[ana.id]).sessionsAfter, undefined, "never sent to the browser");
  assert.equal(sessionStillValid(undefined, 0), true, "a guest nobody saved has nothing to end");

  // Someone registers another person's email with a password; the real owner enters with Google: the password and
  // the impostor's session are gone.
  const fake = registerWithPassword(s, { name: "Impostor", username: "impostor_1", email: "victima@trivially.test", password: "clave-del-impostor" });
  const stolenAt = Date.now() - 1000;
  const real = upsertGoogleUser(s, { email: "victima@trivially.test", name: "Víctima", googleId: "g-1" }, null);
  assert.equal(real.id, fake.id);
  assert.equal(s.users[fake.id].passwordHash, undefined);
  assert.equal(sessionStillValid(s.users[fake.id], stolenAt), false);
  assert.throws(() => login(s, { identifier: "victima@trivially.test", password: "clave-del-impostor" }), /incorrectos/);
  // Entering with Google again changes nothing more.
  const ended = s.users[fake.id].sessionsAfter;
  upsertGoogleUser(s, { email: "victima@trivially.test", name: "Víctima", googleId: "g-1" }, null);
  assert.equal(s.users[fake.id].sessionsAfter, ended);
  endSessions(s.users[fake.id]);
  assert.ok(s.users[fake.id].sessionsAfter >= ended);

  // Guests nobody has seen for a while leave the memory, but those still in a match; accounts never do.
  const now = Date.now();
  upsertUser(s, { id: "gst_viejo", name: "Viejo", isGuest: true });
  upsertUser(s, { id: "gst_jugando", name: "Jugando", isGuest: true });
  upsertUser(s, { id: "gst_nuevo", name: "Nuevo", isGuest: true });
  const later = now + 49 * 60 * 60 * 1000;
  const realNow = Date.now;
  Date.now = () => later;
  touchGuest(s, "gst_nuevo");
  touchGuest(s, ana.id);
  Date.now = realNow;
  const gone = sweepGuests(s, { olderThanMs: 48 * 60 * 60 * 1000, keep: (id) => id === "gst_jugando", now: later });
  assert.equal(gone, 1);
  assert.equal(s.users.gst_viejo, undefined);
  assert.ok(s.users.gst_jugando && s.users.gst_nuevo && s.users[ana.id]);
}

console.log("All store tests passed!");
