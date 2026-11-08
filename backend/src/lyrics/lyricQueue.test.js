import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "../game/roomManager.js";
import { toVerse } from "./lyricRounds.js";
import { LyricQueue, queueRows } from "./lyricQueue.js";

const ITUNES = "https://audio-ssl.itunes.apple.com/a.m4a";
const SPOTIFY = "https://p.scdn.co/mp3-preview/a";
const song = (id, previewUrl = ITUNES) => ({ id, spotifyId: id.slice(3), title: `Canción ${id}`, artists: ["Artista"], previewUrl });

// Only Spotify songs with audio, once each; one more ask than they had; a song tried on that same audio is left out,
// on another audio (Spotify's then, iTunes' now) it waits again.
const rows = queueRows([song("sp-a"), song("sp-a"), song("sp-b"), song("sp-c", SPOTIFY), song("sp-d", null), song("cat-e")], {
  tried: new Map([
    ["sp-b", ITUNES],
    ["sp-c", ITUNES],
  ]),
  queued: new Map([["sp-a", 2]]),
  now: "2026-11-08T00:00:00.000Z",
});
assert.deepEqual(
  rows.map((r) => [r.song_id, r.requests, r.preview_url]),
  [
    ["sp-a", 3, ITUNES],
    ["sp-c", 1, SPOTIFY],
  ]
);
assert.deepEqual(rows[0], { song_id: "sp-a", spotify_id: "a", title: "Canción sp-a", artists: ["Artista"], preview_url: ITUNES, requests: 3, requested_at: "2026-11-08T00:00:00.000Z" });

// A made-up Supabase: what each table has, and what was written.
function fakeDb(tables) {
  const written = [];
  return {
    written,
    from(table) {
      return {
        select: () => ({ in: async (_col, ids) => ({ data: (tables[table] || []).filter((r) => ids.includes(r.song_id)), error: null }) }),
        upsert: async (list) => (written.push(...list), { error: null }),
      };
    },
  };
}

// Gathered and written together; a song already in lyric_rounds with that audio isn't; the same one again within the
// hour isn't asked twice.
const db = fakeDb({ lyric_rounds: [{ song_id: "sp-b", preview_url: ITUNES }], lyric_queue: [{ song_id: "sp-a", requests: 4 }] });
const queue = new LyricQueue({ db, gatherMs: 60_000 });
queue.add(song("sp-a"));
queue.add(song("sp-b"));
queue.add(song("sp-a"));
assert.equal(await queue.flush(), 1);
assert.deepEqual(db.written.map((r) => [r.song_id, r.requests]), [["sp-a", 5]]);
queue.add(song("sp-a"));
assert.equal(await queue.flush(), 0, "not again within the hour");
queue.add(song("sp-a", SPOTIFY));
assert.equal(await queue.flush(), 1, "another audio is another ask");
clearTimeout(queue.timer);

// Without Supabase nothing is written down.
const off = new LyricQueue();
off.add(song("sp-a"));
assert.equal(off.pending.size, 0);

// A room: the songs of a Spotify playlist with no round for the audio they play are written down once looked up,
// those with one aren't.
const added = [];
const waiting = [];
const resolver = { resolve: async (tracks, job) => waiting.push({ tracks, job }) };
const verse = toVerse({ song_id: "sp-t0", data: { lines: [{ at: 1, text: "Una línea que termina en ___" }], cut: 10, end: 11, answer: "algo", wrong: ["uno", "dos", "tres"] } });
const mgr = new RoomManager({
  catalog: readLocalCatalog(),
  store: { users: { owner: { id: "owner", name: "Owner", spotify: { id: "s" } } } },
  resolver,
  lyricRounds: new Map([["sp-t0", { previewUrl: ITUNES, etag: null, verse }]]),
  lyricQueue: { add: (s) => added.push(s.id) },
});
process.env.OWNER_IDS = "owner";
const room = mgr.create({ host: { id: "owner", name: "Owner", socketId: "s1" }, game: "musica" });
const playlist = { id: "p", name: "Mi playlist", image: null, tracks: [0, 1, 2].map((i) => ({ spotifyId: `t${i}`, title: `Canción ${i}`, artists: ["Artista"] })) };
mgr.addSpotifyPlaylist(room, "owner", playlist);
const { job } = waiting[0];
job.onResult("t0", song("sp-t0"));
job.onResult("t1", song("sp-t1"));
job.onResult("t2", null);
assert.deepEqual(added, ["sp-t1"], "only the song played without its round (one not found isn't played)");
clearTimeout(room.progressTimer);

console.log("lyricQueue.test ok");
