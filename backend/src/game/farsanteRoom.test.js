import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { FARSANTE_POINTS, FARSANTE_VOTE_MS, mergeFarsanteConfig, pickFarsanteRounds, roundsPerKind, sameText } from "./farsante.js";
import { RoomManager } from "./roomManager.js";

// Farsante: every round everyone writes an answer (60 characters at most), then everyone votes for one (never their
// own), then the reveal says who wrote what. A "dato raro" mixes the real answer in: voting it scores 1000, and each
// vote an invented answer gets scores its author 500; in the other kinds, each vote an answer gets scores 500.
const mgr = new RoomManager({ catalog: readLocalCatalog(), store: { users: {} } });
const stop = (room) => clearTimeout(room.timer);

// ---- Settings and draw ----
assert.deepEqual(mergeFarsanteConfig({}, { rounds: 7, writeMs: 1, kinds: ["frase", "xx"] }), { rounds: 8, writeMs: 45000, kinds: ["frase"] });
assert.deepEqual(roundsPerKind(10, ["dato", "pelicula", "frase", "noticia"]).map((r) => r.count), [3, 3, 2, 2]);
assert.ok(sameText("¡París!", "paris"));
const drawn = pickFarsanteRounds(mgr.datoQuestions, mergeFarsanteConfig({}, { rounds: 12 }));
assert.equal(drawn.length, 12);
for (const kind of ["dato", "pelicula", "frase", "noticia"]) assert.equal(drawn.filter((r) => r.kind === kind).length, 3);
assert.ok(drawn.filter((r) => r.kind === "dato").every((r) => r.truth && r.question));
assert.equal(new Set(drawn.map((r) => r.text)).size, 12, "no prompt twice");

// ---- The room ----
const room = mgr.create({ host: { id: "h", name: "Host", socketId: "s1" }, mode: "multi", game: "farsante" });
mgr.addPlayer(room, { id: "a", name: "Ana", socketId: "s2" });
assert.throws(() => mgr.start(room, "h"), /al menos 3 jugadores/);
mgr.addPlayer(room, { id: "l", name: "Luis", socketId: "s3" });
mgr.updateConfig(room, "h", { farsante: { kinds: [] } });
assert.throws(() => mgr.start(room, "h"), /al menos un tipo de ronda/);
mgr.updateConfig(room, "h", { farsante: { kinds: ["dato", "frase"], rounds: 4 } });
mgr.start(room, "h");
stop(room);
assert.equal(room.phase, "countdown");
assert.equal(room.totalRounds, 4);
const kinds = room.tracks.map((t) => t.kind).sort();
assert.deepEqual(kinds, ["dato", "dato", "frase", "frase"]);

// Play a given kind of round first: swap it to the front.
function play(kind) {
  const i = room.tracks.findIndex((t, n) => n >= room.currentRound && t.kind === kind);
  [room.tracks[room.currentRound], room.tracks[i]] = [room.tracks[i], room.tracks[room.currentRound]];
}

// ---- Round 1: a "dato raro" ----
play("dato");
const dato = room.tracks[0];
mgr.beginPlaying(room);
stop(room);
let pub = mgr.publicState(room, "a");
assert.equal(pub.farsante.stage, "writing");
assert.equal(pub.farsante.prompt, dato.text);
assert.equal(pub.farsante.options, null);
assert.equal(JSON.stringify(pub).includes(`"${dato.truth}"`), false, "the real answer is not in the state yet");
assert.throws(() => mgr.farsanteVote(room, "a", 0), /Ahora no se vota/);
assert.throws(() => mgr.farsanteWrite(room, "a", "   "), /Escribe algo/);
assert.throws(() => mgr.farsanteWrite(room, "a", "x".repeat(61)), /Máximo 60/);
assert.throws(() => mgr.farsanteWrite(room, "a", "mira https://ejemplo.com"), /enlaces/);
assert.throws(() => mgr.farsanteWrite(room, "a", dato.truth), /respuesta real/);
mgr.farsanteWrite(room, "a", "Una respuesta de Ana");
mgr.farsanteWrite(room, "a", "La respuesta de Ana, mejor");
assert.throws(() => mgr.farsanteWrite(room, "l", "la respuesta de ana, MEJOR!"), /igual/);
assert.equal(mgr.publicState(room).farsante.written, 1);
mgr.farsanteWrite(room, "l", "Algo que dice Luis");
assert.equal(room.tracks[0].stage, "writing", "the host hasn't written yet");
mgr.farsanteWrite(room, "h", "Lo que pone el anfitrión");
stop(room);

// Everyone wrote: the voting starts, with the three answers and the real one, no authors.
assert.equal(room.tracks[0].stage, "voting");
assert.equal(room.phaseEndsAt - room.phaseStartedAt, FARSANTE_VOTE_MS);
pub = mgr.publicState(room, "a");
assert.equal(pub.farsante.stage, "voting");
assert.equal(pub.farsante.options.length, 4);
assert.ok(pub.farsante.options.some((o) => o.text === dato.truth));
assert.ok(pub.farsante.options.every((o) => !("authorId" in o)), "no authors while voting");
assert.equal(pub.players.find((p) => p.id === "a").answered, false);
const idOf = (text) => room.tracks[0].options.findIndex((o) => o.text === text);
assert.throws(() => mgr.farsanteVote(room, "a", idOf("La respuesta de Ana, mejor")), /tu propia/);
assert.throws(() => mgr.farsanteVote(room, "a", 9), /Elige una/);
mgr.farsanteVote(room, "a", idOf(dato.truth)); // Ana finds the real one
mgr.farsanteVote(room, "l", idOf("Lo que pone el anfitrión")); // Luis believes the host's
assert.equal(room.phase, "playing");
mgr.farsanteVote(room, "h", idOf(dato.truth)); // the host finds the real one
stop(room);
assert.equal(room.phase, "reveal", "everyone voted: the reveal");
pub = mgr.publicState(room);
assert.equal(pub.farsante.stage, "reveal");
const real = pub.farsante.options.find((o) => o.real);
assert.deepEqual([...real.voters].sort(), ["a", "h"]);
assert.equal(real.points, 2 * FARSANTE_POINTS.real);
assert.equal(pub.farsante.options.find((o) => o.authorId === "h").points, FARSANTE_POINTS.vote);
const score = (id) => room.players.get(id).score;
assert.equal(score("a"), FARSANTE_POINTS.real);
assert.equal(score("h"), FARSANTE_POINTS.real + FARSANTE_POINTS.vote);
assert.equal(score("l"), 0);

// ---- Round 2: a sentence, with a player who writes nothing ----
mgr.advance(room);
stop(room);
play("frase");
mgr.beginPlaying(room);
stop(room);
mgr.farsanteWrite(room, "a", "Ana opina");
mgr.farsanteWrite(room, "l", "Luis opina");
mgr.beginVoting(room); // the time ran out; the host wrote nothing
stop(room);
assert.equal(room.tracks[1].options.length, 2, "no real answer in a sentence");
assert.ok(room.tracks[1].options.every((o) => o.author));
// Votes (host too): Ana can't pick her own, so all three pick the other's.
mgr.farsanteVote(room, "a", room.tracks[1].options.findIndex((o) => o.author === "l"));
mgr.farsanteVote(room, "l", room.tracks[1].options.findIndex((o) => o.author === "a"));
mgr.farsanteVote(room, "h", room.tracks[1].options.findIndex((o) => o.author === "a"));
stop(room);
assert.equal(room.phase, "reveal");
assert.equal(score("a"), FARSANTE_POINTS.real + 2 * FARSANTE_POINTS.vote);
assert.equal(score("l"), FARSANTE_POINTS.vote);

// ---- A round nobody writes anything for goes straight to the reveal ----
mgr.advance(room);
stop(room);
play("dato");
mgr.beginPlaying(room);
stop(room);
mgr.beginVoting(room);
stop(room);
assert.equal(room.phase, "reveal");
assert.equal(mgr.publicState(room).farsante.options, null);

// ---- Back to the lobby ----
mgr.resetMatch(room);
assert.equal(room.phase, "lobby");
console.log("farsanteRoom ok");

// ---- An owner's test bots: they let one player try Farsante alone ----
process.env.OWNER_IDS = "boss";
const store = { users: { boss: { id: "boss", name: "Dani", email: "d@x.com" }, norm: { id: "norm", name: "Pepe", email: "p@x.com" } } };
const mgr2 = new RoomManager({ catalog: readLocalCatalog(), store });
const solo = mgr2.create({ host: { id: "boss", name: "Dani", socketId: "q1" }, mode: "multi", game: "farsante" });
assert.throws(() => mgr2.addTestBot(solo, "norm"), /solo los owners/i);
assert.throws(() => mgr2.start(solo, "boss"), /al menos 3 jugadores/);
mgr2.addTestBot(solo, "boss");
mgr2.addTestBot(solo, "boss");
assert.deepEqual([...solo.players.values()].filter((p) => p.bot).map((p) => p.name), ["Bot de prueba 1", "Bot de prueba 2"]);
assert.equal(JSON.stringify(mgr2.publicState(solo)).includes('"bot"'), false, "a bot flag is never sent");
mgr2.updateConfig(solo, "boss", { farsante: { kinds: ["frase"], rounds: 4 } });
mgr2.start(solo, "boss");
stop(solo);
mgr2.beginPlaying(solo);
stop(solo);
const bots = [...solo.players.values()].filter((p) => p.bot);
for (const bot of bots) mgr2.botMove(solo, bot);
assert.equal(Object.keys(solo.tracks[0].entries).length, 2, "both bots wrote");
assert.equal(solo.tracks[0].stage, "writing", "the player hasn't");
mgr2.farsanteWrite(solo, "boss", "Lo mío");
stop(solo);
assert.equal(solo.tracks[0].stage, "voting");
for (const bot of bots) mgr2.botMove(solo, bot);
assert.equal(Object.keys(solo.tracks[0].votes).length, 2);
mgr2.farsanteVote(solo, "boss", solo.tracks[0].options.findIndex((o) => o.author !== "boss"));
stop(solo);
assert.equal(solo.phase, "reveal");
mgr2.resetMatch(solo);
for (let i = 3; i <= 5; i += 1) mgr2.addTestBot(solo, "boss");
assert.throws(() => mgr2.addTestBot(solo, "boss"), /Máximo 5/);
console.log("farsanteBots ok");
