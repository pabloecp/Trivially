// Turns Spotify songs (title, artists, length) into playable songs: the 30 s preview and cover come from iTunes,
// like the rest of the catalog. Each song is looked up once: results (found or not) are kept in memory and in the
// Supabase table `spotify_songs` (see backend/supabase/schema.sql), so the next room that picks a playlist with that
// song gets it at once. iTunes allows ~20 searches a minute, so the searches wait in a single queue.
import { getSupabase, supabaseEnabled } from "../db/store.js";
import { levenshtein, normalizeAnswer } from "../game/answers.js";

const SEARCH_GAP_MS = 3100; // ~19 searches a minute
const RATE_LIMIT_WAIT_MS = 30_000;
const MAX_GAP_MS = 20_000; // slowest pace after repeated blocks
const REQUEST_TIMEOUT_MS = 15_000; // a request that hangs must never stall the queue
const RETRY_NOT_FOUND_MS = 30 * 24 * 60 * 60 * 1000; // a song not found is searched again after a month
const TABLE = "spotify_songs";
// A not-found row with itunes_id 0 means the second, deeper search missed it too: it isn't searched again.
const DEEP_MISSED_ID = 0;
// Saved results from before the matching rules got stricter (any artist was enough) are searched again.
const RULES_SINCE = Date.parse("2026-10-01T06:00:00Z");
// Spotify and iTunes lengths of the same recording differ by a second or two at most.
const MAX_LENGTH_DIFF_MS = 6000;

/** "Song - Remastered 2011" or "Song (feat. X)" → "Song". The title players see and must guess. */
export function cleanTitle(title = "") {
  return title
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s*[([](feat\.?|ft\.?|with|con)\s[^)\]]*[)\]]/gi, "")
    .trim() || title.trim();
}

function titleScore(a, b) {
  const x = normalizeAnswer(cleanTitle(a));
  const y = normalizeAnswer(cleanTitle(b));
  if (!x || !y) return 0;
  if (x === y) return 1;
  if ((x.includes(y) || y.includes(x)) && Math.min(x.length, y.length) >= 4) return 0.85;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

function artistMatches(artists, name) {
  const n = normalizeAnswer(name);
  return artists.some((a) => {
    const x = normalizeAnswer(a);
    return x && (n.includes(x) || x.includes(n));
  });
}

const UNWANTED = /karaoke|instrumental|tribute|made famous|originally performed|in the style of|8 ?bit|lullaby/i;

/**
 * How well an iTunes result fits a Spotify song, or 0 when it isn't the same song. All three must agree: the title,
 * one of the artists, and the length (when both sides give it). A song with the same name by someone else, or a
 * karaoke/instrumental version, is never used: better to leave the song out than to play the wrong one.
 */
export function scoreCandidate(track, result) {
  if (!result?.previewUrl || !result.trackName) return 0;
  const title = titleScore(track.title, result.trackName);
  if (title < 0.8) return 0;
  if (!artistMatches(track.artists, result.artistName || "")) return 0;
  if (UNWANTED.test(`${result.trackName} ${result.artistName} ${result.collectionName}`) && !UNWANTED.test(track.title)) return 0;
  const diff = track.durationMs && result.trackTimeMillis ? Math.abs(track.durationMs - result.trackTimeMillis) : null;
  if (diff != null && diff > MAX_LENGTH_DIFF_MS) return 0;
  return title * 2 + (diff == null ? 0 : 1 - diff / MAX_LENGTH_DIFF_MS);
}

function songFromItunes(track, result) {
  return {
    id: `sp-${track.spotifyId}`,
    spotifyId: track.spotifyId,
    itunesId: result.trackId || null,
    title: cleanTitle(track.title),
    artistName: track.artists.join(" & ") || result.artistName,
    albumName: track.albumName || result.collectionName || "",
    year: track.year || Number(String(result.releaseDate || "").slice(0, 4)) || null,
    image: (result.artworkUrl100 || "").replace(/\/\d+x\d+bb\./, "/600x600bb.") || null,
    previewUrl: result.previewUrl,
  };
}

function songFromRow(row) {
  if (!row.found) return null;
  return {
    id: `sp-${row.spotify_id}`,
    spotifyId: row.spotify_id,
    itunesId: row.itunes_id,
    title: row.title,
    artistName: row.artist_name,
    albumName: row.album_name || "",
    year: row.year,
    image: row.image,
    previewUrl: row.preview_url,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class TrackResolver {
  constructor({ catalog, fetchImpl = (...a) => fetch(...a), searchGapMs = SEARCH_GAP_MS, useDb = supabaseEnabled() }) {
    this.fetch = fetchImpl;
    this.searchGapMs = searchGapMs;
    this.useDb = useDb;
    this.known = new Map(); // spotifyId -> song | null (not on iTunes)
    this.deepMissed = new Set(); // not found even by the second, deeper pass (until the server restarts)
    this.queue = [];
    this.running = false;
    this.lastSearchAt = 0;
    this.gap = searchGapMs; // grows while iTunes blocks us (403/429) and shrinks back as searches go through
    this.stats = { searches: 0, blocked: 0, found: 0, failed: 0 };
    // Songs already in the catalog are used as they are, by title + artist.
    this.catalogIndex = new Map();
    for (const s of catalog?.songs || []) {
      const key = normalizeAnswer(cleanTitle(s.title));
      if (!this.catalogIndex.has(key)) this.catalogIndex.set(key, []);
      this.catalogIndex.get(key).push(s);
    }
  }

  fromCatalog(track) {
    const list = this.catalogIndex.get(normalizeAnswer(cleanTitle(track.title))) || [];
    return list.find((s) => artistMatches(track.artists, s.artistName || "")) || null;
  }

  /**
   * Finds every song of a playlist. `onResult(spotifyId, song | null)` is called once per song as soon as it is
   * known (catalog and saved ones right away, the rest as iTunes answers). `isCancelled()` stops pending searches.
   */
  async resolve(tracks, { onResult, isCancelled = () => false, deep = false }) {
    // Second pass for songs the first one didn't find: other searches and stores (see search). Songs found in the
    // meantime are answered at once; songs the deep pass already missed aren't searched again.
    if (deep) {
      for (const t of tracks) {
        const song = this.known.get(t.spotifyId);
        if (song || this.deepMissed.has(t.spotifyId)) onResult(t.spotifyId, song || null);
        else this.queue.push({ track: t, onResult, isCancelled, deep: true });
      }
      this.run();
      return;
    }
    const missing = [];
    for (const t of tracks) {
      if (this.known.has(t.spotifyId)) onResult(t.spotifyId, this.known.get(t.spotifyId));
      else {
        const hit = this.fromCatalog(t);
        if (hit) {
          this.known.set(t.spotifyId, hit);
          onResult(t.spotifyId, hit);
        } else missing.push(t);
      }
    }
    const saved = await this.loadSaved(missing.map((t) => t.spotifyId));
    const toSearch = missing.filter((t) => !saved.has(t.spotifyId)).length;
    console.log(
      `[Spotify] ${tracks.length} canciones: ${tracks.length - missing.length} ya conocidas, ` +
        `${saved.size} guardadas en la base de datos, ${toSearch} por buscar en iTunes`
    );
    for (const t of missing) {
      if (saved.has(t.spotifyId)) {
        this.known.set(t.spotifyId, saved.get(t.spotifyId));
        onResult(t.spotifyId, saved.get(t.spotifyId));
      } else {
        this.queue.push({ track: t, onResult, isCancelled });
      }
    }
    this.run();
  }

  async loadSaved(ids) {
    const out = new Map();
    if (!this.useDb || !ids.length) return out;
    try {
      const db = getSupabase();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await db.from(TABLE).select("*").in("spotify_id", ids.slice(i, i + 200));
        if (error) throw error;
        for (const row of data) {
          const savedAt = new Date(row.updated_at).getTime();
          if (savedAt < RULES_SINCE) continue;
          if (!row.found && Date.now() - savedAt > RETRY_NOT_FOUND_MS) continue;
          if (!row.found && Number(row.itunes_id) === DEEP_MISSED_ID) this.deepMissed.add(row.spotify_id);
          out.set(row.spotify_id, songFromRow(row));
        }
      }
    } catch (err) {
      console.warn(`[Spotify] No se pudieron leer las canciones guardadas (${err.message})`);
    }
    return out;
  }

  async save(track, song, { deepMissed = false } = {}) {
    if (!this.useDb) return;
    const row = {
      spotify_id: track.spotifyId,
      found: Boolean(song),
      title: song?.title || cleanTitle(track.title),
      artist_name: song?.artistName || track.artists.join(" & "),
      album_name: song?.albumName || track.albumName || null,
      year: song?.year || track.year || null,
      image: song?.image || null,
      preview_url: song?.previewUrl || null,
      itunes_id: song?.itunesId || (deepMissed ? DEEP_MISSED_ID : null),
      catalog_song_id: song && !song.id.startsWith("sp-") ? song.id : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await getSupabase().from(TABLE).upsert(row, { onConflict: "spotify_id" });
    if (error) console.warn(`[Spotify] No se pudo guardar ${track.spotifyId} (${error.message})`);
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        try {
          await this.runJob(job);
        } catch (err) {
          // Whatever happens with one song, the queue keeps going.
          console.warn(`[Spotify] Error con "${job.track.title}" (${err.message})`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async runJob(job) {
    if (job.isCancelled()) return;
    const id = job.track.spotifyId;
    if (this.known.get(id) || (this.known.has(id) && !job.deep)) {
      job.onResult(id, this.known.get(id));
      return;
    }
    let song = null;
    try {
      song = await this.search(job.track, { deep: job.deep });
    } catch (err) {
      // Couldn't ask iTunes (not a "not found"): tell the room, but don't remember it.
      console.warn(`[Spotify] Búsqueda fallida para "${job.track.title}" (${err.message})`);
      this.stats.failed += 1;
      job.onResult(id, null);
      return;
    }
    if (song) this.stats.found += 1;
    if (job.deep && !song) {
      this.deepMissed.add(id);
      job.onResult(id, null);
      this.save(job.track, null, { deepMissed: true }).catch(() => {});
      return;
    }
    this.known.set(id, song);
    job.onResult(id, song);
    this.save(job.track, song).catch(() => {});
  }

  async itunes(term, extra = {}) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const gap = this.lastSearchAt + this.gap - Date.now();
      if (gap > 0) await wait(gap);
      this.lastSearchAt = Date.now();
      const url = `https://itunes.apple.com/search?${new URLSearchParams({ term, media: "music", entity: "song", limit: "15", country: "US", ...extra })}`;
      const res = await this.fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      this.stats.searches += 1;
      if (this.stats.searches % 25 === 0) this.logStats();
      if (res.status === 403 || res.status === 429) {
        // Blocked: wait, and go slower from now on so it doesn't keep happening.
        this.stats.blocked += 1;
        this.gap = Math.min(MAX_GAP_MS, this.gap * 2);
        console.warn(`[Spotify] iTunes bloqueó la búsqueda (${res.status}); espero y sigo cada ${Math.round(this.gap / 1000)} s`);
        await wait(RATE_LIMIT_WAIT_MS);
        continue;
      }
      if (!res.ok) throw new Error(`iTunes ${res.status}`);
      const data = await res.json();
      this.gap = Math.max(this.searchGapMs, this.gap * 0.9);
      return data.results || [];
    }
    throw new Error("iTunes sigue limitando las búsquedas");
  }

  logStats() {
    const { searches, blocked, found, failed } = this.stats;
    console.log(
      `[Spotify] iTunes: ${searches} búsquedas, ${found} encontradas, ${blocked} bloqueadas, ${failed} fallidas, ` +
        `${this.queue.length} canciones en cola, una cada ${Math.round(this.gap / 1000)} s`
    );
  }

  /**
   * "title + first artist", then "title + second artist", then the first artist's songs (the search sometimes
   * misses a song the artist list has). Every result still has to pass scoreCandidate.
   */
  async search(track, { deep = false } = {}) {
    const title = cleanTitle(track.title);
    const [first, second] = track.artists;
    const searches = [];
    if (!deep) {
      // First pass: one search per song, so the whole playlist gets a first look quickly. Most songs are found here.
      searches.push([`${title} ${first || ""}`.trim()]);
    } else {
      // The deeper pass: the title with the second artist, the first artist's songs, the title without anything in
      // brackets on other countries' stores (some Latin releases are only there), the title alone with more
      // results, the second artist's songs and the album. The result still has to be the same title, artist and
      // length (scoreCandidate).
      const plain = title.replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+/g, " ").trim() || title;
      if (second) searches.push([`${title} ${second}`]);
      if (first) searches.push([first, { attribute: "artistTerm", limit: "200" }]);
      searches.push([`${first || ""} ${plain}`.trim(), { country: "MX" }]);
      searches.push([`${plain} ${first || ""}`.trim(), { country: "ES" }]);
      searches.push([plain, { limit: "50" }]);
      if (second) searches.push([second, { attribute: "artistTerm", limit: "200" }]);
      if (first && track.albumName) searches.push([`${first} ${cleanTitle(track.albumName)}`, { limit: "50" }]);
    }
    for (const [term, extra] of searches) {
      const results = await this.itunes(term, extra);
      let best = null;
      let bestScore = 0;
      for (const r of results) {
        const score = scoreCandidate(track, r);
        if (score > bestScore) {
          best = r;
          bestScore = score;
        }
      }
      if (best) return songFromItunes(track, best);
    }
    return null;
  }
}
