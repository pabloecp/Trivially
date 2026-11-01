import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { CLASSIC_WINS, findVariant, INTRO_MS, MATCH_QUESTION_MS, matchMaxGames, variantsFor } from "./matchmaking.js";
import { RoomManager } from "./roomManager.js";

// Clásico: a private room's host starts a match like a Casual one, with its roulette, tutorials and clocks, for the
// room's own players, won by the first to win two games ("extendido", not offered for now, three); when it ends (or is
// stopped) the room is back in the Clásico it came from.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: null });
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
room.playlist = { name: "La mía", order: "orden", items: [] };

// Plays the game on now to its end, `winner` scoring in it (nobody with null).
function playGame(winner) {
  const item = room.tracks[room.currentRound].playlistItem;
  while (room.phase !== "finished" && room.tracks[room.currentRound]?.playlistItem === item) {
    clearTimeout(room.timer);
    mgr.beginPlaying(room);
    clearTimeout(room.timer);
    for (const p of room.players.values()) {
      if (p.minefield) p.minefield.pickedTurn = room.turn;
    }
    mgr.beginReveal(room);
    clearTimeout(room.timer);
    if (winner) room.players.get(winner).score += 100;
    mgr.advance(room);
    clearTimeout(room.timer);
  }
}

for (const [game, wins] of Object.entries(CLASSIC_WINS)) {
  mgr.setGame(room, "host-1", game);
  assert.equal(room.game, game);
  assert.throws(() => mgr.start(room, "p-2"), /Solo el Host/, "only the host starts it");

  mgr.start(room, "host-1");
  clearTimeout(room.timer);
  assert.equal(room.run.classic, game);
  assert.equal(room.run.winsToWin, wins, `${game}: first to ${wins}`);
  // The games it takes at least are played for sure; the others are drawn already, one more each time nobody has won.
  assert.equal(room.run.items.length, wins);
  const sequence = [...room.run.items, ...room.run.upcoming].map((i) => i.variant);
  assert.equal(sequence.length, matchMaxGames(2, wins));
  // Each variant once while there are some left, never one right after itself.
  // (The test's bank has no four-option questions, so one variant can't be played.)
  const playable = variantsFor("casual").length - 1;
  assert.equal(new Set(sequence.slice(0, playable)).size, playable, "never the same variant twice");
  assert.ok(sequence.every((v, i) => i === 0 || v !== sequence[i - 1]), "nor twice in a row");
  assert.equal(room.totalRounds, wins * 5);
  assert.equal(room.phase, "intro", "every game opens with its roulette");
  assert.equal(room.phaseEndsAt - room.phaseStartedAt, INTRO_MS);
  assert.equal(room.game, findVariant(room.run.items[0].variant).game, "the room is in the first game");
  assert.equal(room.matchmaking, undefined, "still a private room");
  assert.equal(room.hostId, "host-1", "with its host");
  assert.equal(room.playlist.name, "La mía", "the room's own playlist is left alone");
  const state = mgr.publicState(room);
  assert.equal(state.run.classic, game);
  assert.equal(state.run.winsToWin, wins);
  assert.equal(state.intro.index, 0);
  assert.equal(state.intro.winsToWin, wins);
  assert.equal(state.question, null, "nothing of the round during the roulette");

  // The public match's clock, not the game's own settings.
  if (room.game !== "minas") assert.equal(mgr.roundMs(room), MATCH_QUESTION_MS);

  // Decided by games won, like a public match: Host wins the first game, and the next one starts with who won it.
  mgr.beginCountdown(room);
  playGame("host-1");
  assert.equal(room.run.gameWins["host-1"], 1);
  assert.deepEqual(mgr.publicState(room).run.results, [{ variant: room.run.items[0].variant, winners: ["host-1"] }]);
  assert.equal(room.phase, "intro", "nobody has won it yet: the next game's roulette");
  assert.equal(room.run.items.length, wins);
  assert.equal(mgr.publicState(room).intro.previous.winners[0], "host-1");
  // Ana wins the next ones: she's the first to get there.
  for (let i = 1; i <= wins; i += 1) {
    assert.notEqual(room.phase, "finished", `${game}: not over with ${i - 1} of Ana's`);
    mgr.beginCountdown(room);
    playGame("p-2");
  }
  assert.equal(room.phase, "finished");
  assert.equal(room.run.items.length, wins + 1);
  assert.equal(room.game, game, "the results are the Clásico's");
  assert.ok(room.run.finished);
  assert.equal(mgr.publicState(room).run.winnerId, "p-2");

  // "Jugar otra vez" draws it again.
  mgr.replay(room, "host-1");
  clearTimeout(room.timer);
  assert.equal(room.run.classic, game);
  assert.equal(room.run.items.length, wins);
  assert.deepEqual(room.run.gameWins, {});
  assert.equal(room.phase, "intro");

  // "Terminar" goes back to the Clásico's lobby.
  mgr.setGame(room, "host-1", null);
  assert.equal(room.game, game);
  assert.equal(room.run, null);
  assert.equal(room.phase, "lobby");

  // Ended by the host: its results, then "Volver al lobby".
  mgr.start(room, "host-1");
  clearTimeout(room.timer);
  mgr.finish(room);
  assert.equal(room.phase, "finished");
  assert.equal(room.game, game);
  mgr.restart(room, "host-1");
  assert.equal(room.game, game, "Volver al lobby: the Clásico's lobby");
  assert.equal(room.phase, "lobby");
}

console.log("classic ok");
