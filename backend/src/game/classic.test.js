import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { CLASSIC_GAMES, findVariant, INTRO_MS, MATCH_QUESTION_MS, matchGameRounds } from "./matchmaking.js";
import { RoomManager } from "./roomManager.js";

// Clásico (Normal and Extendido): a private room's host starts a match like a Casual one, with its roulette, tutorials
// and clocks, for the room's own players; when it ends (or is stopped) the room is back in the Clásico it came from.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: null });
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
room.playlist = { name: "La mía", order: "orden", items: [] };

for (const [game, count] of Object.entries(CLASSIC_GAMES)) {
  mgr.setGame(room, "host-1", game);
  assert.equal(room.game, game);
  assert.throws(() => mgr.start(room, "p-2"), /Solo el Host/, "only the host starts it");

  mgr.start(room, "host-1");
  clearTimeout(room.timer);
  assert.equal(room.run.classic, game);
  assert.equal(room.run.items.length, count, `${game}: ${count} juegos`);
  assert.equal(new Set(room.run.items.map((i) => i.variant)).size, count, "never the same variant twice");
  // Each game its own rounds, like a public match's: Campo de minas 3, the others 5.
  for (const item of room.run.items) assert.equal(item.config.rounds, matchGameRounds(item.game), `${item.game}: its rounds`);
  assert.equal(room.totalRounds, room.run.items.reduce((sum, item) => sum + matchGameRounds(item.game), 0));
  assert.equal(room.phase, "intro", "every game opens with its roulette");
  assert.equal(room.phaseEndsAt - room.phaseStartedAt, INTRO_MS);
  assert.equal(room.game, findVariant(room.run.items[0].variant).game, "the room is in the first game");
  assert.equal(room.matchmaking, undefined, "still a private room");
  assert.equal(room.hostId, "host-1", "with its host");
  assert.equal(room.playlist.name, "La mía", "the room's own playlist is left alone");
  const state = mgr.publicState(room);
  assert.equal(state.run.classic, game);
  assert.equal(state.intro.index, 0);
  assert.equal(state.intro.ballot, null, "no votes: the roulette spins among the games");
  assert.equal(state.question, null, "nothing of the round during the roulette");

  // The public match's clock, not the game's own settings.
  if (room.game !== "minas") assert.equal(mgr.roundMs(room), MATCH_QUESTION_MS);

  // "Terminar" goes back to the Clásico's lobby.
  mgr.setGame(room, "host-1", null);
  assert.equal(room.game, game);
  assert.equal(room.run, null);
  assert.equal(room.phase, "lobby");

  // Played to the end: its results, then "Jugar otra vez" draws it again.
  mgr.start(room, "host-1");
  clearTimeout(room.timer);
  mgr.finish(room);
  assert.equal(room.phase, "finished");
  assert.equal(room.game, game, "the results are the Clásico's");
  assert.ok(room.run.finished);
  mgr.replay(room, "host-1");
  clearTimeout(room.timer);
  assert.equal(room.run.classic, game);
  assert.equal(room.phase, "intro");
  mgr.restart(room, "host-1");
  assert.equal(room.game, game, "Volver al lobby: the Clásico's lobby");
  assert.equal(room.phase, "lobby");
}

console.log("classic ok");
