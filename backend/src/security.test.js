import assert from "node:assert/strict";
import { DEV_SECRET, originChecker, sessionSecret, siteOrigin } from "./security.js";

// Only our pages may use the server from a browser.
const allowed = originChecker("https://triviallyonline.vercel.app", "https://playtrivially.com, https://www.playtrivially.com/");
for (const origin of [
  undefined,
  "https://triviallyonline.vercel.app",
  "https://triviallyonline.vercel.app/",
  "https://playtrivially.com",
  "https://www.playtrivially.com",
  "https://trivially-mvghn5th1-pabloecp.vercel.app",
  "https://trivially-git-develop-pabloecp.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://localhost",
]) {
  assert.ok(allowed(origin), String(origin));
}
for (const origin of [
  "https://evil.com",
  "https://otro-proyecto.vercel.app",
  "https://trivially-copia.vercel.app",
  "https://trivially-x-pabloecp.vercel.app.evil.com",
  "https://evil-pabloecp.vercel.app",
  "http://localhost.evil.com",
  "https://triviallyonline.vercel.app.evil.com",
  "http://playtrivially.com",
  "null",
]) {
  assert.ok(!allowed(origin), origin);
}
// Without ALLOWED_ORIGINS only the site itself (and previews, localhost).
assert.ok(!originChecker("https://triviallyonline.vercel.app")("https://playtrivially.com"));

// A Google login only comes back to one of our sites (it brings a login ticket in the address).
{
  const fallback = "https://triviallyonline.vercel.app";
  assert.equal(siteOrigin("https://triviallyonline.vercel.app/login?x=1", fallback, allowed), "https://triviallyonline.vercel.app");
  assert.equal(siteOrigin("https://playtrivially.com", fallback, allowed), "https://playtrivially.com");
  assert.equal(siteOrigin("http://localhost:5173/", fallback, allowed), "http://localhost:5173");
  for (const bad of ["https://evil.com", "https://evil.com/https://triviallyonline.vercel.app", "javascript:alert(1)", "//evil.com", "", null, "nada"]) {
    assert.equal(siteOrigin(bad, fallback, allowed), fallback, String(bad));
  }
}

// The session secret: required in production, and never one of those written in the public code.
assert.equal(sessionSecret({ SESSION_SECRET: "un-texto-largo-y-secreto" }, { production: true }), "un-texto-largo-y-secreto");
assert.throws(() => sessionSecret({}, { production: true }), /SESSION_SECRET/);
assert.throws(() => sessionSecret({ SESSION_SECRET: "  " }, { production: true }), /SESSION_SECRET/);
assert.throws(() => sessionSecret({ SESSION_SECRET: "trivially-dev-secret" }, { production: true }), /SESSION_SECRET/);
assert.throws(() => sessionSecret({ SESSION_SECRET: "trivially-dev-secret-key" }, { production: true }), /SESSION_SECRET/);
// On a developer's computer the test one is fine.
assert.equal(sessionSecret({}, { production: false }), DEV_SECRET);

console.log("security ok");
