import assert from "node:assert/strict";
import {
  USERNAME_CHANGES,
  USERNAME_RESERVE_MS,
  USERNAME_WINDOW_MS,
  assignUsername,
  changeUsername,
  findByUsername,
  normalizeUsername,
  searchUsernames,
  suggestUsername,
  usernameError,
  usernameFormatError,
  usernameStatus,
} from "./username.js";

const DAY = 24 * 60 * 60 * 1000;
const mk = (id, name, extra = {}) => ({ id, name, isGuest: false, ...extra });
const store = { users: { a: mk("a", "Ana", { username: "ana" }), b: mk("b", "Beto", { username: "beto_99" }), g: { id: "g", name: "Invitado", isGuest: true } } };

// Format: any case and a leading @ are fine; the rest must be letters, numbers and _.
assert.equal(normalizeUsername("  @Pepe_23 "), "pepe_23");
assert.equal(usernameFormatError("@pepe_23"), null);
assert.match(usernameFormatError("ab"), /al menos 3/);
assert.match(usernameFormatError("a".repeat(21)), /20/);
assert.match(usernameFormatError("pepe!"), /letras sin tilde/);
assert.match(usernameFormatError("pépe"), /letras sin tilde/);
assert.match(usernameFormatError("pe pe"), /letras sin tilde/);
assert.match(usernameFormatError("1234"), /una letra/);
assert.match(usernameFormatError("Admin"), /no está disponible/);

// Unique, whatever the case; guests have none.
assert.equal(findByUsername(store, "@ANA").id, "a");
assert.equal(findByUsername(store, "nadie"), null);
assert.match(usernameError(store, "Ana"), /en uso/);
assert.equal(usernameError(store, "ana", "a"), null, "your own is not taken for you");
assert.equal(usernameError(store, "carla"), null);

// Made from a name: no accents, no signs, free, never too short.
assert.equal(suggestUsername(store, "María José!"), "maria_jose");
assert.equal(suggestUsername(store, "Ana"), "ana2");
assert.equal(suggestUsername(store, "!!"), "jugador");
assert.equal(suggestUsername(store, "Yo").length >= 3, true);
assert.equal(suggestUsername(store, "x".repeat(40)).length <= 20, true);
const c = mk("c", "Ana");
store.users.c = c;
assert.equal(assignUsername(store, c), true);
assert.equal(c.username, "ana2");
assert.equal(c.usernameAuto, true);
assert.equal(assignUsername(store, c), false, "already has one");

// The first change of an assigned username is free and doesn't count; the next ones do: 3 in 30 days.
const t0 = Date.UTC(2026, 0, 1);
assert.equal(usernameStatus(c, t0).free, true);
changeUsername(store, c, "carla", t0);
assert.equal(c.username, "carla");
assert.equal(c.usernameAuto, false);
assert.equal(usernameStatus(c, t0).changesLeft, USERNAME_CHANGES);
changeUsername(store, c, "carla_1", t0 + DAY);
changeUsername(store, c, "carla_2", t0 + 2 * DAY);
assert.equal(usernameStatus(c, t0 + 2 * DAY).changesLeft, 1);
changeUsername(store, c, "carla_3", t0 + 3 * DAY);
assert.equal(usernameStatus(c, t0 + 3 * DAY).changesLeft, 0);
assert.throws(() => changeUsername(store, c, "carla_4", t0 + 4 * DAY), /3 veces este mes/);
assert.equal(c.username, "carla_3");
// The window slides: the first of the three expires 30 days after it was made.
assert.equal(usernameStatus(c, t0 + 4 * DAY).nextChangeAt, t0 + DAY + USERNAME_WINDOW_MS);
changeUsername(store, c, "carla_4", t0 + DAY + USERNAME_WINDOW_MS + 1);
assert.equal(c.username, "carla_4");

// The same, taken, invalid or a guest: refused.
assert.throws(() => changeUsername(store, c, "carla_4", t0 + 40 * DAY), /ya es tu usuario/);
assert.throws(() => changeUsername(store, c, "ana", t0 + 40 * DAY), /en uso/);
assert.throws(() => changeUsername(store, c, "a!", t0 + 40 * DAY), /al menos 3|letras/);
assert.throws(() => changeUsername(store, store.users.g, "invitado", t0), /Solo las cuentas/);

// A username someone left stays theirs for a while, so nobody can take it; then it is free.
const x = mk("x", "Xavi", { username: "xavi_old" });
store.users.x = x;
const T = Date.UTC(2026, 5, 1);
changeUsername(store, x, "xavi_new", T);
assert.match(usernameError(store, "xavi_old", "b", T + DAY), /en uso/, "reserved for the one who left it");
assert.equal(usernameError(store, "xavi_old", "x", T + DAY), null, "and theirs again whenever they want");
assert.equal(usernameError(store, "xavi_old", "b", T + USERNAME_RESERVE_MS + DAY), null, "free after the reservation");
assert.equal(findByUsername(store, "xavi_old"), null, "nobody holds it meanwhile");

// Search: from 3 letters, exact first, never yourself, never guests.
store.users.d = mk("d", "Dani", { username: "dani" });
store.users.e = mk("e", "Dani2", { username: "daniela" });
store.users.f = mk("f", "Mi dani", { username: "mi_dani" });
assert.deepEqual(searchUsernames(store, "da"), []);
assert.deepEqual(searchUsernames(store, "@dani").map((u) => u.username), ["dani", "daniela", "mi_dani"]);
assert.deepEqual(searchUsernames(store, "dani", { exceptId: "d" }).map((u) => u.username), ["daniela", "mi_dani"]);
assert.equal(searchUsernames(store, "invitado").length, 0);
assert.ok(searchUsernames(store, "a", { limit: 8 }).length === 0);

console.log("username.test ok");
