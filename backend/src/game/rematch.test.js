import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

// "Revancha": al final de una partida Casual, cada jugador la pide; cuando todos los que siguen en ella la pidieron, la
// sala vuelve a esperar como una partida nueva con los mismos jugadores. Los bots la piden solos. Quien salió no cuenta.
const catalog = readLocalCatalog();
const user = (i) => ({ id: `u${i}`, name: `Jugador ${i}`, socketId: `s${i}` });
const stop = (room) => clearTimeout(room.timer);

function finishedDuel() {
  const mgr = new RoomManager({ catalog, store: { users: {} } });
  const room = mgr.findMatch(user(1), { kind: "casual", size: 2 });
  mgr.findMatch(user(2), { kind: "casual", size: 2 });
  clearTimeout(room.matchmaking.timer);
  clearTimeout(room.matchmaking.botTimer);
  mgr.startMatch(room);
  stop(room);
  room.players.get("u1").score = 700;
  mgr.finish(room);
  stop(room);
  return { mgr, room };
}
const settle = (mgr, room) => {
  clearTimeout(room.matchmaking.timer);
  clearTimeout(room.matchmaking.botTimer);
  mgr.destroy(room);
};

// Not before the match is over.
{
  const mgr = new RoomManager({ catalog, store: { users: {} } });
  const room = mgr.findMatch(user(1), { kind: "casual", size: 2 });
  mgr.findMatch(user(2), { kind: "casual", size: 2 });
  clearTimeout(room.matchmaking.timer);
  mgr.startMatch(room);
  stop(room);
  assert.throws(() => mgr.requestRematch(room, "u1"), /aún no ha terminado/);
  settle(mgr, room);
}

// Two players: it starts when both have asked, with the same players and fresh scores.
{
  const { mgr, room } = finishedDuel();
  assert.equal(room.phase, "finished");
  mgr.requestRematch(room, "u1");
  assert.equal(room.phase, "finished", "waits for the other one");
  assert.deepEqual(mgr.publicState(room).rematch, { asked: ["u1"], total: 2 });
  mgr.requestRematch(room, "u1");
  assert.equal(room.phase, "finished", "asking twice doesn't count for the other");
  mgr.requestRematch(room, "u2");
  assert.equal(room.phase, "lobby", "everyone asked: a new match waits");
  assert.equal(room.rematch, null);
  assert.equal(mgr.publicState(room).rematch, null);
  assert.equal(room.run, null);
  assert.deepEqual([...room.players.keys()].sort(), ["u1", "u2"], "same players");
  assert.equal(room.players.get("u1").score, 0, "scores start over");
  assert.ok(room.matchmaking.startsAt, "full again: it starts by itself in a moment");
  assert.equal(room.matchmaking.games, null);
  settle(mgr, room);
}

// Whoever left can't ask, and the others don't wait for them.
{
  const { mgr, room } = finishedDuel();
  mgr.requestRematch(room, "u1");
  mgr.leave("s2");
  assert.equal(room.phase, "lobby", "the one who stayed is alone with everyone who was still there asking");
  assert.ok(room.players.has("u1"));
  assert.ok(!room.players.has("u2") || !room.players.get("u2").connected);
  settle(mgr, room);
}
{
  const { mgr, room } = finishedDuel();
  mgr.leave("s2");
  assert.throws(() => mgr.requestRematch(room, "u2"), /Ya saliste/);
  settle(mgr, room);
}

// Bots ask by themselves: with the person's request they are all that's missing.
{
  const mgr = new RoomManager({ catalog, store: { users: {} } });
  const room = mgr.findMatch(user(1), { kind: "casual", size: 5 });
  clearTimeout(room.matchmaking.botTimer);
  for (let i = 0; i < 4; i += 1) mgr.addBot(room);
  clearTimeout(room.matchmaking.timer);
  mgr.startMatch(room);
  stop(room);
  mgr.finish(room);
  stop(room);
  mgr.requestRematch(room, "u1");
  const bots = [...room.players.values()].filter((p) => p.bot);
  assert.equal(bots.length, 4);
  assert.equal(room.rematch.botTimers.length, 4, "each bot answers in its own time");
  assert.equal(room.phase, "finished", "still waiting for the bots");
  assert.deepEqual(mgr.publicState(room).rematch.asked, ["u1"]);
  for (const bot of bots) {
    room.rematch.ids.add(bot.id);
    mgr.checkRematch(room);
  }
  assert.equal(room.phase, "lobby");
  assert.equal(room.players.size, 5, "the same five");
  settle(mgr, room);
}

console.log("rematch ok");
