import assert from "node:assert/strict";
import { RoomManager } from "./roomManager.js";

// The room's scoreboard across matches: wins per player, ties count for nobody unless a tiebreak settled them.
const fakeCatalog = { songs: [], artists: [], albums: [], genres: [], playlists: [] };
const mgr = new RoomManager({ catalog: fakeCatalog, store: {} });
const room = mgr.create({ host: { id: "a", name: "Ana", avatar: "#FF0000", socketId: "s1" }, mode: "multi" });
mgr.addPlayer(room, { id: "b", name: "Beto", avatar: "#00FF00", socketId: "s2" });
const a = room.players.get("a");
const b = room.players.get("b");

assert.deepEqual(mgr.publicState(room).board, { matches: 0, players: [] });

// A clear win.
a.score = 2000;
b.score = 800;
mgr.recordWin(room, mgr.rankedPlayers(room));
// A tie for first: nobody wins.
a.score = 1000;
b.score = 1000;
mgr.recordWin(room, mgr.rankedPlayers(room));
// The same tie settled by a tiebreak: its winner gets it.
room.tiebreak = { winnerId: "b" };
mgr.recordWin(room, mgr.rankedPlayers(room));
// Nobody scored: nobody wins.
room.tiebreak = null;
a.score = 0;
b.score = 0;
mgr.recordWin(room, mgr.rankedPlayers(room));

const board = mgr.publicState(room).board;
assert.equal(board.matches, 4);
assert.deepEqual(
  board.players.map((p) => [p.id, p.name, p.wins, p.played]),
  [
    ["a", "Ana", 1, 4],
    ["b", "Beto", 1, 4],
  ]
);

// A player who left stays on the board.
mgr.leave("s2");
assert.equal(room.players.has("b"), false);
assert.ok(mgr.publicState(room).board.players.some((p) => p.id === "b"));

console.log("roomBoard.test ok");
