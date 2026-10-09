import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "./roomManager.js";

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const room = mgr.create({ host: { id: "host-1", name: "Host", socketId: "s1" }, mode: "multi", game: null });
mgr.addPlayer(room, { id: "guest-2", name: "Invitado", socketId: "s2" });

// Everyone sees the game the host points at on the menu.
assert.equal(mgr.publicState(room).preview, null);
mgr.previewGame(room, "host-1", "musica");
assert.equal(mgr.publicState(room).preview, "musica");
assert.equal(mgr.publicState(room, "guest-2").preview, "musica");

// Pointing away clears it; unknown games and other players are refused.
mgr.previewGame(room, "host-1", null);
assert.equal(mgr.publicState(room).preview, null);
assert.throws(() => mgr.previewGame(room, "host-1", "inexistente"), /no está disponible/);
assert.throws(() => mgr.previewGame(room, "guest-2", "musica"), /Solo el Host/);
assert.equal(room.preview, null);

// Picking the game clears the preview, and it can't be set while a game is picked.
mgr.previewGame(room, "host-1", "musica");
mgr.setGame(room, "host-1", "musica");
assert.equal(mgr.publicState(room).preview, null);
mgr.previewGame(room, "host-1", "musica");
assert.equal(room.preview, null);

// Suggestions: guests suggest, the host can't, the same player waits 5 s, and picking a game clears them all.
const room2 = mgr.create({ host: { id: "host-9", name: "Host", socketId: "s9" }, mode: "multi", game: null });
mgr.addPlayer(room2, { id: "guest-8", name: "Ana", socketId: "s8" });
mgr.addPlayer(room2, { id: "guest-7", name: "Beto", socketId: "s7" });
mgr.suggestGame(room2, "guest-8", "musica");
let pub = mgr.publicState(room2);
assert.equal(pub.suggestions.length, 1);
assert.deepEqual({ ...pub.suggestions[0], at: 0 }, { userId: "guest-8", name: "Ana", game: "musica", at: 0 });
assert.throws(() => mgr.suggestGame(room2, "guest-8", "musica"), /Espera \d s para sugerir/);
assert.throws(() => mgr.suggestGame(room2, "host-9", "musica"), /Tú eliges/);
assert.throws(() => mgr.suggestGame(room2, "guest-7", "inexistente"), /no está disponible/);
assert.throws(() => mgr.suggestGame(room2, "guest-7", null), /Elige un juego/);
mgr.suggestGame(room2, "guest-7", "mundo");
assert.equal(mgr.publicState(room2).suggestions.length, 2);
// After the cooldown the same player can suggest again, and it replaces their previous one.
room2.players.get("guest-8").suggestedAt -= 5001;
mgr.suggestGame(room2, "guest-8", "mundo");
pub = mgr.publicState(room2);
assert.equal(pub.suggestions.length, 2);
assert.equal(pub.suggestions.find((s) => s.userId === "guest-8").game, "mundo");
mgr.setGame(room2, "host-9", "mundo");
assert.deepEqual(mgr.publicState(room2).suggestions, []);
assert.throws(() => mgr.suggestGame(room2, "guest-7", "musica"), /Ya hay un juego/);

console.log("preview.test ok");
