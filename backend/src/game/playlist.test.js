import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { mixRounds, playlistWinner, playOrder, publicRun, rankedStandings } from "./playlist.js";
import { RoomManager } from "./roomManager.js";

// Playlists: several games played one after another, each with its own settings. Whoever wins the most games wins the
// playlist (points across all of them break a tie).
const catalog = readLocalCatalog();
const mgr = new RoomManager({ catalog, store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: "playlist" });
mgr.addPlayer(room, { id: "p-2", name: "Ana", socketId: "s2" });
const host = room.players.get("host-1");
const ana = room.players.get("p-2");

// ---- Making it ----
let pub = mgr.publicState(room);
assert.equal(pub.game, "playlist");
assert.deepEqual(pub.playlist, { name: "Mi playlist", order: "orden", items: [] });
assert.equal(pub.run, null);
assert.equal(pub.songsReady, undefined, "the playlist's panel counts each game's songs, not the room's");
assert.throws(() => mgr.start(room, "host-1"), /al menos un juego/, "an empty playlist can't start");
assert.throws(() => mgr.updatePlaylist(room, "p-2", { items: [] }), /permisos/, "only the host (or who has the permission)");

// Whatever is sent is kept valid: unknown games dropped, lists filtered, numbers within the limits, ids kept or made.
mgr.updatePlaylist(room, "host-1", {
  name: "   Noche   de juegos  ",
  order: "al revés",
  items: [
    { id: "a1", game: "minas", config: { categories: ["historia", "magia"], difficulties: ["facil"], styles: ["turnos"], rounds: 99 } },
    { id: "a1", game: "ajedrez", config: {} },
    { id: "a1", game: "musica", config: { rounds: 2, playlistIds: ["no-existe"], formats: ["opciones", "silbar"] } },
    { game: "historia", config: "nada" },
  ],
});
let list = room.playlist;
assert.equal(list.name, "Noche de juegos");
assert.equal(list.order, "orden");
assert.deepEqual(
  list.items.map((i) => i.game),
  ["minas", "musica", "historia"]
);
assert.equal(list.items[0].id, "a1");
assert.notEqual(list.items[1].id, "a1", "repeated ids get a new one");
assert.ok(list.items[2].id, "items without an id get one");
assert.deepEqual(list.items[0].config.categories, ["historia"]);
assert.deepEqual(list.items[0].config.styles, ["turnos"]);
assert.equal(list.items[0].config.rounds, 25, "at most 25 boards");
assert.equal(list.items[1].config.rounds, 5, "at least 5 songs");
assert.deepEqual(list.items[1].config.formats, ["opciones"]);
assert.deepEqual(list.items[1].config.playlistIds, [], "Spotify playlists the room doesn't have are dropped");
assert.equal(list.items[1].config.useCatalog, true, "the catalog plays, with every filter ticked");
assert.equal(list.items[1].config.languages.length > 0, true);
assert.equal(list.items[2].config.rounds, 5, "settings that aren't an object: the game's defaults");
assert.equal(list.items[2].config.categories.length, 10);

// Each game says why it can't be played yet, and its chips' counts.
mgr.updatePlaylist(room, "host-1", {
  ...list,
  items: [
    { ...list.items[0], config: { ...list.items[0].config, rounds: 5 } },
    list.items[1],
    { ...list.items[2], config: { ...list.items[2].config, categories: [] } },
  ],
});
list = room.playlist;
pub = mgr.publicState(room);
assert.equal(pub.playlistStatus[list.items[0].id].problem, null);
assert.equal(pub.playlistStatus[list.items[0].id].counts.categories.musica, 10, "the boards per category for the chips");
assert.equal(pub.playlistStatus[list.items[1].id].problem, null);
assert.match(pub.playlistStatus[list.items[2].id].problem, /al menos una categoría/);
assert.throws(() => mgr.start(room, "host-1"), /Revisa el juego 3, Rango\. Elige al menos una categoría/);
assert.equal(room.phase, "lobby", "nothing started");
assert.equal(room.run, null);

// The room's own settings stay as they were all along.
const ownMines = structuredClone(room.config.mines);
const ownRounds = room.config.rounds;
mgr.updatePlaylist(room, "host-1", {
  ...list,
  items: [list.items[0], list.items[1], { ...list.items[2], config: { ...list.items[2].config, categories: ["deportes"], rounds: 5 } }],
});
list = room.playlist;

// ---- Playing it, in order: one match, every round of the first game, then of the second... ----
mgr.start(room, "host-1");
stop(room);
assert.equal(room.game, "minas", "the first game of the list");
assert.equal(room.phase, "countdown");
assert.equal(room.run.mixed, true, "a single match");
assert.equal(room.totalRounds, 15, "5 boards, 5 songs and 5 events");
const itemOf = (t) => room.run.items[t.playlistItem];
assert.deepEqual(
  room.tracks.map((t) => itemOf(t).game),
  [...Array(5).fill("minas"), ...Array(5).fill("musica"), ...Array(5).fill("historia")],
  "each game's rounds together, in the list's order"
);
assert.ok(
  room.tracks.slice(0, 5).every((t) => t.category === "historia" && t.difficulty === "facil" && t.style === "turnos"),
  "with its own settings"
);
assert.ok(room.tracks.slice(10).every((t) => t.category === "deportes"));
pub = mgr.publicState(room);
assert.deepEqual(pub.run.games, ["minas", "musica", "historia"]);
assert.equal(pub.run.total, 3);
assert.equal(pub.playlistStatus, undefined);
assert.equal(pub.run.savedConfig, undefined, "the room's own settings stay on the server");
assert.throws(() => mgr.updatePlaylist(room, "host-1", list), /ya comenzó/);

// Someone joining mid-playlist watches it, like any match.
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3" });
assert.equal(room.players.get("p-3").spectator, true);

// The rounds go on from one game to the next with no screen between them; the scores add up.
const order = [];
for (let round = 0; round < 15; round += 1) {
  assert.equal(room.currentRound, round);
  assert.equal(room.game, itemOf(room.tracks[round]).game, "the room is in the round's game");
  if (room.game === "historia") assert.deepEqual(room.config.history, itemOf(room.tracks[round]).config, "with its settings");
  order.push(room.game);
  stop(room);
  mgr.beginReveal(room);
  host.score += round < 10 ? 100 : 0;
  ana.score += round >= 10 ? 150 : 0;
  stop(room);
  mgr.advance(room);
  stop(room);
}
assert.deepEqual([...new Set(order)], ["minas", "musica", "historia"]);
assert.equal(room.phase, "finished", "no tiebreak: the last round ends the match");
assert.equal(room.game, "playlist", "straight to the playlist's results");
assert.equal(room.tracks.length, 0);
assert.deepEqual(room.config.mines, ownMines, "the room's own settings are back");
assert.equal(room.config.rounds, ownRounds);
pub = mgr.publicState(room);
assert.equal(pub.run.finished, true);
assert.equal(pub.run.played.length, 1, "one match");
assert.deepEqual(
  pub.run.standings.filter((s) => s.id !== "p-3").map((s) => [s.id, s.points]),
  [
    ["host-1", 1000],
    ["p-2", 750],
  ]
);
assert.equal(pub.run.winnerId, "host-1", "the most points win");
assert.equal(pub.reveal, null, "nothing of the last round is left on show");

// "Volver a jugar": the whole playlist again, from its first game.
mgr.replay(room, "host-1");
stop(room);
assert.equal(room.game, "minas");
assert.equal(room.currentRound, 0);
assert.deepEqual(room.run.standings, {}, "a new tally");

// "Volver al lobby" in the middle: the playlist is over and the room is back in its panel, with its own settings.
mgr.finish(room);
mgr.restart(room, "host-1");
assert.equal(room.game, "playlist");
assert.equal(room.phase, "lobby");
assert.equal(room.run, null);
assert.deepEqual(room.config.mines, ownMines);

// Choosing another game mid-playlist ends it too.
mgr.start(room, "host-1");
stop(room);
mgr.setGame(room, "host-1", "opciones");
assert.equal(room.run, null);
assert.equal(room.game, "opciones");
assert.deepEqual(room.config.mines, ownMines);
// A game's "Terminar" (back to the menu) during a playlist: back to the playlist's panel instead.
mgr.setGame(room, "host-1", "playlist");
mgr.start(room, "host-1");
stop(room);
mgr.setGame(room, "host-1", null);
assert.equal(room.run, null);
assert.equal(room.game, "playlist");
assert.equal(room.phase, "lobby");
// Outside a playlist it's the menu, as always.
mgr.setGame(room, "host-1", null);
assert.equal(room.game, null);

// ---- Random order ----
let calls = 0;
const reversed = playOrder([1, 2, 3, 4], "aleatorio", () => (calls++, 0));
assert.deepEqual(reversed.sort(), [1, 2, 3, 4], "the same games, shuffled");
assert.ok(calls > 0);
assert.deepEqual(playOrder([1, 2, 3], "orden", () => 0), [1, 2, 3]);
mgr.setGame(room, "host-1", "playlist");
mgr.updatePlaylist(room, "host-1", { ...room.playlist, order: "aleatorio" });
assert.equal(room.playlist.order, "aleatorio");
// Random: one match with every game's rounds mixed, each round played in its own game with its own settings.
const mixed = mixRounds([["a1", "a2", "a3"], ["b1"], ["c1", "c2"]], () => 0.3);
assert.equal(mixed.length, 6, "every round of every game, once");
assert.deepEqual(mixed.filter((r) => r.item === 0).map((r) => r.track), ["a1", "a2", "a3"], "a game's rounds keep their order");
assert.deepEqual(mixed.map((r) => r.track).sort(), ["a1", "a2", "a3", "b1", "c1", "c2"]);
mgr.start(room, "host-1");
stop(room);
assert.equal(room.run.mixed, true);
assert.equal(mgr.publicState(room).run.mixed, true);
assert.deepEqual([...room.run.items.map((i) => i.game)].sort(), ["historia", "minas", "musica"]);
assert.equal(room.totalRounds, 15, "5 boards, 5 songs and 5 events, in one match");
assert.equal(room.tracks.length, 15);
assert.equal(room.tracks.filter((t) => room.run.items[t.playlistItem].game === "musica").length, 5);
assert.equal(new Set(room.tracks.map((t) => t.id)).size, 15, "nothing twice");
const gamesPlayed = [];
host.score = 0;
for (let round = 0; round < 15; round += 1) {
  assert.equal(room.currentRound, round);
  assert.equal(room.phase, "countdown");
  const item = room.run.items[room.tracks[round].playlistItem];
  assert.equal(room.game, item.game, "the room is in the round's game");
  if (item.game === "minas") assert.deepEqual(room.config.mines, item.config, "with that game's settings");
  if (item.game === "historia") assert.deepEqual(room.config.history, item.config);
  if (item.game === "musica") assert.equal(room.config.rounds, item.config.rounds);
  gamesPlayed.push(room.game);
  stop(room);
  mgr.beginReveal(room);
  host.score += 100;
  stop(room);
  mgr.advance(room);
  stop(room);
}
assert.equal(new Set(gamesPlayed).size, 3);
assert.equal(room.phase, "finished", "no tiebreak: the last round ends the match");
assert.equal(room.game, "playlist", "and the playlist: everyone goes to its results");
assert.equal(room.run.finished, true);
assert.equal(room.config.mines.rounds, ownMines.rounds, "the room's own settings are back");
assert.equal(room.run.games.length, 1, "one match");
assert.equal(mgr.publicState(room).run.winnerId, "host-1", "the most points win");
assert.equal(mgr.publicState(room).run.standings[0].points, 1500, "the points of every round add up");
mgr.restart(room, "host-1");

// ---- Who wins ----
const run = { standings: { a: { wins: 2, points: 100 }, b: { wins: 1, points: 5000 }, c: { wins: 2, points: 300 } } };
assert.deepEqual(
  rankedStandings(run).map((s) => s.id),
  ["c", "a", "b"],
  "the most games won, then the most points"
);
assert.equal(playlistWinner(rankedStandings(run)), "c");
assert.equal(playlistWinner(rankedStandings({ standings: { a: { wins: 1, points: 9 }, b: { wins: 1, points: 9 } } })), null, "a full tie");
assert.equal(playlistWinner(rankedStandings({ standings: { a: { wins: 0, points: 900 } } })), null, "nobody won a game");

// The final screen says who won each game of a playlist: whoever scored the most in it (all of them on a tie, nobody
// when nobody scored), from the points each round gave to its game, in play order.
{
  const run = { name: "P", order: "orden", items: [{ game: "opciones" }, { game: "musica" }, { game: "minas" }], standings: {}, games: [], index: 2 };
  run.itemPoints = { 0: { a: 900, b: 400 }, 1: { a: 300, b: 300 }, 2: { a: 0, b: 0 } };
  assert.deepEqual(publicRun(run).results, [
    { variant: "opciones", winners: ["a"] },
    { variant: "musica", winners: ["a", "b"] },
    { variant: "minas", winners: [] },
  ]);
}

for (const r of mgr.rooms.values()) mgr.destroy(r);
console.log("playlist ok");
