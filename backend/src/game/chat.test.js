import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { CHAT_MAX_LENGTH, RoomManager } from "./roomManager.js";

const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const room = mgr.create({ host: { id: "host-1", name: "Ana", socketId: "s1" }, mode: "multi", game: null });
mgr.addPlayer(room, { id: "guest-2", name: "Luis", socketId: "s2" });

// Everyone in the room sees the messages, oldest first, with who sent them.
assert.deepEqual(mgr.publicState(room).chat, []);
mgr.sendChat(room, "host-1", "  Hola   a todos  ");
mgr.sendChat(room, "guest-2", "¡Hola!");
const chat = mgr.publicState(room).chat;
assert.deepEqual(
  chat.map((m) => [m.userId, m.name, m.text]),
  [
    ["host-1", "Ana", "Hola a todos"],
    ["guest-2", "Luis", "¡Hola!"],
  ]
);
assert.ok(chat[0].id < chat[1].id);

// Empty messages, strangers and messages too close together are refused; long ones are cut.
assert.throws(() => mgr.sendChat(room, "guest-2", "   "), /Escribe un mensaje/);
assert.throws(() => mgr.sendChat(room, "nadie", "hola"), /Jugador no encontrado/);
assert.throws(() => mgr.sendChat(room, "host-1", "otra vez"), /Espera un momento/);
room.players.get("host-1").chattedAt = 0;
mgr.sendChat(room, "host-1", "x".repeat(500));
assert.equal(room.chat.at(-1).text.length, CHAT_MAX_LENGTH);

// While a round is played the chat is closed, so nobody passes on the answer.
room.phase = "playing";
room.players.get("guest-2").chattedAt = 0;
assert.throws(() => mgr.sendChat(room, "guest-2", "es Francia"), /se pausa/);
room.phase = "lobby";

// The room keeps only the newest messages.
for (let i = 0; i < 60; i += 1) {
  room.players.get("guest-2").chattedAt = 0;
  mgr.sendChat(room, "guest-2", `mensaje ${i}`);
}
assert.equal(room.chat.length, 40);
assert.equal(room.chat.at(-1).text, "mensaje 59");

console.log("chat.test ok");
