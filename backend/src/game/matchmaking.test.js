import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { CASUAL_GAMES, cleanMatchRequest, findVariant, gamesFor, INTRO_MS, MATCH_GAMES, MATCH_VARIANTS, matchItemConfig, matchMaxGames, matchRoundMs, pickMatchGames, variantsFor } from "./matchmaking.js";

// A match's games are variants ("trivia-cerradas"): the game each one plays.
const gameOf = (variant) => findVariant(variant).game;
import { RoomManager } from "./roomManager.js";

// Partidas públicas: players are put together in a room of their kind and size until it's full, the match starts by
// itself and plays games of 5 rounds, drawn at random, until someone has won two (first to two wins), and every game
// opens with its roulette and tutorial ("intro"). Competitivo is disabled for now; the rounds a client sends are ignored.
assert.throws(() => cleanMatchRequest({ kind: "privada", rounds: 5 }), /tipo de partida/);
assert.throws(() => cleanMatchRequest({ kind: "competitivo" }), /Competitivo no está disponible/);
assert.throws(() => cleanMatchRequest({ kind: "casual", rounds: 5, size: 3 }), /Uno contra Uno o Todos contra Todos/);
assert.deepEqual(cleanMatchRequest({ kind: "casual", rounds: "15" }), { kind: "casual", rounds: 10, size: 5, game: null });
assert.deepEqual(cleanMatchRequest({ kind: "casual", rounds: 5, size: 2 }).size, 2);
for (const [rounds, count] of [[5, 1], [10, 2], [15, 3]]) {
  const games = pickMatchGames(rounds);
  assert.equal(games.length, count, `${rounds} rondas: ${count} juegos`);
  assert.equal(new Set(games).size, count, "never the same game twice");
  assert.ok(games.every((g) => MATCH_GAMES.includes(g)), "only Trivia, Rango and Campo de minas");
}

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const user = (i) => ({ id: `u${i}`, name: `Jugador ${i}`, socketId: `s${i}` });

// The first one opens a public room with no host; the next ones of the same kind and size go into it, whatever rounds
// an older client asks for.
const room = mgr.findMatch(user(1), { kind: "casual", rounds: 15 });
assert.equal(room.hostId, null, "nobody is the host");
assert.equal(mgr.findMatch(user(2), { kind: "casual", rounds: 5 }), room, "same kind and size: same room");
assert.throws(() => mgr.findMatch(user(9), { kind: "competitivo" }), /Competitivo/, "Competitivo is disabled");
assert.throws(() => mgr.findToJoin(room.code, "intruso"), /partida pública/, "nobody joins by code");
assert.equal(mgr.findToJoin(room.code, "u1"), room, "its players can come back to it");
assert.throws(() => mgr.start(room, "u1"), /Solo el Host/, "nobody starts it by hand");

let state = mgr.publicState(room);
assert.deepEqual(
  { kind: state.matchmaking.kind, rounds: state.matchmaking.rounds, count: state.matchmaking.count, size: state.matchmaking.size },
  { kind: "casual", rounds: 10, count: 2, size: 5 }
);

// Full: it starts after a moment, unless someone leaves first.
for (let i = 3; i <= 5; i += 1) mgr.findMatch(user(i), { kind: "casual", rounds: 15 });
assert.ok(room.matchmaking.startsAt, "full: about to start");
assert.notEqual(mgr.findMatch(user(6), { kind: "casual", rounds: 15 }), room, "a full room takes nobody else");
mgr.leave("s5");
assert.equal(room.matchmaking.startsAt, null, "someone left: waiting again");
mgr.findMatch(user(7), { kind: "casual", rounds: 15 });
assert.ok(room.matchmaking.startsAt, "full again");
clearTimeout(room.matchmaking.timer);

// It starts with two games of 5 rounds (Lluvia: 2 showers), the fewest it can take, opening with the first one's
// roulette; the next ones are drawn already, all different while there are some left and never one twice in a row, but
// nobody sees them unless they're played.
mgr.startMatch(room);
clearTimeout(room.timer);
assert.equal(room.matchmaking.games.length, 2, "the two games it takes at least");
assert.equal(room.run.items.length, 2);
assert.equal(room.totalRounds, 10);
assert.equal(room.run.winsToWin, 2, "first to two wins");
const sequence = [...room.run.items, ...room.run.upcoming].map((item) => item.variant);
assert.equal(sequence.length, matchMaxGames(5), "enough games for five players");
assert.equal(new Set(sequence.slice(0, 3)).size, 3, "all different while there are some left");
assert.ok(sequence.every((v, i) => i === 0 || v !== sequence[i - 1]), "never twice in a row");
assert.equal(room.phase, "intro");
assert.equal(room.phaseEndsAt - room.phaseStartedAt, INTRO_MS);
assert.equal(room.game, gameOf(room.matchmaking.games[0]), "the room is already in the first game");
state = mgr.publicState(room, "u1");
assert.deepEqual(state.intro.variants, room.matchmaking.games);
assert.equal(state.intro.winsToWin, 2);
assert.equal(state.playlist.items.length, 2, "nor the games that may come in what's sent");
assert.equal(state.run.upcoming, undefined);
assert.equal(state.intro.variant, room.matchmaking.games[0]);
assert.deepEqual(state.intro.games, room.matchmaking.games.map(gameOf));
assert.equal(state.intro.index, 0);
assert.equal(state.question, null, "nothing of the first round during the intro");

// After the intro, the rounds of the first game; then the second game's roulette.
const skipRound = () => {
  clearTimeout(room.timer);
  mgr.beginPlaying(room);
  clearTimeout(room.timer);
  // Everyone answers something (five rounds without any would take them out of the match: PUBLIC_KICK_ROUNDS).
  for (const p of room.players.values()) {
    p.lastAnswer ||= { text: "algo", correct: false, at: Date.now() };
    if (p.minefield) p.minefield.pickedTurn = room.turn;
    if (p.rain) p.rain.sent = 1;
  }
  mgr.beginReveal(room);
  clearTimeout(room.timer);
  mgr.advance(room);
  clearTimeout(room.timer);
};
mgr.beginCountdown(room);
clearTimeout(room.timer);
assert.equal(room.phase, "countdown", "the intro doesn't come back within the same game");
for (let i = 0; i < 5; i += 1) skipRound();
assert.equal(room.phase, "intro", "the second game, with its roulette");
assert.equal(room.matchmaking.games.length, 2);
assert.equal(room.totalRounds, 10);
assert.equal(room.game, gameOf(room.matchmaking.games[1]));
assert.equal(mgr.publicState(room).intro.index, 1);
clearTimeout(room.timer);

for (const r of [...mgr.rooms.values()]) mgr.destroy(r);

// A duel: each game goes to whoever scores the most in it ("=": both the same, "-": nobody scores), and the match to the
// first to win two alone. Both to one: it's over; one each: a third game; both at two after a tie: another one.
function playDuel(winners, setup = null) {
  const a = user(60 + winners.join("").length * 2);
  const b = { ...user(61 + winners.join("").length * 2) };
  const duelRoom = mgr.findMatch(a, { kind: "casual", size: 2 });
  clearTimeout(duelRoom.matchmaking.botTimer);
  mgr.findMatch(b, { kind: "casual", size: 2 });
  clearTimeout(duelRoom.matchmaking.timer);
  mgr.startMatch(duelRoom);
  setup?.(duelRoom);
  const ids = { a: a.id, b: b.id };
  for (const winner of winners) {
    for (let i = 0; i < 5; i += 1) {
      clearTimeout(duelRoom.timer);
      if (duelRoom.phase === "intro") mgr.beginCountdown(duelRoom);
      clearTimeout(duelRoom.timer);
      mgr.beginPlaying(duelRoom);
      clearTimeout(duelRoom.timer);
      for (const p of duelRoom.players.values()) {
        p.lastAnswer ||= { text: "algo", correct: false, at: Date.now() };
        if (p.minefield) p.minefield.pickedTurn = duelRoom.turn;
      }
      mgr.beginReveal(duelRoom);
      clearTimeout(duelRoom.timer);
      // The game's winner scores less overall than the other did in an earlier game: games won count, not points.
      const scorers = winner === "=" ? ["a", "b"] : winner === "-" ? [] : [winner];
      for (const who of scorers) duelRoom.players.get(ids[who]).score += 100;
      mgr.advance(duelRoom);
      clearTimeout(duelRoom.timer);
    }
  }
  return { duelRoom, ids };
}
{
  const { duelRoom, ids } = playDuel(["a", "a"]);
  assert.equal(duelRoom.phase, "finished", "two games to one player: over");
  assert.equal(duelRoom.run.items.length, 2, "no third game");
  assert.equal(duelRoom.run.winnerId ?? mgr.publicState(duelRoom).run.winnerId, ids.a);
  mgr.destroy(duelRoom);
}
{
  const { duelRoom } = playDuel(["a", "b"]);
  assert.equal(duelRoom.phase, "intro", "one each: a third game's roulette");
  assert.equal(duelRoom.run.items.length, 3);
  assert.equal(duelRoom.matchmaking.games.length, 3);
  assert.equal(duelRoom.totalRounds, 15);
  assert.equal(mgr.publicState(duelRoom).intro.index, 2);
  mgr.destroy(duelRoom);
  const again = playDuel(["a", "b", "b"]);
  assert.equal(again.duelRoom.phase, "finished", "the first to win two takes it");
  const run = mgr.publicState(again.duelRoom).run;
  assert.equal(run.winnerId, again.ids.b, "two games to one");
  assert.deepEqual(run.standings.map((p) => p.wins), [2, 1]);
  assert.equal(run.bestOf, true);
  assert.equal(run.winsToWin, 2);
  mgr.destroy(again.duelRoom);
}
{
  // One each, then a tie: both at two, so neither has won it yet.
  const { duelRoom } = playDuel(["a", "b", "="]);
  assert.equal(duelRoom.phase, "intro", "both reach two together: another game");
  assert.equal(duelRoom.run.items.length, 4);
  mgr.destroy(duelRoom);
  const again = playDuel(["a", "b", "=", "a"]);
  assert.equal(again.duelRoom.phase, "finished");
  assert.equal(mgr.publicState(again.duelRoom).run.winnerId, again.ids.a, "three to two");
  mgr.destroy(again.duelRoom);
}
{
  // A game nobody scores in is nobody's: one each after three games, so a fourth.
  const { duelRoom } = playDuel(["a", "-", "b"]);
  assert.equal(duelRoom.phase, "intro", "one each after three: another game");
  assert.deepEqual(mgr.publicState(duelRoom).run.results.map((g) => g.winners.length), [1, 0, 1]);
  mgr.destroy(duelRoom);
  // Out of games, whoever won the most takes it, and nobody on a tie.
  const out = playDuel(["a", "b"], (r) => (r.run.upcoming = []));
  assert.equal(out.duelRoom.phase, "finished", "no games left: over");
  assert.equal(mgr.matchWinner(out.duelRoom, mgr.rankedPlayers(out.duelRoom)), null, "one each: nobody won");
  mgr.destroy(out.duelRoom);
}
assert.equal(matchMaxGames(5), 7, "five players: up to seven games");
assert.equal(matchMaxGames(2), 4);
assert.equal(matchMaxGames(1), 4);
assert.equal(matchMaxGames(5, 3), 12, "first to three");

// Casual: bots fill the empty seats (only Casual waits for them) and play every game by themselves.
// Duelo: its own rooms, full with two.
const duel = mgr.findMatch(user(30), { kind: "casual", rounds: 5, size: 2 });
assert.notEqual(mgr.findMatch(user(31), { kind: "casual", rounds: 5 }), duel, "5 players: another room");
assert.equal(mgr.findMatch(user(32), { kind: "casual", rounds: 5, size: 2 }), duel);
assert.ok(duel.matchmaking.startsAt, "two players: full");
for (const r of [...mgr.rooms.values()]) mgr.destroy(r);

const lone = mgr.findMatch(user(20), { kind: "casual", rounds: 15 });
assert.ok(lone.matchmaking.botTimer, "Casual: bots are on their way");
clearTimeout(lone.matchmaking.botTimer);
while (mgr.connectedCount(lone) < lone.matchmaking.size) mgr.addBot(lone);
const bots = [...lone.players.values()].filter((p) => p.bot);
assert.equal(bots.length, 4);
assert.equal(new Set(bots.map((b) => b.name)).size, 4, "every bot has its own name");
const seen = mgr.publicState(lone).players.find((p) => p.id === bots[0].id);
assert.equal(seen.bot, undefined, "nobody can tell a bot from a person");
assert.ok(seen.isGuest && bots[0].id.startsWith("gst_"), "bots look like guests");
mgr.checkMatchFull(lone);
assert.ok(lone.matchmaking.startsAt, "bots fill the room: it starts");
clearTimeout(lone.matchmaking.timer);
mgr.startMatch(lone);
clearTimeout(lone.timer);
assert.equal(lone.matchmaking.games.length, 2);
// Only those two for the bots to play, whoever wins them.
lone.run.upcoming = [];

// Every game of the match: each bot answers its rounds, whichever of the six games it is.
const answeredBy = new Set();
for (let round = 0; lone.phase !== "finished" && round < 20; round += 1) {
  if (lone.phase === "intro") mgr.beginCountdown(lone);
  clearTimeout(lone.timer);
  mgr.beginPlaying(lone);
  mgr.clearBotMoves(lone);
  clearTimeout(lone.timer);
  // Every game has its own clock: 10 s a question or a turn, 15 s a song or a country, 30 s a shower or a race.
  const race = mgr.isMinesRace(lone);
  const expected = matchRoundMs(lone.game, race);
  assert.equal(lone.phaseEndsAt - lone.phaseStartedAt, expected, `${lone.game}${race ? " (carrera)" : ""}: its time`);
  if (lone.game === "opciones") assert.equal(lone.config.quiz.roundMs, 10000, "the screen's timer reads the same 10 s");
  // Lluvia: some way into the shower, so questions are falling; bots try a few times, as they keep going in a round.
  const rain = mgr.isRainRound(lone);
  if (rain) lone.phaseStartedAt -= 8000;
  for (const bot of bots) {
    for (let tries = rain ? 12 : 1; tries > 0; tries -= 1) {
      if (rain) lone.players.get(bot.id).rain.sentAt = 0;
      try {
        mgr.botMove(lone, lone.players.get(bot.id));
      } catch (err) {
        assert.match(err.message, /ya eligió|Ya elegiste|No se aceptan|fuera/, `${lone.game}: ${err.message}`);
      }
    }
    mgr.clearBotMoves(lone);
    clearTimeout(lone.timer);
    const p = lone.players.get(bot.id);
    if (p.lastAnswer || p.minefield?.pickedTurn || p.rain?.sent) answeredBy.add(`${lone.game}:${bot.id}`);
  }
  if (lone.phase === "playing") mgr.beginReveal(lone);
  mgr.clearBotMoves(lone);
  clearTimeout(lone.timer);
  mgr.advance(lone);
  mgr.clearBotMoves(lone);
  clearTimeout(lone.timer);
}
assert.equal(lone.matchmaking.games.length, 2);
for (const game of lone.matchmaking.games.map(gameOf)) {
  assert.ok(bots.some((b) => answeredBy.has(`${game}:${b.id}`)), `the bots play ${game}`);
}
assert.ok(bots.some((b) => lone.players.get(b.id).score > 0), "bots score points");

// The last person leaving closes the room, even with bots in it.
mgr.leave("s20");
assert.equal(mgr.rooms.get(lone.code), undefined, "only bots left: closed");

// Casual and Competitivo draw among the same three games; each game keeps its own clock.
assert.deepEqual(gamesFor("competitivo"), MATCH_GAMES);
assert.deepEqual(gamesFor("casual"), MATCH_GAMES);
assert.equal(CASUAL_GAMES.length, 3);
assert.equal(pickMatchGames(null, Math.random, CASUAL_GAMES).length, 3, "the whole pool, shuffled");
assert.equal(matchRoundMs("musica"), 15000);
assert.equal(matchRoundMs("lluvia"), 30000);
assert.equal(matchItemConfig("lluvia", "casual").rounds, 2, "two showers");

// A full Casual room plays different games.
const many = mgr.findMatch(user(40), { kind: "casual", rounds: 15 });
mgr.startMatch(many);
const manyGames = [...many.run.items, ...many.run.upcoming].map((item) => item.variant);
assert.ok(manyGames.every((v) => variantsFor("casual").includes(v)));

// The roulette draws each game with one way of playing it, and that way is all its rounds have.
// (Adivina la canción, Encuentra el país and Lluvia have a variant too, only searched for by name: the roulette skips them.)
assert.equal(variantsFor("casual").length, 4);
assert.deepEqual(variantsFor("competitivo"), MATCH_VARIANTS.filter((v) => MATCH_GAMES.includes(v.game)).map((v) => v.id));
assert.deepEqual(matchItemConfig("opciones", "casual", { variant: "trivia-cerradas" }).formats, ["opciones"]);
assert.deepEqual(matchItemConfig("minas", "casual", { variant: "minas-carrera" }).styles, ["carrera"]);
const ways = mgr.findMatch(user(50), { kind: "casual" });
mgr.startMatch(ways);
for (const item of [...ways.run.items, ...ways.run.upcoming]) {
  const expected = findVariant(item.variant).config;
  for (const key of Object.keys(expected)) assert.deepEqual(item.config[key], expected[key], `${item.variant}: only its way`);
}
// …and every round drawn for it is of that way.
for (const track of ways.tracks) {
  const variant = ways.matchmaking.games[track.playlistItem];
  if (variant.startsWith("trivia")) assert.equal(track.type === "choice" ? "trivia-cerradas" : "trivia-abiertas", variant, `${variant}: ${track.type}`);
  if (variant === "rango-cifras") assert.equal(track.kind, "cifras");
  if (variant.startsWith("minas")) assert.equal(`minas-${track.style}`, variant);
}

for (const r of [...mgr.rooms.values()]) mgr.destroy(r);
console.log("matchmaking ok");
