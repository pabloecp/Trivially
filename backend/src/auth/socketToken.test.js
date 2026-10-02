import assert from "node:assert/strict";
import { createSocketToken, verifySocketToken } from "./socketToken.js";

const token = createSocketToken("usr_1");
assert.equal(verifySocketToken(token), "usr_1");

// Tampered payload (claims another user) keeps the old signature and must fail.
const [, sig] = token.split(".");
const forged = `${Buffer.from(JSON.stringify({ uid: "usr_admin", exp: Date.now() + 1e6 })).toString("base64url")}.${sig}`;
assert.equal(verifySocketToken(forged), null);

// Expired, malformed and missing tokens.
assert.equal(verifySocketToken(createSocketToken("usr_1", Date.now() - 13 * 60 * 60 * 1000)), null);
assert.equal(verifySocketToken("nope"), null);
assert.equal(verifySocketToken(undefined), null);

console.log("socketToken.test ok");

// Login/link tickets: right kind only, single use, expire.
import { consumeTicket, createTicket } from "./socketToken.js";
const ticket = createTicket("usr_2", "login");
assert.equal(consumeTicket(ticket, "link"), null, "a login ticket is not a link ticket");
assert.equal(consumeTicket(ticket, "login"), "usr_2");
assert.equal(consumeTicket(ticket, "login"), null, "tickets work once");
assert.equal(consumeTicket(createTicket("usr_2", "login", 1000, Date.now() - 5000), "login"), null, "expired");
assert.equal(consumeTicket(createSocketToken("usr_2"), "login"), null, "socket tokens can't log in");
console.log("tickets ok");

// Session tokens (the cookie fallback): only their own kind counts, and they expire after 30 days.
import { createAuthToken, verifyAuthToken } from "./socketToken.js";
assert.equal(verifyAuthToken(createAuthToken("usr_3")), "usr_3");
assert.equal(verifyAuthToken(createSocketToken("usr_3")), null, "a socket token is not a session");
assert.equal(verifyAuthToken(createTicket("usr_3", "login")), null, "a ticket is not a session");
assert.equal(verifyAuthToken(createAuthToken("usr_3", Date.now() - 31 * 24 * 60 * 60 * 1000)), null, "expired");
console.log("auth tokens ok");
