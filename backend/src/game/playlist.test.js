import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { playlistWinner, playOrder, rankedStandings } from "./playlist.js";
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

// ---- Playing it, in order ----
mgr.start(room, "host-1");
stop(room);
assert.equal(room.game, "minas", "the first game of the list");
assert.equal(room.phase, "countdown");
assert.equal(room.tracks.length, 5);
assert.ok(room.tracks.every((t) => t.category === "historia" && t.difficulty === "facil" && t.style === "turnos"), "with its own settings");
pub = mgr.publicState(room);
assert.deepEqual(pub.run.games, ["minas", "musica", "historia"]);
assert.equal(pub.run.index, 0);
assert.equal(pub.run.total, 3);
assert.equal(pub.playlistStatus, undefined);
assert.equal(pub.run.savedConfig, undefined, "the room's own settings stay on the server");
assert.throws(() => mgr.updatePlaylist(room, "host-1", list), /ya comenzó/);
assert.throws(() => mgr.nextInPlaylist(room, "host-1"), /termine este juego/);

// Ana wins the first game.
host.score = 300;
ana.score = 700;
mgr.finish(room);
assert.equal(room.phase, "finished");
pub = mgr.publicState(room);
assert.deepEqual(pub.run.played, [{ game: "minas", winnerId: "p-2", winnerName: "Ana" }]);
assert.deepEqual(
  pub.run.standings.map((s) => [s.id, s.wins, s.points, s.played]),
  [
    ["p-2", 1, 700, 1],
    ["host-1", 0, 300, 1],
  ]
);
assert.throws(() => mgr.replay(room, "host-1"), /Sigue con la playlist/);
assert.throws(() => mgr.nextInPlaylist(room, "p-2"), /Solo el anfitrión/);

// Someone joining between games plays from the next one.
mgr.addPlayer(room, { id: "p-3", name: "Luis", socketId: "s3" });
assert.equal(room.players.get("p-3").spectator, undefined);

mgr.nextInPlaylist(room, "host-1");
stop(room);
assert.equal(room.game, "musica");
assert.equal(room.phase, "countdown");
assert.equal(room.totalRounds, 5);
assert.deepEqual(room.config.formats, ["opciones"]);
assert.equal(room.players.get("p-3").spectator, false);
assert.equal(host.score, 0, "every game starts from zero");
assert.equal(mgr.publicState(room).run.index, 1);

// The host wins the second one; a tie for first would be nobody's.
host.score = 900;
ana.score = 200;
mgr.finish(room);
mgr.nextInPlaylist(room, "host-1");
stop(room);
assert.equal(room.game, "historia");
assert.ok(room.tracks.every((t) => t.category === "deportes"));
ana.score = 400;
host.score = 400;
mgr.finish(room);
pub = mgr.publicState(room);
assert.equal(pub.run.played[2].winnerId, null, "a tie wins nothing");

// After the last game: the playlist's results, back in the playlist.
mgr.nextInPlaylist(room, "host-1");
assert.equal(room.phase, "finished");
assert.equal(room.game, "playlist");
assert.equal(room.tracks.length, 0);
assert.deepEqual(room.config.mines, ownMines, "the room's own settings are back");
assert.equal(room.config.rounds, ownRounds);
pub = mgr.publicState(room);
assert.equal(pub.run.finished, true);
// One win each: the points across the playlist decide (host 300 + 900 + 400, Ana 700 + 200 + 400).
assert.deepEqual(
  pub.run.standings.map((s) => [s.id, s.wins, s.points]),
  [
    ["host-1", 1, 1600],
    ["p-2", 1, 1300],
    ["p-3", 0, 0],
  ]
);
assert.equal(pub.run.winnerId, "host-1");
assert.equal(pub.reveal, null, "nothing of the last game's round is left on show");
assert.throws(() => mgr.nextInPlaylist(room, "host-1"), /ninguna playlist/);
assert.equal(mgr.publicState(room).board.matches, 3, "each game counts on the room's scoreboard");

// "Volver a jugar": the whole playlist again, from its first game.
mgr.replay(room, "host-1");
stop(room);
assert.equal(room.game, "minas");
assert.equal(room.run.index, 0);
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
mgr.start(room, "host-1");
stop(room);
assert.deepEqual([...room.run.items.map((i) => i.game)].sort(), ["historia", "minas", "musica"]);
assert.equal(room.game, room.run.items[0].game);
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

// A game that can't start halfway (songs gone...) ends the playlist and says why.
mgr.updatePlaylist(room, "host-1", { ...room.playlist, order: "orden" });
mgr.start(room, "host-1");
stop(room);
mgr.finish(room);
room.run.items[1] = { ...room.run.items[1], config: { ...room.run.items[1].config, useCatalog: false, playlistIds: [] } };
assert.throws(() => mgr.nextInPlaylist(room, "host-1"), /No se puede jugar Adivina la canción\. Activa el catálogo o elige una playlist/);
assert.equal(room.run.index, 0, "still on the last results: the host can end it");
mgr.restart(room, "host-1");
assert.equal(room.run, null);

for (const r of mgr.rooms.values()) mgr.destroy(r);
console.log("playlist ok");
