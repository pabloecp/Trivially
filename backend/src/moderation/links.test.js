import assert from "node:assert/strict";
import { hasLink } from "./links.js";
import { RoomManager } from "../game/roomManager.js";
import { readLocalCatalog } from "../catalog/catalogProvider.js";

// Links, written in many ways.
for (const link of ["https://ejemplo.com", "mira http://x.y", "ftp://archivos", "www.algo.mx", "WWW . algo", "entra a google.com",
  "bit.ly/abc", "discord.gg/trivia", "algo.com/ruta?x=1", "algo . com", "algo [.] net", "algo(.)org", "algo punto com",
  "mi-sitio.xyz", "canal en youtube.com/@yo", "tiktok.com"]) {
  assert.ok(hasLink(link), `debería ser un enlace: "${link}"`);
}

// Normal text, with dots and all.
for (const text of ["Hola a todos", "Sr.Pérez", "1.5 segundos", "Vamos!!! ...", "Ana María", "fin. Comienza otra",
  "J.R.R. Tolkien", "punto com no", "Pepe_23", "es Francia", "¿quién ganó? yo jaja", "a las 3.30", "E.T.", "comida"]) {
  assert.equal(hasLink(text), false, `no debería ser un enlace: "${text}"`);
}

// In a room: a name with a link doesn't get in.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
assert.throws(() => mgr.create({ host: { id: "gst_a", name: "visita algo.com", isGuest: true, socketId: "s0" } }), /enlaces/);
assert.equal(mgr.rooms.size, 0, "no room is left half made");
const room = mgr.create({ host: { id: "gst_b", name: "Ana", isGuest: true, socketId: "s1" } });
assert.throws(() => mgr.addPlayer(room, { id: "gst_c", name: "www.spam.net", isGuest: true, socketId: "s2" }), /enlaces/);
assert.throws(() => mgr.updatePlayer(room, "gst_b", { name: "https://x.io" }), /enlaces/);
mgr.destroy(room);

console.log("links.test ok");
