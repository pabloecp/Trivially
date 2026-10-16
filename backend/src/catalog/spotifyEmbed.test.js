import assert from "node:assert/strict";
import { parseEmbedPage, readPublicSpotify, spotifyLinkFrom } from "./spotifyEmbed.js";

// The link, however Spotify's "Copiar enlace" writes it.
const id = "5KA5qtQU9zuaXpOeskKe3b";
const playlistLink = (v) => ({ kind: "playlist", id: v });
assert.deepEqual(await spotifyLinkFrom(`https://open.spotify.com/playlist/${id}?si=Qj6A6rTaT_eKqbVXZD1H3A&utm_source=copy-link&pi=9lrB1pRMSS-XR`), playlistLink(id));
assert.deepEqual(await spotifyLinkFrom(`https://open.spotify.com/intl-es/playlist/${id}`), playlistLink(id));
assert.deepEqual(await spotifyLinkFrom(`spotify:playlist:${id}`), playlistLink(id));
assert.deepEqual(await spotifyLinkFrom(` ${id} `), playlistLink(id));
// An album's link too.
assert.deepEqual(await spotifyLinkFrom(`https://open.spotify.com/album/${id}?si=7DVRPRcFTgedfNDrXO2lpA&utm_source=copy-link`), { kind: "album", id });
assert.deepEqual(await spotifyLinkFrom(`spotify:album:${id}`), { kind: "album", id });
await assert.rejects(spotifyLinkFrom(`https://open.spotify.com/artist/${id}`), /no parece un link/);
await assert.rejects(spotifyLinkFrom("hola"), /no parece un link/);
// A short link is opened to see where it goes.
const shortFetch = async () => ({ url: `https://open.spotify.com/playlist/${id}?si=x`, text: async () => "" });
assert.deepEqual(await spotifyLinkFrom("https://spotify.link/abc", shortFetch), playlistLink(id));

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
await assert.rejects(readPublicSpotify(playlistLink(id), async () => ({ status: 404, ok: false })), /pública/);
await assert.rejects(readPublicSpotify(playlistLink(id), async () => { throw new Error("red"); }), /no respondió/);
let asked = null;
const served = await readPublicSpotify(playlistLink(id), async (url) => ((asked = url), { status: 200, ok: true, text: async () => html }));
assert.equal(served.tracks.length, 2);
assert.equal(asked, `https://open.spotify.com/embed/playlist/${id}`);

// An album: its own id ("album:…", never mixed with a playlist's), its cover from visualIdentity (the biggest), and
// its name, year and cover on every song.
const albumHtml = page({
  type: "album",
  id: "alb",
  name: "Corridos Tumbados",
  releaseDate: { isoString: "2019-09-27T00:00:00Z" },
  visualIdentity: { image: [{ url: "https://x/300", maxWidth: 300 }, { url: "https://x/64", maxWidth: 64 }, { url: "https://x/640", maxWidth: 640 }] },
  trackList: [{ uri: "spotify:track:t1", title: "El Drip", subtitle: "Natanael Cano", duration: 150000, audioPreview: { url: "https://p.scdn.co/mp3-preview/a" }, entityType: "track" }],
});
const album = parseEmbedPage(albumHtml, "alb", "album");
assert.equal(album.id, "album:alb");
assert.equal(album.name, "Corridos Tumbados");
assert.equal(album.image, "https://x/640");
assert.equal(album.tracks[0].albumName, "Corridos Tumbados");
assert.equal(album.tracks[0].year, 2019);
await assert.rejects(readPublicSpotify({ kind: "album", id: "alb" }, async () => ({ status: 404, ok: false })), /ese álbum/);
// A playlist's link that leads to an album page (or the other way) is refused.
assert.throws(() => parseEmbedPage(albumHtml, "alb", "playlist"), /no parece un link/);

console.log("spotifyEmbed.test ok");
