import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { QUICK_EMOJIS, QUICK_PHRASES, RoomManager, songFacts } from "./roomManager.js";

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const room = mgr.create({ host: { id: "h", name: "Host", socketId: "s1" }, game: "musica" });
mgr.addPlayer(room, { id: "p", name: "Player", socketId: "s2" });

// "¿Sabías que?" comes from the songs in play, and only in the lobby.
const facts = mgr.publicState(room).facts;
assert.ok(facts.length >= 5);
assert.ok(facts.some((f) => f.includes("es la más escuchada")));
assert.equal(mgr.lobbyFacts(room), mgr.lobbyFacts(room), "kept until the playlists change");
assert.deepEqual(songFacts([]), []);

// Only the fixed phrases and emojis can be sent, and not too fast.
const sent = mgr.react(room, "p", QUICK_PHRASES[0]);
assert.deepEqual([sent.playerId, sent.kind, sent.text], ["p", "phrase", QUICK_PHRASES[0]]);
assert.throws(() => mgr.react(room, "p", QUICK_EMOJIS[0]), /Espera/);
assert.equal(mgr.react(room, "h", QUICK_EMOJIS[0]).kind, "emoji");
room.players.get("h").lastReactionAt = 0;
assert.throws(() => mgr.react(room, "h", "cualquier cosa"), /no está disponible/);
assert.throws(() => mgr.react(room, "nadie", QUICK_EMOJIS[0]), /no encontrado/);
mgr.destroy(room);

console.log("lobbyExtras.test ok");
