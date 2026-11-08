import assert from "node:assert/strict";
import { readLocalCatalog } from "../catalog/catalogProvider.js";
import { RoomManager } from "../game/roomManager.js";
import { rowsToUpload, stableJson, toVerse, watchLyricRounds } from "./lyricRounds.js";
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

// The server reads the rounds uploaded after it started (watchLyricRounds): only those changed after the last read;
// a song that can't be a round any more leaves.
{
  const data = (answer, checked) => ({ lines: [{ at: 1, text: "Una línea que termina en ___" }], cut: 10, end: 11, answer, wrong: ["uno", "dos", "tres"], wrongChecked: checked });
  const table = [
    { song_id: "sp-old", preview_url: ITUNES, data: data("vieja", true), updated_at: "2026-11-01T00:00:00.000Z" },
    { song_id: "sp-new", preview_url: ITUNES, data: data("nueva", false), updated_at: "2026-11-08T10:00:00.000Z" },
  ];
  const asked = [];
  const db = {
    from: () => {
      let since = "";
      const q = {
        select: () => q,
        gt: (_col, value) => ((since = value), q),
        order: () => q,
        range: async (from, to) => {
          asked.push(since);
          const rows = table.filter((r) => r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
      return q;
    },
  };
  const rounds = new Map();
  const changes = [];
  const watch = watchLyricRounds({ rounds, db, since: "2026-11-05T00:00:00.000Z", onChange: (n) => changes.push(n), log: {} });
  assert.equal(await watch.tick(), 1);
  assert.deepEqual([...rounds.keys()], ["sp-new"]);
  assert.equal(rounds.get("sp-new").verse.checked, false, "not checked: only open");
  assert.equal(await watch.tick(), 0, "nothing new");
  assert.equal(asked.at(-1), "2026-11-08T10:00:00.000Z", "goes on from the newest read");
  table.push({ song_id: "sp-new", preview_url: ITUNES, data: null, updated_at: "2026-11-08T11:00:00.000Z" });
  assert.equal(await watch.tick(), 1);
  assert.equal(rounds.has("sp-new"), false);
  assert.deepEqual(changes, [1, 1]);
  watch.stop();
}

// Uploading sends only what's new or changed: the table gives jsonb back with its keys in another order, which is the
// same round.
assert.equal(stableJson({ b: 1, a: [2, { d: 3, c: null }] }), stableJson({ a: [2, { c: null, d: 3 }], b: 1 }));
{
  const round = { lines: [{ at: 1, text: "x ___" }], cut: 10.5, end: 11, answer: "a", wrong: ["b", "c", "d"] };
  const file = [
    { song_id: "same", spotify_id: "s", preview_url: ITUNES, preview_etag: "e", data: round },
    { song_id: "new", spotify_id: null, preview_url: ITUNES, preview_etag: null, data: null },
    { song_id: "cut", spotify_id: "s", preview_url: ITUNES, preview_etag: "e", data: { ...round, cut: 10.4 } },
    { song_id: "audio", spotify_id: "s", preview_url: SPOTIFY, preview_etag: "e", data: round },
  ];
  const reordered = { wrong: ["b", "c", "d"], answer: "a", end: 11, cut: 10.5, lines: [{ text: "x ___", at: 1 }] };
  const table = new Map(
    ["same", "cut", "audio"].map((id) => [id, { song_id: id, spotify_id: "s", preview_url: ITUNES, preview_etag: "e", data: reordered }])
  );
  const diff = rowsToUpload(file, table);
  assert.deepEqual(diff.rows.map((r) => r.song_id), ["new", "cut", "audio"]);
  assert.deepEqual([diff.added, diff.changed, diff.same], [1, 2, 1]);
}

console.log("lyricQueue.test ok");
