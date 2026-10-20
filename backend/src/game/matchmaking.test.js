import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { CASUAL_GAMES, cleanMatchRequest, findVariant, gamesFor, INTRO_MS, MATCH_GAMES, MATCH_VARIANTS, matchItemConfig, matchRoundMs, pickMatchGames, variantsFor } from "./matchmaking.js";

// A match's games are variants ("trivia-cerradas"): the game each one plays.
const gameOf = (variant) => findVariant(variant).game;
import { MINES_FIRST_TURN_EXTRA_MS } from "./mines.js";
import { RoomManager } from "./roomManager.js";

// Partidas públicas: players are put together in a room of their kind and length until it's full, the match starts by
// itself with one game per 5 rounds (all different), and every game opens with its roulette and tutorial ("intro").
assert.throws(() => cleanMatchRequest({ kind: "privada", rounds: 5 }), /Casual o Competitivo/);
assert.throws(() => cleanMatchRequest({ kind: "casual", rounds: 10 }), /5 o 15/);
assert.throws(() => cleanMatchRequest({ kind: "casual", rounds: 5, size: 3 }), /Duelo o Todos contra todos/);
assert.deepEqual(cleanMatchRequest({ kind: "competitivo", rounds: "15" }), { kind: "competitivo", rounds: 15, size: 5 });
assert.deepEqual(cleanMatchRequest({ kind: "casual", rounds: 5, size: 2 }).size, 2);
for (const [rounds, count] of [[5, 1], [10, 2], [15, 3]]) {
  const games = pickMatchGames(rounds);
  assert.equal(games.length, count, `${rounds} rondas: ${count} juegos`);
  assert.equal(new Set(games).size, count, "never the same game twice");
  assert.ok(games.every((g) => MATCH_GAMES.includes(g)), "only Trivia, Rango and Campo de minas");
}

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const user = (i) => ({ id: `u${i}`, name: `Jugador ${i}`, socketId: `s${i}` });

// The first one opens a public room with no host; the next ones of the same kind and length go into it.
const room = mgr.findMatch(user(1), { kind: "casual", rounds: 15 });
assert.equal(room.hostId, null, "nobody is the host");
assert.equal(mgr.findMatch(user(2), { kind: "casual", rounds: 15 }), room, "same kind and length: same room");
const other = mgr.findMatch(user(9), { kind: "competitivo", rounds: 15 });
assert.notEqual(other, room, "another kind: another room");
assert.throws(() => mgr.findToJoin(room.code, "intruso"), /partida pública/, "nobody joins by code");
assert.equal(mgr.findToJoin(room.code, "u1"), room, "its players can come back to it");
assert.throws(() => mgr.start(room, "u1"), /Solo el Host/, "nobody starts it by hand");

let state = mgr.publicState(room);
assert.deepEqual(
  { kind: state.matchmaking.kind, rounds: state.matchmaking.rounds, count: state.matchmaking.count, size: state.matchmaking.size },
  { kind: "casual", rounds: 15, count: 2, size: 5 }
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

// It starts: three different games of 5 rounds each (Lluvia: 2 showers), opening with the first game's roulette.
mgr.startMatch(room);
clearTimeout(room.timer);
assert.equal(room.matchmaking.games.length, 3);
assert.equal(room.totalRounds, 15);
assert.equal(room.phase, "intro");
assert.equal(room.phaseEndsAt - room.phaseStartedAt, INTRO_MS);
assert.equal(room.game, gameOf(room.matchmaking.games[0]), "the room is already in the first game");
state = mgr.publicState(room, "u1");
assert.deepEqual(state.intro.variants, room.matchmaking.games);
assert.equal(state.intro.variant, room.matchmaking.games[0]);
assert.deepEqual(state.intro.games, room.matchmaking.games.map(gameOf));
assert.equal(state.intro.index, 0);
assert.equal(state.question, null, "nothing of the first round during the intro");

// After the intro, the rounds of the first game; then the second game's roulette.
const skipRound = () => {
  clearTimeout(room.timer);
  mgr.beginPlaying(room);
  clearTimeout(room.timer);
  mgr.beginReveal(room);
  clearTimeout(room.timer);
  mgr.advance(room);
  clearTimeout(room.timer);
};
mgr.beginCountdown(room);
clearTimeout(room.timer);
assert.equal(room.phase, "countdown", "the intro doesn't come back within the same game");
for (let i = 0; i < 5; i += 1) skipRound();
assert.equal(room.phase, "intro", "a new game: its roulette");
assert.equal(room.game, gameOf(room.matchmaking.games[1]));
assert.equal(mgr.publicState(room).intro.index, 1);
clearTimeout(room.timer);

for (const r of [...mgr.rooms.values()]) mgr.destroy(r);

// Casual: bots fill the empty seats (only Casual waits for them) and play every game by themselves.
// Duelo: its own rooms, full with two.
const duel = mgr.findMatch(user(30), { kind: "casual", rounds: 5, size: 2 });
assert.notEqual(mgr.findMatch(user(31), { kind: "casual", rounds: 5 }), duel, "5 players: another room");
assert.equal(mgr.findMatch(user(32), { kind: "casual", rounds: 5, size: 2 }), duel);
assert.ok(duel.matchmaking.startsAt, "two players: full");
mgr.destroy(duel);

const lone = mgr.findMatch(user(20), { kind: "casual", rounds: 15 });
assert.ok(lone.matchmaking.botTimer, "Casual: bots are on their way");
assert.equal(other.matchmaking.botTimer, null, "Competitivo: no bots");
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
assert.equal(lone.matchmaking.games.length, 3);

// Every game of the match: each bot answers its rounds, whichever of the six games it is.
const answeredBy = new Set();
for (let round = 0; round < lone.totalRounds; round += 1) {
  if (lone.phase === "intro") mgr.beginCountdown(lone);
  clearTimeout(lone.timer);
  mgr.beginPlaying(lone);
  mgr.clearBotMoves(lone);
  clearTimeout(lone.timer);
  // Every game has its own clock: 10 s a question or a turn, 15 s a song or a country, 30 s a shower or a race.
  const race = mgr.isMinesRace(lone);
  const expected = matchRoundMs(lone.game, race);
  const firstTurnExtra = lone.game === "minas" && !race ? MINES_FIRST_TURN_EXTRA_MS : 0;
  assert.equal(lone.phaseEndsAt - lone.phaseStartedAt, expected + firstTurnExtra, `${lone.game}${race ? " (carrera)" : ""}: its time`);
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

// A full Casual room of 15 rounds plays the three games, each once.
const many = mgr.findMatch(user(40), { kind: "casual", rounds: 15 });
mgr.startMatch(many);
assert.equal(new Set(many.matchmaking.games).size, many.matchmaking.games.length);
assert.ok(many.matchmaking.games.every((v) => variantsFor("casual").includes(v)));

// The roulette draws each game with one way of playing it, and that way is all its rounds have.
assert.equal(MATCH_VARIANTS.length, 6);
assert.deepEqual(variantsFor("competitivo"), MATCH_VARIANTS.map((v) => v.id));
assert.deepEqual(matchItemConfig("opciones", "casual", { variant: "trivia-cerradas" }).formats, ["opciones"]);
assert.deepEqual(matchItemConfig("minas", "casual", { variant: "minas-carrera" }).styles, ["carrera"]);
const ways = mgr.findMatch(user(50), { kind: "competitivo", rounds: 15 });
mgr.startMatch(ways);
for (const [i, variant] of ways.matchmaking.games.entries()) {
  const config = ways.run.items[i].config;
  const expected = findVariant(variant).config;
  for (const key of Object.keys(expected)) assert.deepEqual(config[key], expected[key], `${variant}: only its way`);
}
// …and every round drawn for it is of that way.
for (const track of ways.tracks) {
  const variant = ways.matchmaking.games[track.playlistItem];
  if (variant.startsWith("trivia")) assert.equal(track.type === "choice" ? "trivia-cerradas" : "trivia-abiertas", variant, `${variant}: ${track.type}`);
  if (variant === "rango-linea") assert.equal(track.kind, "linea");
  if (variant === "rango-cifras") assert.equal(track.kind, "cifras");
  if (variant.startsWith("minas")) assert.equal(`minas-${track.style}`, variant);
}

for (const r of [...mgr.rooms.values()]) mgr.destroy(r);
console.log("matchmaking ok");
