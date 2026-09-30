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
