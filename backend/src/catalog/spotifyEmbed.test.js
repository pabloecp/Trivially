import assert from "node:assert/strict";
import { parseEmbedPage, playlistIdFromLink, readPublicPlaylist } from "./spotifyEmbed.js";

// The link, however Spotify's "Copiar enlace" writes it.
const id = "5KA5qtQU9zuaXpOeskKe3b";
assert.equal(await playlistIdFromLink(`https://open.spotify.com/playlist/${id}?si=Qj6A6rTaT_eKqbVXZD1H3A&utm_source=copy-link&pi=9lrB1pRMSS-XR`), id);
assert.equal(await playlistIdFromLink(`https://open.spotify.com/intl-es/playlist/${id}`), id);
assert.equal(await playlistIdFromLink(`spotify:playlist:${id}`), id);
assert.equal(await playlistIdFromLink(` ${id} `), id);
await assert.rejects(playlistIdFromLink(`https://open.spotify.com/album/${id}`), /no parece un link/);
await assert.rejects(playlistIdFromLink("hola"), /no parece un link/);
// A short link is opened to see where it goes.
const shortFetch = async () => ({ url: `https://open.spotify.com/playlist/${id}?si=x`, text: async () => "" });
assert.equal(await playlistIdFromLink("https://spotify.link/abc", shortFetch), id);

// The page's data: name, cover and each song with its artists and its own preview.
const page = (entity) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></html>`;
const html = page({
  type: "playlist",
  id,
  name: "Reggaeton",
  coverArt: { sources: [{ url: "https://image-cdn-ak.spotifycdn.com/image/abc" }] },
  trackList: [
    { uri: "spotify:track:aaa", title: "La Bachata", subtitle: "Manuel Turizo", duration: 162637, audioPreview: { url: "https://p.scdn.co/mp3-preview/1" }, entityType: "track" },
    { uri: "spotify:track:bbb", title: "Bichota", subtitle: "Becky G, NATTI NATASHA", duration: 180000, audioPreview: null, entityType: "track" },
    { uri: "spotify:track:aaa", title: "La Bachata", subtitle: "Manuel Turizo", duration: 162637, entityType: "track" },
    { uri: "spotify:episode:ccc", title: "Un podcast", subtitle: "Alguien", entityType: "episode" },
  ],
});
const playlist = parseEmbedPage(html, id);
assert.equal(playlist.name, "Reggaeton");
assert.equal(playlist.image, "https://image-cdn-ak.spotifycdn.com/image/abc");
assert.deepEqual(playlist.tracks.map((t) => t.spotifyId), ["aaa", "bbb"], "no repeats, no podcasts");
assert.deepEqual(playlist.tracks[1].artists, ["Becky G", "NATTI NATASHA"]);
assert.equal(playlist.tracks[0].previewUrl, "https://p.scdn.co/mp3-preview/1");
assert.equal(playlist.tracks[1].previewUrl, null);
assert.equal(playlist.tracks[0].durationMs, 162637);

// A private playlist: the page has no data, or answers 404.
const notFound = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { status: 404 } } })}</script>`;
assert.throws(() => parseEmbedPage(notFound, id), /pública/);
await assert.rejects(readPublicPlaylist(id, async () => ({ status: 404, ok: false })), /pública/);
await assert.rejects(readPublicPlaylist(id, async () => { throw new Error("red"); }), /no respondió/);
assert.equal((await readPublicPlaylist(id, async () => ({ status: 200, ok: true, text: async () => html }))).tracks.length, 2);

console.log("spotifyEmbed.test ok");
