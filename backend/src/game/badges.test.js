import assert from "node:assert/strict";
import { BADGES, BADGE_GAMES, badgeError, earnedBadges, isPerfectMatch, wornBadge } from "./badges.js";
import { applyMatchStats, sanitizeUser, sanitizeUserPublic, updateUserBadge } from "../db/store.js";

// The profile's badges: ten, each won when its progress reaches its goal, and one of them worn beside the name.
assert.equal(BADGES.length, 10);
const stats = () => ({ gamesPlayed: 0, totalScore: 0, bestScore: 0, bestStreak: 0, correctAnswers: 0, wins: 0 });
const store = {
  users: {
    ana: { id: "ana", name: "Ana", stats: stats() },
    luis: { id: "luis", name: "Luis", stats: stats() },
    gst_x: { id: "gst_x", name: "Invitado", isGuest: true, stats: { ...stats(), wins: 500 } },
  },
};
const ana = store.users.ana;

assert.deepEqual(earnedBadges(ana), [], "a new account has none");
assert.deepEqual(earnedBadges(store.users.gst_x), [], "a guest never has any");
ana.stats.wins = 100;
ana.stats.bestStreak = 14;
ana.dailyDone = 30;
ana.rank = { points: 900, matches: 80, wins: 30, best: 1500 };
assert.deepEqual(earnedBadges(ana), ["campeon", "constante", "leyenda"]);

// "Récord" (14,000 points in one match) and "Melómano" (500 songs guessed, all artists together).
const rec = { id: "rec", stats: { bestScore: 14000, artistHits: { a: 300, b: 199 } } };
assert.deepEqual(earnedBadges(rec), ["record"]);
rec.stats.artistHits.b = 200;
assert.deepEqual(earnedBadges(rec), ["record", "melomano"]);

// Wearing one: only a won one, and null takes it off.
assert.match(badgeError(ana, "imparable"), /Todavía no/);
assert.match(badgeError(ana, "inventada"), /no válida/);
assert.equal(badgeError(ana, null), null);
assert.equal(updateUserBadge(store, "ana", "campeon").badge, "campeon");
assert.equal(sanitizeUserPublic(ana).badge, "campeon", "others see it too");
assert.throws(() => updateUserBadge(store, "ana", "imparable"), /Todavía no/);
assert.throws(() => updateUserBadge(store, "gst_x", "campeon"), /cuenta/);
assert.equal(updateUserBadge(store, "ana", null).badge, null);
// A badge saved that the account no longer meets isn't shown.
ana.badge = "veterano";
assert.equal(wornBadge(ana), null);
assert.equal(sanitizeUser(ana).badge, null);

// "Perfección": Trivia or Adivina la canción, at least 10 rounds, all right.
const ok = (n) => Array.from({ length: n }, (_, i) => ({ round: i + 1, status: "ok" }));
assert.equal(isPerfectMatch("opciones", ok(10)), true);
assert.equal(isPerfectMatch("musica", ok(15)), true);
assert.equal(isPerfectMatch("opciones", ok(5)), false, "too short");
assert.equal(isPerfectMatch("mundo", ok(10)), false, "only Trivia and Adivina la canción");
assert.equal(isPerfectMatch("opciones", [...ok(9), { round: 10, status: "near" }]), false);

// A finished match counts the game won (against someone) and a perfect match.
applyMatchStats(store, [{ id: "luis", name: "Luis", score: 9000, rounds: ok(10) }, { id: "ana", name: "Ana", score: 100, rounds: [] }], { game: "opciones" });
assert.equal(store.users.luis.stats.winsByGame.opciones, 1);
assert.equal(store.users.luis.stats.perfectGames, 1);
assert.equal(store.users.ana.stats.winsByGame, undefined, "the one who lost wins nothing");
assert.ok(earnedBadges(store.users.luis).includes("perfeccion"));
applyMatchStats(store, [{ id: "luis", name: "Luis", score: 500 }], { game: "mundo" });
assert.equal(store.users.luis.stats.winsByGame.mundo, undefined, "playing alone doesn't count for Todoterreno");

// "Todoterreno": a win in each of the eight games.
for (const game of BADGE_GAMES) applyMatchStats(store, [{ id: "luis", name: "Luis", score: 10 }, { id: "ana", name: "Ana", score: 0 }], { game });
assert.ok(earnedBadges(store.users.luis).includes("todoterreno"));

console.log("badges ok");
