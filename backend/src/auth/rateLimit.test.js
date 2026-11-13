import assert from "node:assert/strict";
import { clientAddress, LOGIN_FAILS, LOGIN_FAIL_WINDOW_MS, loginFailed, loginLocked, loginSucceeded, rateLimit } from "./rateLimit.js";

// Who is asking: the address Vercel wrote down, not Vercel's own (the one the server sees).
assert.equal(clientAddress({ headers: { "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2, 9.9.9.9" }, ip: "9.9.9.9" }), "1.1.1.1");
assert.equal(clientAddress({ headers: { "x-forwarded-for": "2.2.2.2, 9.9.9.9" }, ip: "9.9.9.9" }), "2.2.2.2");
assert.equal(clientAddress({ headers: {}, ip: "9.9.9.9" }), "9.9.9.9");
assert.equal(clientAddress({ headers: {} }), "unknown");

// A request as the limit sees it, and whether it was let through.
const ask = (limit, client, shared = "9.9.9.9") => {
  let status = 200;
  let passed = false;
  const res = { status: (code) => ((status = code), { json: () => {} }) };
  limit({ headers: { "x-forwarded-for": `${client}, ${shared}` }, ip: shared }, res, () => (passed = true));
  return passed ? 200 : status;
};

// Each player has their own count, though they all arrive from Vercel's address.
const limit = rateLimit({ max: 3, maxShared: 8, message: "Demasiados" });
for (let i = 0; i < 3; i++) assert.equal(ask(limit, "1.1.1.1"), 200);
assert.equal(ask(limit, "1.1.1.1"), 429, "the fourth of one player is refused");
assert.equal(ask(limit, "2.2.2.2"), 200, "another player is not");
// The address the server really sees has a higher limit of its own: writing a new address each time doesn't get past it.
for (let i = 0; i < 3; i++) assert.equal(ask(limit, `3.3.3.${i}`), 200);
assert.equal(ask(limit, "3.3.3.99"), 429, "the ninth from the same real address");
assert.equal(ask(limit, "4.4.4.4", "8.8.8.8"), 200, "from another real address it goes on");

// Wrong passwords for one account, from anywhere.
const now = 1_000_000;
assert.equal(loginLocked("ana@trivially.test", now), false);
for (let i = 0; i < LOGIN_FAILS - 1; i++) loginFailed("ana@trivially.test", now);
assert.equal(loginLocked("ana@trivially.test", now), false);
loginFailed(" Ana@Trivially.test ", now);
assert.equal(loginLocked("ana@trivially.test", now), true, "however it's typed");
assert.equal(loginLocked("otra@trivially.test", now), false, "other accounts are not");
assert.equal(loginLocked("ana@trivially.test", now + LOGIN_FAIL_WINDOW_MS + 1), false, "after a while it can be tried again");
for (let i = 0; i < LOGIN_FAILS; i++) loginFailed("@pepe", now);
assert.equal(loginLocked("pepe", now), true, "with or without the @");
loginSucceeded("pepe");
assert.equal(loginLocked("pepe", now), false);

console.log("rateLimit ok");
