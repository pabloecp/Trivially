import assert from "node:assert/strict";
import { getMedia, isCoverUrl, isPreviewUrl, prefetchMedia, revealCoverUrl } from "./mediaCache.js";

// Count downloads with a fake fetch.
const calls = [];
let fail = false;
globalThis.fetch = async (url) => {
  calls.push(url);
  if (fail) return { ok: false, status: 503 };
  return { ok: true, arrayBuffer: async () => new TextEncoder().encode(`file:${url}`).buffer };
};

const a = "https://audio-ssl.itunes.apple.com/a.m4a";
const b = "https://audio-ssl.itunes.apple.com/b.m4a";
const cover = "https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg";

assert.ok(isPreviewUrl(a) && !isPreviewUrl("https://example.com/a.m4a"));
assert.ok(isCoverUrl(cover) && !isCoverUrl("https://example.com/c.jpg"));
assert.equal(revealCoverUrl(cover), "https://is1-ssl.mzstatic.com/image/thumb/Music/x/300x300bb.jpg");

// A match prefetches its rounds: each preview and reveal cover is downloaded once, then served from memory.
prefetchMedia([
  { previewUrl: a, image: cover },
  { previewUrl: b, image: "https://example.com/evil.jpg" },
  { previewUrl: a, image: cover },
]);
assert.deepEqual(calls, [a, revealCoverUrl(cover), b], "only iTunes files, each once");
assert.equal((await getMedia(a)).toString(), `file:${a}`);
assert.equal((await getMedia(revealCoverUrl(cover))).toString(), `file:${revealCoverUrl(cover)}`);
assert.equal(calls.length, 3, "served from memory");

// A failed download isn't kept: the next request tries again.
const c = "https://audio-ssl.itunes.apple.com/c.m4a";
fail = true;
await assert.rejects(getMedia(c));
fail = false;
assert.equal((await getMedia(c)).toString(), `file:${c}`);
assert.equal(calls.filter((u) => u === c).length, 2);

console.log("mediaCache.test ok");
