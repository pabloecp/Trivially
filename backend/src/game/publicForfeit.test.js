import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { PUBLIC_KICK_ROUNDS, RoomManager } from "./roomManager.js";

// Partidas públicas: quien sale de la partida (o queda inactivo PUBLIC_KICK_ROUNDS rondas) queda fuera y último; en un
// duelo el otro gana en el acto. Un empate de juegos ganados (también tras el desempate) es empate. El "Saltar" de un
// owner cuenta como respuesta incorrecta.
const catalog = readLocalCatalog();
const user = (i) => ({ id: `u${i}`, name: `Jugador ${i}`, socketId: `s${i}` });
const stop = (room) => clearTimeout(room.timer);

function duel() {
  const mgr = new RoomManager({ catalog, store: { users: {} } });
  const room = mgr.findMatch(user(1), { kind: "casual", size: 2 });
  mgr.findMatch(user(2), { kind: "casual", size: 2 });
  clearTimeout(room.matchmaking.timer);
  mgr.startMatch(room);
  stop(room);
  mgr.beginCountdown(room);
  mgr.beginPlaying(room);
  stop(room);
  return { mgr, room };
}

// Leaving a duel: the other one wins at once.
{
  const { mgr, room } = duel();
  mgr.leave("s2");
  assert.equal(room.phase, "finished");
  assert.equal(room.players.get("u2").forfeit, "salió");
  const ranked = mgr.rankedPlayers(room);
  assert.equal(ranked.at(-1).id, "u2", "the one who left is last");
  assert.equal(mgr.matchWinner(room, ranked), "u1");
  assert.throws(() => mgr.findToJoin(room.code, "u2"), /Saliste/);
}

// Inactive for PUBLIC_KICK_ROUNDS rounds: asked if still there, then taken out (marked idle from the third).
{
  const { mgr, room } = duel();
  const kicked = [];
  mgr.onKicked = (socketId, info) => kicked.push([socketId, info.reason]);
  for (let r = 0; r < PUBLIC_KICK_ROUNDS; r += 1) {
    if (room.phase === "finished") break;
    if (r > 0) {
      mgr.advance(room);
      stop(room);
      if (room.phase === "intro") mgr.beginCountdown(room);
      stop(room);
      mgr.beginPlaying(room);
      stop(room);
    }
    // u1 shows signs of life every round (whatever the game); u2 never does.
    const me = room.players.get("u1");
    me.lastAnswer = { text: "algo", correct: false, at: Date.now() };
    if (me.minefield) me.minefield.pickedTurn = room.turn;
    if (me.rain) me.rain.sent = 1;
    if (room.phase === "playing") mgr.beginReveal(room);
    stop(room);
    if (r === 2) assert.equal(room.players.get("u2").idle, true, "idle from the third round");
  }
  // First it asks if they are still there (a card on their screen); "Sigo aquí" would keep them in.
  assert.deepEqual(kicked, [], "not out yet: asked first");
  const asked = room.players.get("u2");
  assert.ok(mgr.publicState(room).players.find((p) => p.id === "u2").afkUntil > Date.now(), "asked if still there");
  clearTimeout(asked.afkTimer);
  mgr.afkExpire(room, "u2");
  assert.deepEqual(kicked, [["s2", "inactivo"]]);
  assert.equal(room.players.get("u2").forfeit, "inactivo");
  if (room.phase !== "finished") mgr.advance(room);
  assert.equal(room.phase, "finished", "alone: the match ends");
}


// "Sigo aquí" (or any answer) keeps an asked player in.
{
  const { mgr, room } = duel();
  const p = room.players.get("u2");
  p.idleRounds = PUBLIC_KICK_ROUNDS;
  mgr.askStillThere(room, p);
  assert.ok(p.afkTimer);
  mgr.present(room, "u2");
  assert.equal(p.afkTimer, null);
  assert.equal(p.idleRounds, 0);
  mgr.afkExpire(room, "u2");
  assert.equal(p.forfeit, undefined, "still in");
}
// A tie on games won is a tie, whatever the points.
{
  const { mgr, room } = duel();
  room.run.gameWins = { u1: 2, u2: 2 };
  room.players.get("u1").score = 900;
  room.players.get("u2").score = 300;
  assert.equal(mgr.matchWinner(room, mgr.rankedPlayers(room)), null);
  room.run.gameWins.u1 = 3;
  assert.equal(mgr.matchWinner(room, mgr.rankedPlayers(room)), "u1");
}

// An owner's skip: their round is a wrong answer, the others' stays without one.
{
  process.env.OWNER_IDS = "u1";
  const store = { users: { u1: { id: "u1", name: "Jugador 1", email: "o@x.com" } } };
  const mgr = new RoomManager({ catalog, store, questions: [] });
  const room = mgr.create({ host: user(1), mode: "multi", game: "opciones" });
  mgr.addPlayer(room, user(2));
  mgr.start(room, "u1");
  stop(room);
  mgr.beginPlaying(room);
  stop(room);
  mgr.skipRound(room, "u1");
  stop(room);
  const [mine] = room.players.get("u1").rounds;
  const [theirs] = room.players.get("u2").rounds;
  assert.equal(mine.status, "bad");
  assert.equal(theirs.status, "none");
}
// An owner pauses (and resumes) any match, a public one with no host too; anyone else can't.
{
  process.env.OWNER_IDS = "owner-1";
  const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: { "owner-1": { id: "owner-1", name: "Owner" } } } });
  const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "opciones" });
  room.hostId = null;
  room.phase = "playing";
  room.phaseEndsAt = Date.now() + 5000;
  assert.throws(() => mgr.pause(room, "host-1", "host-1"), /Solo el anfitrión/);
  mgr.pause(room, "host-1", "owner-1");
  assert.ok(room.paused, "the owner paused it");
  mgr.resume(room, "host-1", "owner-1");
  assert.equal(room.paused, null);
  clearTimeout(room.timer);
  mgr.destroy(room);
  delete process.env.OWNER_IDS;
}

console.log("publicForfeit ok");
process.exit(0);
