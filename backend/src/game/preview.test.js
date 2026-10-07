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

console.log("preview.test ok");
