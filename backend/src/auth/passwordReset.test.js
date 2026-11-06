import assert from "node:assert/strict";
import { accountByEmail, clearResetTokens, consumeResetToken, createResetToken, RESET_EMAIL_GAP_MS, RESET_TTL_MS, resetTokenValid } from "./passwordReset.js";
import { resetEmail } from "./mailer.js";

const store = {
  users: {
    u1: { id: "u1", name: "Ana", email: "Ana@Correo.com", isGuest: false },
    g1: { id: "g1", name: "Invitado", email: "inv@correo.com", isGuest: true },
  },
};

// The account by its email, any case; never a guest.
assert.equal(accountByEmail(store, "  ana@correo.COM ")?.id, "u1");
assert.equal(accountByEmail(store, "inv@correo.com"), null);
assert.equal(accountByEmail(store, ""), null);

// A token works once, and only for half an hour.
clearResetTokens();
const t0 = 1_000_000;
const token = createResetToken("u1", t0);
assert.ok(token && token.length >= 40);
assert.ok(resetTokenValid(token, t0 + 1000));
assert.equal(consumeResetToken(token, t0 + 1000), "u1");
assert.equal(consumeResetToken(token, t0 + 2000), null, "used up");
assert.ok(!resetTokenValid(token, t0 + 2000));

// Not another email until the gap has passed; a newer link replaces the older one.
assert.equal(createResetToken("u1", t0 + 1000), null);
const older = createResetToken("u1", t0 + RESET_EMAIL_GAP_MS);
const newer = createResetToken("u1", t0 + 2 * RESET_EMAIL_GAP_MS);
assert.equal(consumeResetToken(older, t0 + 2 * RESET_EMAIL_GAP_MS), null);
assert.equal(consumeResetToken(newer, t0 + 2 * RESET_EMAIL_GAP_MS + RESET_TTL_MS + 1), null, "expired");
assert.equal(consumeResetToken("nada"), null);
assert.equal(consumeResetToken(undefined), null);

// The email has the link and escapes the name.
const mail = resetEmail({ name: "<b>Ana</b>", link: "https://triviallyonline.vercel.app/restablecer?token=abc" });
assert.ok(mail.text.includes("https://triviallyonline.vercel.app/restablecer?token=abc"));
assert.ok(!mail.html.includes("<b>Ana</b>"));

console.log("passwordReset ok");
