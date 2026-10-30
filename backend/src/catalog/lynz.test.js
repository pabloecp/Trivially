import assert from "node:assert/strict";
import {
  LynzTop,
  MAX_REQUESTS_PER_WEEK,
  WEEK_MS,
  fetchTopSongs,
  lynzEndpoint,
  lynzPlaylist,
  lynzSongId,
  lynzTracks,
  parseTopSongs,
} from "./lynz.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The address: a host, or the whole endpoint; nothing without one.
assert.equal(lynzEndpoint("https://api.lynz.example"), "https://api.lynz.example/api/rankings/top-songs");
assert.equal(lynzEndpoint("https://api.lynz.example/"), "https://api.lynz.example/api/rankings/top-songs");
assert.equal(lynzEndpoint("https://api.lynz.example/api/rankings/top-songs"), "https://api.lynz.example/api/rankings/top-songs");
assert.equal(lynzEndpoint(""), null);
assert.equal(lynzEndpoint(undefined), null);
assert.equal(lynzEndpoint("api.lynz.example"), null, "needs http(s)");

// Lynz's answer, cleaned: by rank, no repeats, nothing without title or artist, at most 100.
const raw = (rank, name, artist, rating = 9, reviewsCount = 10) => ({ rank, name, artist, rating, reviewsCount });
const parsed = parseTopSongs({ songs: [raw(2, "Dos", "B"), raw(1, "Uno", "A, C"), raw(3, "Uno", "a, c"), raw(4, "", "X"), raw(5, "Sin artista", " "), null] });
assert.deepEqual(parsed.map((s) => s.name), ["Uno", "Dos"], "ordered by rank; the repeat, the empty and the null are out");
assert.equal(parsed[0].artist, "A, C");
assert.equal(parseTopSongs({ songs: Array.from({ length: 130 }, (_, i) => raw(i + 1, `Canción ${i}`, "Artista")) }).length, 100);
assert.throws(() => parseTopSongs({ songs: [] }), /no mandó canciones/);
assert.throws(() => parseTopSongs({}), /no mandó canciones/);
assert.throws(() => parseTopSongs(null), /no mandó canciones/);
assert.equal(parseTopSongs({ songs: [raw(1, "x".repeat(500), "y")] })[0].name.length, 200, "long texts are cut");

// A song's id is the same every week, and differs between songs; its artists are split like Spotify's.
assert.equal(lynzSongId("Uno", "A, C"), lynzSongId("  uno ", "a,   c"), "case and spaces don't matter");
assert.notEqual(lynzSongId("Uno", "A"), lynzSongId("Uno", "B"));
assert.match(lynzSongId("Uno", "A"), /^lz-[0-9a-f]{16}$/);
const [track] = lynzTracks(parsed);
assert.deepEqual(track.artists, ["A", "C"]);
assert.equal(track.spotifyId, lynzSongId("Uno", "A, C"));
assert.equal(track.previewUrl, null);
const playlist = lynzPlaylist(parsed);
assert.equal(playlist.id, "lynz-top-100");
assert.equal(playlist.tracks.length, 2);
assert.equal(playlist.image, null);

// Asking Lynz.
const answer = (status, body, headers = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => body,
});
assert.equal((await fetchTopSongs("https://x", answer(200, { songs: [raw(1, "Uno", "A")] }))).length, 1);
await assert.rejects(fetchTopSongs("https://x", answer(500, {})), /respondió 500/);
await assert.rejects(fetchTopSongs("https://x", async () => { throw new Error("red"); }), /no respondió/);
await assert.rejects(fetchTopSongs("https://x", answer(200, { nope: true })), /no mandó canciones/);
const limited = await fetchTopSongs("https://x", answer(429, { code: "RATE_LIMITED" }, { "retry-after": "86400" })).catch((e) => e);
assert.match(limited.message, /límite/);
assert.equal(limited.retryAfterMs, DAY);
assert.equal((await fetchTopSongs("https://x", answer(429, {})).catch((e) => e)).retryAfterMs, undefined, "no header, no wait given");

// ---------- The weekly schedule ----------
const memory = () => {
  let record = null;
  return { load: async () => record, save: async (r) => void (record = JSON.parse(JSON.stringify(r))), get record() { return record; } };
};
const clock = { t: Date.parse("2026-11-02T10:00:00Z") };
const lynzWith = (store, fetchImpl) => new LynzTop({ url: "https://lynz.test", fetchImpl, store, now: () => clock.t });
let asks = 0;
let reply = answer(200, { songs: [raw(1, "Uno", "A"), raw(2, "Dos", "B")] });
const fetching = async (...args) => {
  asks += 1;
  return reply(...args);
};

// Without an address, nothing is asked or saved.
{
  const store = memory();
  const off = new LynzTop({ url: "", fetchImpl: fetching, store, now: () => clock.t });
  assert.equal(off.enabled, false);
  assert.equal(await off.refresh(), false);
  assert.equal(asks, 0);
  assert.equal(store.record, null);
}

const store = memory();
let top = lynzWith(store, fetching);
assert.equal(await top.refresh(), true, "the first time it asks");
assert.equal(asks, 1);
assert.equal(top.songs.length, 2);
assert.equal(store.record.songs.length, 2);
assert.deepEqual(store.record.requests, [clock.t]);

// A day later nothing is asked, and the songs didn't change.
clock.t += DAY;
assert.equal(await top.refresh(), false);
assert.equal(asks, 1);

// A restart (a deploy) three days in: it loads what was saved, without asking.
clock.t += 2 * DAY;
top = lynzWith(store, fetching);
assert.equal(await top.refresh(), true, "the saved songs are new to this process");
assert.equal(top.songs.length, 2);
assert.equal(asks, 1, "a restart never asks again");
assert.equal(await top.refresh(), false);

// A week after the first time it asks again (the second request of the week-long window, the first of the next one).
clock.t += 4 * DAY + HOUR;
reply = answer(200, { songs: [raw(1, "Uno", "A"), raw(2, "Tres", "C"), raw(3, "Dos", "B")] });
assert.equal(await top.refresh(), true);
assert.equal(asks, 2);
assert.deepEqual(top.songs.map((s) => s.name), ["Uno", "Tres", "Dos"]);
assert.equal(top.requests.length, 1, "the first ask is out of the week now");

// A failure keeps the songs and waits before trying again; a 429 waits what Retry-After says.
clock.t += WEEK_MS;
reply = answer(500, {});
assert.equal(await top.refresh(), false);
assert.equal(asks, 3);
assert.equal(top.songs.length, 3, "the old list stays");
clock.t += HOUR;
assert.equal(await top.refresh(), false);
assert.equal(asks, 3, "not again so soon");
clock.t += 12 * HOUR;
reply = answer(429, { code: "RATE_LIMITED" }, { "retry-after": String(3 * 24 * 3600) });
assert.equal(await top.refresh(), false);
assert.equal(asks, 4);
clock.t += 2 * DAY;
assert.equal(await top.refresh(), false);
assert.equal(asks, 4, "still waiting for the Retry-After");

// Never more than MAX_REQUESTS_PER_WEEK asks in a week, even with restarts: with both of the week's asks spent,
// nothing more is asked until the first one is a week old.
assert.equal(MAX_REQUESTS_PER_WEEK, 2);
clock.t += 2 * DAY;
reply = answer(200, { songs: [raw(1, "Nueva", "N")] });
for (let i = 0; i < 4; i += 1) {
  top = lynzWith(store, fetching); // a restart
  await top.refresh();
  clock.t += 13 * HOUR;
}
assert.equal(asks, 4, "no more asks while the week's two are spent");
clock.t = store.record.requests[0] + WEEK_MS + HOUR;
top = lynzWith(store, fetching);
assert.equal(await top.refresh(), true, "the first ask of the week is a week old: it asks again");
assert.equal(asks, 5);
assert.deepEqual(top.songs.map((s) => s.name), ["Nueva"]);
assert.ok(store.record.requests.filter((t) => clock.t - t < WEEK_MS).length <= MAX_REQUESTS_PER_WEEK);

// Nothing saved and the first ask fails: no songs, and it tries again later.
{
  const empty = memory();
  asks = 0;
  reply = answer(500, {});
  const fresh = lynzWith(empty, fetching);
  assert.equal(await fresh.refresh(), false);
  assert.equal(fresh.songs, null);
  assert.equal(empty.record.songs.length, 0);
  clock.t += 13 * HOUR;
  reply = answer(200, { songs: [raw(1, "Uno", "A")] });
  assert.equal(await fresh.refresh(), true);
  assert.equal(fresh.songs.length, 1);
  assert.equal(asks, 2);
}

console.log("lynz.test ok");
