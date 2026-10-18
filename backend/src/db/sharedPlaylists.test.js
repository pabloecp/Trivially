import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Never the real file: a fresh one in the system's temporary folder.
const file = path.join(os.tmpdir(), `trivially-shared-${process.pid}.json`);
process.env.SHARED_PLAYLISTS_FILE = file;
const { assertCanShare, forgetOldShareCodes, normalizeShareCode, playlistByCode, shareCodeFor, SHARE_LIMIT, SHARE_TTL_MS } = await import(
  "./sharedPlaylists.js"
);

const playlist = {
  name: "Viernes",
  order: "orden",
  items: [
    { id: "a1", game: "opciones", config: { rounds: 5, roundMs: 15000 } },
    { id: "b2", game: "minas", config: { rounds: 10 } },
  ],
};

// A code is two groups of five letters and numbers.
const code = await shareCodeFor(playlist, { local: true });
assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);

// The same playlist (even with other item ids) gets the same code: no new row.
assert.equal(await shareCodeFor({ ...playlist, items: playlist.items.map((i) => ({ ...i, id: "x" + i.id })) }, { local: true }), code);
assert.equal(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))).length, 1);
// Another playlist, another code.
assert.notEqual(await shareCodeFor({ ...playlist, name: "Sábado" }, { local: true }), code);

// Reading it back: name, order and games with their settings, never the room's ids; any spacing or case works.
const back = await playlistByCode(code.toLowerCase().replace("-", " "), { local: true });
assert.deepEqual(back, { name: "Viernes", order: "orden", items: [{ game: "opciones", config: { rounds: 5, roundMs: 15000 } }, { game: "minas", config: { rounds: 10 } }] });
assert.equal(normalizeShareCode("k7p2m-xh4qn"), "K7P2M-XH4QN");
assert.equal(normalizeShareCode("K7P2M"), null);
assert.equal(normalizeShareCode("K7P2M-XH4Q0"), null, "no 0, O, 1 or I");
await assert.rejects(playlistByCode("AAAAA-AAAAA", { local: true }), /ninguna playlist/);
await assert.rejects(playlistByCode("hola", { local: true }), /10 letras/);
await assert.rejects(shareCodeFor({ name: "Vacía", order: "orden", items: [] }, { local: true }), /al menos un juego/);

// A few codes a minute per person, then a pause.
for (let i = 0; i < SHARE_LIMIT.count; i += 1) assertCanShare("alguien", 1000 + i);
assert.throws(() => assertCanShare("alguien", 2000), /muchos códigos/);
assertCanShare("otra persona", 2000);
assertCanShare("alguien", 1000 + SHARE_LIMIT.windowMs + 1);

// A code nobody opened in a year is deleted; one opened lately stays.
await forgetOldShareCodes({ local: true, now: Date.now() + SHARE_TTL_MS + 60_000 });
await assert.rejects(playlistByCode(code, { local: true }), /ninguna playlist/);

fs.rmSync(file, { force: true });
console.log("sharedPlaylists.test ok");
