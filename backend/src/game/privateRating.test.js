import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { botProfile } from "./bots.js";
import { ELO_START, TOGETHER_LIMIT, TOGETHER_WINDOW_MS } from "./elo.js";
import { RoomManager } from "./roomManager.js";

// Private matches move the elo (and a Clásico, the rank), with a limit per rival inside a window of time; every match says
// at its end how much it moved for each player (publicState's `ratings`).
const store = { users: {} };
const account = (id) => {
  store.users[id] = { id, name: id, isGuest: false, avatar: "#2F6BFF", stats: { totalScore: 0, bestScore: 0, gamesPlayed: 0, wins: 0, bestStreak: 0, correctAnswers: 0 } };
  return { id, name: id, socketId: `s_${id}`, isGuest: false };
};
const guest = (id) => ({ id, name: id, socketId: `s_${id}`, isGuest: true });
const mgr = new RoomManager({ catalog: readLocalCatalog(), store });
const elo = (id, game = "opciones") => store.users[id].elo?.[game]?.rating ?? ELO_START;

/** A private room of one game with these players, started, its timers stopped. */
function privateRoom(host, ...others) {
  const room = mgr.create({ host, mode: "multi", game: "opciones" });
  for (const p of others) mgr.addPlayer(room, p);
  mgr.start(room, host.id);
  clearTimeout(room.timer);
  return room;
}

/** Ends a match as if played to its last round, with these points. */
function playOut(room, scores) {
  for (const [id, score] of Object.entries(scores)) room.players.get(id).score = score;
  mgr.finish(room);
  clearTimeout(room.timer);
}

// One game between two accounts: the winner gains, the loser loses, and it's said at the end for each of them.
const ana = account("ana");
const leo = account("leo");
{
  const room = privateRoom(ana, leo);
  playOut(room, { ana: 900, leo: 100 });
  assert.ok(elo("ana") > ELO_START, "the winner gains");
  assert.ok(elo("leo") < ELO_START, "the loser loses");
  const { ratings } = mgr.publicState(room);
  assert.equal(ratings.rank, null, "one game moves no rank");
  assert.equal(ratings.games.length, 1);
  const mine = ratings.games[0].changes.find((c) => c.id === "ana");
  assert.deepEqual(mine, { id: "ana", before: ELO_START, after: elo("ana"), delta: elo("ana") - ELO_START, limited: false });
  mgr.destroy(room);
}

// A guest makes nobody's elo move: otherwise a second tab would be a way of getting wins out of nothing.
{
  const before = elo("ana");
  const room = privateRoom(ana, guest("gst_1"));
  playOut(room, { ana: 900, gst_1: 100 });
  assert.equal(elo("ana"), before);
  assert.equal(mgr.publicState(room).ratings, null, "nothing to show");
  mgr.destroy(room);
}

// A guest beside two accounts: they count for each other, the guest doesn't, and it has no line in the results.
{
  store.users.ana.together = {};
  const before = elo("ana");
  const room = privateRoom(ana, leo, guest("gst_2"));
  playOut(room, { ana: 500, leo: 100, gst_2: 900 });
  assert.ok(elo("ana") > before, "first among those who count");
  assert.deepEqual(mgr.publicState(room).ratings.games[0].changes.map((c) => c.id).sort(), ["ana", "leo"]);
  mgr.destroy(room);
}

// Ended by the host before its time: it moves nothing, and doesn't count as a match together.
{
  store.users.ana.together = {};
  store.users.leo.together = {};
  const before = elo("ana");
  const room = privateRoom(ana, leo);
  room.players.get("ana").score = 900;
  mgr.endByHost(room, "ana");
  clearTimeout(room.timer);
  assert.equal(elo("ana"), before);
  assert.equal(mgr.publicState(room).ratings, null);
  assert.equal(store.users.ana.together.leo, undefined);
  mgr.destroy(room);
}

// The same two, again and again: the first TOGETHER_LIMIT matches count, the next no longer moves their elo...
{
  store.users.ana.together = {};
  store.users.leo.together = {};
  for (let i = 0; i < TOGETHER_LIMIT; i += 1) {
    const before = elo("ana");
    const room = privateRoom(ana, leo);
    playOut(room, { ana: 900, leo: 100 });
    assert.ok(elo("ana") > before, `match ${i + 1} counts`);
    mgr.destroy(room);
  }
  const before = elo("ana");
  const room = privateRoom(ana, leo);
  playOut(room, { ana: 900, leo: 100 });
  assert.equal(elo("ana"), before, "this one doesn't");
  const change = mgr.publicState(room).ratings.games[0].changes.find((c) => c.id === "ana");
  assert.equal(change.delta, 0);
  assert.equal(change.limited, true, "and the results can say why");
  assert.equal(store.users.ana.together.leo.length, TOGETHER_LIMIT, "only the matches that counted are kept");
  mgr.destroy(room);

  // ...until the time has gone by.
  store.users.ana.together.leo = store.users.ana.together.leo.map((at) => at - TOGETHER_WINDOW_MS);
  store.users.leo.together.ana = store.users.leo.together.ana.map((at) => at - TOGETHER_WINDOW_MS);
  const later = privateRoom(ana, leo);
  playOut(later, { ana: 900, leo: 100 });
  assert.ok(elo("ana") > before, "a day later it counts again");
  mgr.destroy(later);
}

// A rival who no longer counts doesn't stop the others from counting.
{
  const eva = account("eva");
  const before = elo("ana");
  store.users.ana.together = { leo: Array(TOGETHER_LIMIT).fill(Date.now()) };
  const room = privateRoom(ana, leo, eva);
  playOut(room, { ana: 900, leo: 100, eva: 300 });
  assert.ok(elo("ana") > before, "Eva still counts for Ana");
  const change = mgr.publicState(room).ratings.games[0].changes.find((c) => c.id === "eva");
  assert.equal(change.limited, false);
  mgr.destroy(room);
}

// A public game with a guest: the guest is left out of the count, as if it hadn't played.
{
  const kai = account("kai");
  const ivo = account("ivo");
  const room = mgr.findMatch(kai, { kind: "casual", game: "opciones" });
  clearTimeout(room.matchmaking.botTimer);
  mgr.findMatch(ivo, { kind: "casual", game: "opciones" });
  const g = { id: "gst_pub", name: "Invitado", isGuest: true };
  const players = [...room.players.values(), g];
  const pts = { kai: 500, ivo: 100, gst_pub: 900 };
  const changes = mgr.rateGame(room, "opciones", players, (p) => pts[p.id]);
  assert.equal(changes.find((c) => c.id === "kai").delta, 60, "first, the guest above doesn't count");
  assert.equal(changes.length, 2);
  mgr.destroy(room);
}

// A private Clásico: each game moves that game's elo, whoever wins the match, and the match moves the rank.
function playGame(room, scores) {
  const item = room.tracks[room.currentRound].playlistItem;
  while (room.phase !== "finished" && room.tracks[room.currentRound]?.playlistItem === item) {
    clearTimeout(room.timer);
    mgr.beginPlaying(room);
    clearTimeout(room.timer);
    for (const p of room.players.values()) if (p.minefield) p.minefield.pickedTurn = room.turn;
    mgr.beginReveal(room);
    clearTimeout(room.timer);
    for (const [id, score] of Object.entries(scores)) room.players.get(id).score += score;
    mgr.advance(room);
    clearTimeout(room.timer);
  }
}
{
  const mia = account("mia");
  const noa = account("noa");
  const room = mgr.create({ host: mia, mode: "multi", game: "clasico" });
  mgr.addPlayer(room, noa);
  mgr.start(room, "mia");
  clearTimeout(room.timer);

  // Noa wins the first game; Mía the next two, and with them the match.
  const lost = room.run.items[0].game;
  mgr.beginCountdown(room);
  playGame(room, { noa: 100 });
  assert.ok(store.users.mia.elo[lost].rating < ELO_START, "the game she lost takes elo off her, even if she ends up winning");
  assert.ok(store.users.noa.elo[lost].rating > ELO_START);
  assert.equal(store.users.mia.rank, undefined, "the rank waits for the end of the match");
  const previous = mgr.publicState(room).intro.previous;
  assert.ok(previous.ranking.find((r) => r.id === "noa").elo.delta > 0, "the next game's intro says what each one got");
  assert.equal(store.users.mia.together.noa.length, 1);

  mgr.beginCountdown(room);
  playGame(room, { mia: 100 });
  assert.equal(store.users.mia.together.noa.length, 1, "all its games are one match together");
  mgr.beginCountdown(room);
  playGame(room, { mia: 100 });
  assert.equal(room.phase, "finished");
  assert.equal(mgr.publicState(room).run.winnerId, "mia");

  assert.ok(store.users.mia.elo[lost].rating < ELO_START || room.run.items.filter((i) => i.game === lost).length > 1);
  assert.equal(store.users.mia.rank.points, 25, "the match's winner goes up");
  assert.equal(store.users.mia.rank.wins, 1);
  assert.equal(store.users.noa.rank.points, 0, "the rank never goes below 0");
  const { ratings } = mgr.publicState(room);
  assert.deepEqual(ratings.rank.find((c) => c.id === "mia"), { id: "mia", before: 0, after: 25, delta: 25, limited: false });
  assert.equal(ratings.games.length, 3, "and each of its games is there");
  mgr.destroy(room);
}

// A public Clásico with bots: one that looks like an account has a rank like anyone's, one that looks like a guest has
// nothing to show, as a real guest; and the `bot` flag never goes out with what the results say.
{
  const zoe = account("zoe");
  const room = mgr.findMatch(zoe, { kind: "casual" });
  clearTimeout(room.matchmaking.botTimer);
  const bots = [...Array(4)].map(() => mgr.addBot(room));
  for (const r of [room]) clearTimeout(r.matchmaking.fullTimer);
  const players = [...room.players.values()];
  assert.equal(players.length, 5);
  room.run = { gameWins: { zoe: 2 }, gameBase: {}, items: [], standings: {}, games: [] };
  room.participants = new Set(players.map((p) => p.id));
  room.players.get("zoe").score = 900;
  mgr.finish(room);
  const rank = room.ratings.rank;
  for (const p of players.filter((q) => q.bot)) {
    const shown = rank.find((c) => c.id === p.id);
    assert.equal(Boolean(shown), !botProfile(p.id).isGuest, "a rank only if it looks like an account");
    if (shown) assert.equal(shown.after, botProfile(p.id).rank.points);
  }
  const counted = players.filter((p) => !p.bot || !botProfile(p.id).isGuest).length;
  assert.equal(rank.find((c) => c.id === "zoe").delta, counted > 1 ? (counted === 2 ? 25 : 30) : 0, "first among those with an account");
  assert.ok(!JSON.stringify(rank).includes("bot"));
  assert.equal(bots.length, 4);
  mgr.destroy(room);
}

console.log("private rating ok");
