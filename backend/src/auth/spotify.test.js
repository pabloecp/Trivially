import assert from "node:assert/strict";
import { linkSpotify, sanitizeUser, sanitizeUserPublic, unlinkSpotify } from "../db/store.js";

const store = {
  users: {
    acc_1: { id: "acc_1", name: "Pablo", role: "owner" },
    acc_2: { id: "acc_2", name: "Otro" },
    gst_1: { id: "gst_1", name: "Invitado", isGuest: true },
  },
};
const link = {
  id: "sp_123",
  displayName: "Pablo en Spotify",
  url: "https://open.spotify.com/user/sp_123",
  accessToken: "secret-access",
  refreshToken: "secret-refresh",
  expiresAt: Date.now() + 3600_000,
  connectedAt: Date.now(),
};

// Linking keeps the tokens on the server but never returns them.
const user = linkSpotify(store, "acc_1", link);
assert.equal(user.spotify.displayName, "Pablo en Spotify");
assert.equal(store.users.acc_1.spotify.refreshToken, "secret-refresh");
const json = JSON.stringify([user, sanitizeUser(store.users.acc_1), sanitizeUserPublic(store.users.acc_1)]);
assert.ok(!json.includes("secret-access") && !json.includes("secret-refresh"));
assert.equal(sanitizeUserPublic(store.users.acc_1).spotifyLinked, true);
assert.equal(sanitizeUserPublic(store.users.acc_2).spotifyLinked, false);

// One Spotify account can't be on two users, and guests can't link.
assert.throws(() => linkSpotify(store, "acc_2", link), /ya está conectada/);
assert.throws(() => linkSpotify(store, "gst_1", { ...link, id: "sp_9" }), /no encontrado/);

// Unlinking removes everything.
assert.equal(unlinkSpotify(store, "acc_1").spotify, null);
assert.equal(store.users.acc_1.spotify, undefined);

console.log("spotify ok");
