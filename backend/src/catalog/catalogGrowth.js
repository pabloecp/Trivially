// The catalog grows with the songs people bring from Spotify (a pasted playlist or album, an owner's playlist): once
// such a song is found on iTunes (its 30 s preview and cover), it is checked here, and if it isn't in the catalog yet
// and has at least MIN_STREAMS plays on Spotify, it is saved in Supabase's `songs` table and joins the catalog at once
// (its ranking, its difficulty, the search box), for every room from then on.
//
// The plays: Spotify doesn't give them; kworb.net does, on each artist's page (every song with its total plays). The
// song's main artist comes from Spotify's embed page of the song. Checks go one at a time, a little apart, and each
// artist's page is read once a day at most. Such a song's id is `sp-<spotifyId>`, like every Spotify song in the game:
// `npm run catalog:upload` never deletes those (they aren't in catalog.json).
import { getSupabase, supabaseEnabled } from "../db/store.js";
import { normalizeAnswer, songKey } from "../game/answers.js";
import { cleanTitle, isRemix } from "./trackResolver.js";
import { withRankings } from "./catalogProvider.js";
import { forgetDifficulty } from "./songFilters.js";

export const MIN_STREAMS = 250_000_000;
const GAP_MS = 1500;
const ARTIST_TTL_MS = 24 * 60 * 60 * 1000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
};
const LATIN_GENRE = /latin|urbano|mexican|regional|tropical|salsa|bachata|reggaet|cumbia|banda|norte|corrido|flamenco|en espa|cantautor/i;
const OTHER_LANGUAGE_GENRE = /k-pop|j-pop|brazil|sertanejo|mpb|funk carioca|pagode|samba|ax[eé]|french|german|italian|bollywood|indian|arab|turk|afro/i;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const titleKey = (title) => `${normalizeAnswer(cleanTitle(title))}|${isRemix(title) ? "r" : ""}`;
const mainArtist = (name = "") => normalizeAnswer(String(name).split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\by\b)\s*/i)[0]);

/** The main artist's Spotify id, from the embed page of the song (its first "spotify:artist:…"). */
export function artistIdFromEmbed(html) {
  const list = String(html || "").match(/"artists":\[(.*?)\]/);
  return (list?.[1] || String(html || "")).match(/spotify:artist:([A-Za-z0-9]{22})/)?.[1] || null;
}

/** An artist's kworb page as { byId: spotifyId → plays, byTitle: title key → plays (the most played version) }. */
export function parseArtistPage(html) {
  const byId = new Map();
  const byTitle = new Map();
  const rows = String(html || "").matchAll(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})"[^>]*>([^<]+)<\/a><\/div><\/td><td>([\d,]+)<\/td>/g);
  for (const [, id, rawTitle, plays] of rows) {
    const streams = Number(plays.replace(/,/g, "")) || 0;
    const title = rawTitle.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'");
    byId.set(id, Math.max(byId.get(id) || 0, streams));
    const key = titleKey(title);
    byTitle.set(key, Math.max(byTitle.get(key) || 0, streams));
  }
  return { byId, byTitle };
}

/**
 * The song's language for the rankings: from its iTunes genre when it says ("Urbano latino" = Spanish); otherwise
 * what most of its main artist's songs in the catalog are; otherwise English.
 */
export function guessLanguage(catalog, song) {
  const genre = song.genre || "";
  if (LATIN_GENRE.test(genre)) return "es";
  if (OTHER_LANGUAGE_GENRE.test(genre)) return "other";
  const artist = mainArtist(song.artistName);
  const theirs = (catalog.songs || []).filter((s) => mainArtist(s.artistName) === artist);
  const spanish = theirs.filter((s) => s.language === "es").length;
  return theirs.length && spanish / theirs.length >= 0.6 ? "es" : "en";
}

export class CatalogGrowth {
  constructor({ catalog, fetchImpl = (...a) => fetch(...a), useDb = supabaseEnabled(), save = null, gapMs = GAP_MS }) {
    this.catalog = catalog;
    this.fetch = fetchImpl;
    this.enabled = useDb || Boolean(save);
    this.save = save || ((row) => this.saveToDb(row));
    this.gapMs = gapMs;
    this.checked = new Set(); // Spotify ids already looked at (until the server restarts)
    this.artists = new Map(); // artistId → { at, page: Promise }
    this.queue = [];
    this.running = false;
  }

  /** Whether the catalog already has this song (same iTunes song, same preview or same title and main artist). */
  inCatalog(song) {
    const key = songKey(song);
    return (this.catalog.songs || []).some(
      (s) => s.id === song.id || (song.itunesId && s.itunesId === song.itunesId) || s.previewUrl === song.previewUrl || songKey(s) === key
    );
  }

  /** A Spotify song (`track`: its Spotify title and id) found on iTunes (`song`): checked in the background. */
  consider(track, song) {
    if (!this.enabled || !track?.spotifyId || !song?.itunesId || !song.previewUrl) return;
    if (this.checked.has(track.spotifyId) || this.inCatalog(song)) return;
    this.checked.add(track.spotifyId);
    this.queue.push({ track, song });
    this.run();
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        try {
          await this.check(job);
        } catch (err) {
          console.warn(`[Catálogo] No se pudo revisar "${job.song.title}" (${err.message})`);
        }
        await wait(this.gapMs);
      }
    } finally {
      this.running = false;
    }
  }

  async text(url) {
    const res = await this.fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.text();
  }

  artistPage(artistId) {
    const cached = this.artists.get(artistId);
    if (cached && Date.now() - cached.at < ARTIST_TTL_MS) return cached.page;
    const page = this.text(`https://kworb.net/spotify/artist/${artistId}_songs.html`).then(parseArtistPage);
    page.catch(() => this.artists.delete(artistId));
    this.artists.set(artistId, { at: Date.now(), page });
    return page;
  }

  /** The song's total plays on Spotify (0 when kworb doesn't have it). */
  async streamsOf(track) {
    const artistId = artistIdFromEmbed(await this.text(`https://open.spotify.com/embed/track/${track.spotifyId}`));
    if (!artistId) return 0;
    const { byId, byTitle } = await this.artistPage(artistId);
    return byId.get(track.spotifyId) || byTitle.get(titleKey(track.title)) || 0;
  }

  async check({ track, song }) {
    if (this.inCatalog(song)) return;
    const streams = await this.streamsOf(track);
    if (streams < MIN_STREAMS) return;
    const language = guessLanguage(this.catalog, song);
    const added = {
      id: `sp-${track.spotifyId}`,
      title: song.title,
      artistName: song.artistName,
      artists: song.artists || track.artists || null,
      albumName: song.albumName || "",
      year: song.year || null,
      image: song.image || null,
      previewUrl: song.previewUrl,
      genre: song.genre || null,
      language,
      itunesId: song.itunesId,
      streams,
    };
    if (this.inCatalog(added)) return;
    await this.save(added);
    this.add(added);
    console.log(`[Catálogo] Nueva canción: "${added.title}" de ${added.artistName} (${Math.round(streams / 1e6)} M de reproducciones)`);
  }

  /** The song joins the catalog that's in memory: its rankings and difficulties are worked out again. */
  add(song) {
    this.catalog.songs.push(song);
    this.catalog.playlists = withRankings(this.catalog.songs).playlists;
    forgetDifficulty(this.catalog);
  }

  async saveToDb(song) {
    const { error } = await getSupabase()
      .from("songs")
      .upsert({
        id: song.id,
        title: song.title,
        artist_name: song.artistName,
        artists: song.artists,
        album_name: song.albumName || null,
        year: song.year,
        image: song.image,
        preview_url: song.previewUrl,
        genre: song.genre,
        language: song.language,
        itunes_id: song.itunesId,
        streams: song.streams,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  }
}
