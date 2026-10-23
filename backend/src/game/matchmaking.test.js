import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import {
  botVotes,
  CASUAL_GAMES,
  cleanMatchRequest,
  cleanVotes,
  findVariant,
  gamesFor,
  GAME_ROUNDS,
  INTRO_MS,
  MATCH_GAMES,
  MATCH_VARIANTS,
  matchBallot,
  matchGameRounds,
  matchItemConfig,
  MINES_MATCH_ROUNDS,
  matchRoundMs,
  pickMatchGames,
  RANDOM_VOTE,
  variantsFor,
} from "./matchmaking.js";

// A match's games are variants ("trivia-cerradas"): the game each one plays.
const gameOf = (variant) => findVariant(variant).game;
import { RoomManager } from "./roomManager.js";

// Partidas públicas: players are put together in a room of their kind and length (1 or 3 games) until it's full, the
// match starts by itself with that many games, each with its own rounds (Campo de minas 3, the others 5), and every
// game opens with its roulette and tutorial ("intro").
assert.throws(() => cleanMatchRequest({ kind: "privada", gameCount: 1 }), /Casual o Competitivo/);
assert.throws(() => cleanMatchRequest({ kind: "casual", gameCount: 2 }), /1 o 3 juegos/);
assert.throws(() => cleanMatchRequest({ kind: "casual", gameCount: 1, size: 3 }), /Duelo o Todos contra todos/);
assert.deepEqual(cleanMatchRequest({ kind: "competitivo", gameCount: "3" }), { kind: "competitivo", gameCount: 3, size: 5 });
assert.deepEqual(cleanMatchRequest({ kind: "casual", gameCount: 1, size: 2 }).size, 2);
// An older client sends the length in rounds: 5 was one game and 15 three.
assert.equal(cleanMatchRequest({ kind: "casual", rounds: 5 }).gameCount, 1);
assert.equal(cleanMatchRequest({ kind: "casual", rounds: "15" }).gameCount, 3);
assert.throws(() => cleanMatchRequest({ kind: "casual", rounds: 10 }), /1 o 3 juegos/);
for (const count of [1, 2, 3]) {
  const games = pickMatchGames(count);
  assert.equal(games.length, count, `${count} juegos`);
  assert.equal(new Set(games).size, count, "never the same game twice");
  assert.ok(games.every((g) => MATCH_GAMES.includes(g)), "only Trivia, Rango and Campo de minas");
}

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const user = (i) => ({ id: `u${i}`, name: `Jugador ${i}`, socketId: `s${i}` });

// The first one opens a public room with no host; the next ones of the same kind and length go into it.
const room = mgr.findMatch(user(1), { kind: "casual", gameCount: 3 });
assert.equal(room.hostId, null, "nobody is the host");
assert.equal(mgr.findMatch(user(2), { kind: "casual", gameCount: 3 }), room, "same kind and length (an older client): same room");
assert.notEqual(mgr.findMatch(user(8), { kind: "casual", gameCount: 1 }), room, "another length: another room");
const other = mgr.findMatch(user(9), { kind: "competitivo", gameCount: 3 });
assert.notEqual(other, room, "another kind: another room");
assert.throws(() => mgr.findToJoin(room.code, "intruso"), /partida pública/, "nobody joins by code");
assert.equal(mgr.findToJoin(room.code, "u1"), room, "its players can come back to it");
assert.throws(() => mgr.start(room, "u1"), /Solo el Host/, "nobody starts it by hand");

let state = mgr.publicState(room);
assert.deepEqual(
  { kind: state.matchmaking.kind, gameCount: state.matchmaking.gameCount, count: state.matchmaking.count, size: state.matchmaking.size },
  { kind: "casual", gameCount: 3, count: 2, size: 5 }
);

// Full: it starts after a moment, unless someone leaves first.
for (let i = 3; i <= 5; i += 1) mgr.findMatch(user(i), { kind: "casual", gameCount: 3 });
assert.ok(room.matchmaking.startsAt, "full: about to start");
assert.notEqual(mgr.findMatch(user(6), { kind: "casual", gameCount: 3 }), room, "a full room takes nobody else");
mgr.leave("s5");
assert.equal(room.matchmaking.startsAt, null, "someone left: waiting again");
mgr.findMatch(user(7), { kind: "casual", gameCount: 3 });
assert.ok(room.matchmaking.startsAt, "full again");
clearTimeout(room.matchmaking.timer);

// It starts: three games, each with its own rounds (Campo de minas 3, Lluvia 2 showers, the others 5), opening with the
// first game's roulette.
mgr.startMatch(room);
clearTimeout(room.timer);
assert.equal(room.matchmaking.games.length, 3);
for (const item of room.run.items) assert.equal(item.config.rounds, matchGameRounds(item.game), `${item.game}: its rounds`);
assert.equal(room.totalRounds, room.run.items.reduce((sum, item) => sum + matchGameRounds(item.game), 0));
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
for (let i = matchGameRounds(room.game); i > 0; i -= 1) skipRound();
assert.equal(room.phase, "intro", "a new game: its roulette");
assert.equal(room.game, gameOf(room.matchmaking.games[1]));
assert.equal(mgr.publicState(room).intro.index, 1);
clearTimeout(room.timer);

for (const r of [...mgr.rooms.values()]) mgr.destroy(r);

// Casual: bots fill the empty seats (only Casual waits for them) and play every game by themselves.
// Duelo: its own rooms, full with two.
const duel = mgr.findMatch(user(30), { kind: "casual", gameCount: 1, size: 2 });
assert.notEqual(mgr.findMatch(user(31), { kind: "casual", gameCount: 1 }), duel, "5 players: another room");
assert.equal(mgr.findMatch(user(32), { kind: "casual", gameCount: 1, size: 2 }), duel);
assert.ok(duel.matchmaking.startsAt, "two players: full");
mgr.destroy(duel);

const lone = mgr.findMatch(user(20), { kind: "casual", gameCount: 3 });
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
assert.equal(lone.matchmaking.ballot.length, 15, "bots vote too: three votes each");

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
  assert.equal(lone.phaseEndsAt - lone.phaseStartedAt, expected,`${lone.game}${race ? " (carrera)" : ""}: its time`);
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
assert.equal(matchItemConfig("minas", "competitivo", { variant: "minas-turnos" }).rounds, MINES_MATCH_ROUNDS, "three boards");
assert.equal(MINES_MATCH_ROUNDS, 3);
assert.equal(matchItemConfig("opciones", "casual").rounds, GAME_ROUNDS);
assert.equal(matchItemConfig("historia", "casual").rounds, GAME_ROUNDS);

// A match of a single game: Campo de minas plays its 3 boards, any other game its 5 rounds.
for (let attempt = 0; attempt < 12; attempt += 1) {
  const single = mgr.findMatch(user(70), { kind: "casual", gameCount: 1, size: 2, votes: [attempt % 2 ? "minas-carrera" : "trivia-abiertas"] });
  mgr.findMatch(user(71), { kind: "casual", gameCount: 1, size: 2, votes: [attempt % 2 ? "minas-turnos" : "rango-cifras"] });
  clearTimeout(single.matchmaking.timer);
  mgr.startMatch(single);
  clearTimeout(single.timer);
  assert.equal(single.run.items.length, 1);
  const game = single.run.items[0].game;
  assert.equal(single.totalRounds, game === "minas" ? 3 : 5, `${game}: one game, its rounds`);
  if (attempt % 2) assert.equal(game, "minas", "both voted Campo de minas");
  mgr.destroy(single);
}

// A full Casual room of 3 games plays the three games, each once.
const many = mgr.findMatch(user(40), { kind: "casual", gameCount: 3 });
mgr.startMatch(many);
assert.equal(new Set(many.matchmaking.games).size, many.matchmaking.games.length);
assert.ok(many.matchmaking.games.every((v) => variantsFor("casual").includes(v)));

// The roulette draws each game with one way of playing it, and that way is all its rounds have.
assert.equal(MATCH_VARIANTS.length, 6);
assert.deepEqual(variantsFor("competitivo"), MATCH_VARIANTS.map((v) => v.id));
assert.deepEqual(matchItemConfig("opciones", "casual", { variant: "trivia-cerradas" }).formats, ["opciones"]);
assert.deepEqual(matchItemConfig("minas", "casual", { variant: "minas-carrera" }).styles, ["carrera"]);
const ways = mgr.findMatch(user(50), { kind: "competitivo", gameCount: 3 });
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

// "Vota los juegos": one vote per game, a missing or unknown one being "Al azar".
assert.deepEqual(cleanVotes(["rango-cifras", "musica"], "casual", 3), ["rango-cifras", RANDOM_VOTE, RANDOM_VOTE]);
assert.deepEqual(cleanVotes(null, "competitivo", 1), [RANDOM_VOTE]);
assert.deepEqual(cleanVotes(["minas-turnos", "rango-linea"], "casual", 1), ["minas-turnos"], "no more votes than games");
for (let i = 0; i < 20; i += 1) {
  const votes = botVotes("casual", 3);
  assert.equal(votes.length, 3);
  const picks = votes.filter((v) => v !== RANDOM_VOTE);
  assert.equal(new Set(picks).size, picks.length, "a bot never votes a game twice");
  assert.ok(picks.every((v) => variantsFor("casual").includes(v)));
}
// The roulette's cards: one per vote and player, two players voting the same game get a card each.
const cards = matchBallot([
  { id: "a", name: "Ana", avatar: "#FF2D55", votes: ["minas-carrera", RANDOM_VOTE] },
  { id: "b", name: "Beto", avatar: "#0A9BFF", votes: ["minas-carrera", "rango-linea"] },
]);
assert.equal(cards.length, 4);
assert.equal(new Set(cards.map((c) => c.id)).size, 4, "every card its own id");
assert.deepEqual(cards.filter((c) => c.variant === "minas-carrera").map((c) => c.name).sort(), ["Ana", "Beto"]);

// A match is drawn from its players' votes: every game comes from one of them, and the next game's roulette spins
// among the votes left.
for (let attempt = 0; attempt < 10; attempt += 1) {
  const voted = mgr.findMatch(user(60), { kind: "competitivo", gameCount: 3, size: 2, votes: ["minas-carrera", "rango-linea", RANDOM_VOTE] });
  assert.deepEqual(voted.matchmaking.votes.u60, ["minas-carrera", "rango-linea", RANDOM_VOTE], "the votes are kept");
  mgr.findMatch(user(61), { kind: "competitivo", gameCount: 3, size: 2, votes: ["minas-carrera", "trivia-abiertas"] });
  clearTimeout(voted.matchmaking.timer);
  mgr.startMatch(voted);
  clearTimeout(voted.timer);
  const ballot = voted.matchmaking.ballot;
  assert.equal(ballot.length, 6, "a card per vote: two players, three games each");
  assert.equal(ballot.filter((c) => c.variant === "minas-carrera").length, 2, "the same game voted twice: two cards");
  assert.equal(ballot.filter((c) => c.userId === "u61" && c.variant === RANDOM_VOTE).length, 1, "a vote not given: Al azar");
  const items = voted.run.items;
  assert.equal(new Set(items.map((item) => item.vote)).size, 3, "each game from a different vote");
  for (const item of items) {
    const card = ballot.find((c) => c.id === item.vote);
    if (card.variant !== RANDOM_VOTE) assert.equal(item.variant, card.variant, "the game voted");
    else assert.ok(variantsFor("competitivo").includes(item.variant), "Al azar: any game");
  }
  let intro = mgr.publicState(voted, "u60").intro;
  assert.equal(intro.ballot.length, 6, "the first roulette: every vote");
  assert.equal(intro.ballot[intro.pick].id, items[0].vote, "it lands on the first game's vote");
  assert.deepEqual(intro.ballot.map((c) => c.id), ballot.map((c) => c.id), "in the order drawn");
  assert.ok(intro.ballot.every((c) => c.name && c.userId), "who voted each one");
  // The second game: the vote that picked the first one is gone.
  mgr.beginCountdown(voted);
  while (voted.phase !== "intro") {
    clearTimeout(voted.timer);
    if (voted.phase === "countdown") mgr.beginPlaying(voted);
    else if (voted.phase === "playing") mgr.beginReveal(voted);
    else mgr.advance(voted);
  }
  clearTimeout(voted.timer);
  mgr.clearBotMoves(voted);
  intro = mgr.publicState(voted).intro;
  assert.equal(intro.index, 1);
  assert.equal(intro.ballot.length, 5, "one vote fewer");
  assert.ok(!intro.ballot.some((c) => c.id === items[0].vote), "the picked vote left the roulette");
  assert.equal(intro.ballot[intro.pick].id, items[1].vote);
  mgr.destroy(voted);
}

for (const r of [...mgr.rooms.values()]) mgr.destroy(r);
console.log("matchmaking ok");
