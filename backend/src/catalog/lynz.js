import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase, supabaseEnabled } from "../db/store.js";

// The 100 best-rated songs of Lynz (a music reviews site), offered as a default playlist of Adivina la canción next to
// Spotify's Top 50 (catalog/defaultPlaylists.js). Lynz's endpoint, GET /api/rankings/top-songs, needs no sign-in but
// answers only 2 requests a week per IP (429 + Retry-After beyond that), so it is asked once a week and what it says is
// kept (Supabase table `feed_cache`, else backend/private/lynz-top-songs.json): a restart never asks again. The host is
// LYNZ_API_URL (e.g. https://api.lynz.example); without it the playlist simply isn't offered.
//
// Lynz only gives a title and artists (no Spotify id, preview or cover): the songs are looked up like any other playlist's,
// through the TrackResolver (catalog, then the songs saved in `spotify_songs`, then iTunes), under an id made from them.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// (Tests give their own store, so they never touch the real file.)
const LOCAL_PATH = process.env.LYNZ_CACHE_FILE || path.join(__dirname, "../../private/lynz-top-songs.json");
const TABLE = "feed_cache";
const CACHE_KEY = "lynz-top-songs";

export const LYNZ_ID = "lynz-top-100";
export const LYNZ_NAME = "Top 100: Lynz";
const TOP_PATH = "/api/rankings/top-songs";
const MAX_SONGS = 100;
const MAX_TEXT = 200;
const REQUEST_TIMEOUT_MS = 15_000;

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Lynz's limit; we never ask more often than this in any week, whatever happens (failed asks count too).
export const MAX_REQUESTS_PER_WEEK = 2;
const RETRY_MS = 12 * 60 * 60 * 1000; // after a failed ask that wasn't a 429
const MIN_WAIT_MS = 60 * 1000;
const NOT_REACHED = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ERR_INVALID_URL"]);

/** Lynz's address from LYNZ_API_URL (a host, or the whole endpoint), or null when it isn't set. */
export function lynzEndpoint(url = process.env.LYNZ_API_URL) {
  const base = String(url || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return null;
  return base.endsWith(TOP_PATH) ? base : `${base}${TOP_PATH}`;
}

const plain = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

/** The id a Lynz song gets in the songs saved in `spotify_songs`: always the same for the same title and artists. */
export function lynzSongId(name, artist) {
  const hash = crypto.createHash("sha1").update(`${plain(name).toLowerCase()}|${plain(artist).toLowerCase()}`).digest("hex");
  return `lz-${hash.slice(0, 16)}`;
}

/**
 * Lynz's answer as { songs: [{ rank, name, artist, rating, reviewsCount }] } cleaned: best rank first, no repeats, at
 * most 100. Throws when there is nothing usable, so an empty answer never replaces a good list.
 */
export function parseTopSongs(json) {
  const seen = new Set();
  const songs = [];
  for (const s of Array.isArray(json?.songs) ? json.songs : []) {
    const name = plain(s?.name).slice(0, MAX_TEXT);
    const artist = plain(s?.artist).slice(0, MAX_TEXT);
    if (!name || !artist) continue;
    const id = lynzSongId(name, artist);
    if (seen.has(id)) continue;
    seen.add(id);
    songs.push({ rank: Number(s.rank) > 0 ? Number(s.rank) : songs.length + 1, name, artist, rating: Number(s.rating) || null, reviewsCount: Number(s.reviewsCount) || 0 });
  }
  if (!songs.length) throw new Error("Lynz no mandó canciones");
  return songs.sort((a, b) => a.rank - b.rank).slice(0, MAX_SONGS);
}

/** Asks Lynz for the top. A 429 throws an error with `retryAfterMs` (what its Retry-After header says). */
export async function fetchTopSongs(endpoint, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    const why = cause?.cause?.code || cause?.code || cause?.name || "sin detalle";
    const err = new Error(`Lynz no respondió (${why}) en ${endpoint}`);
    // The address doesn't exist or nobody answers there: the ask never reached Lynz, so it doesn't count for its limit.
    err.neverReached = NOT_REACHED.has(cause?.cause?.code || cause?.code) || cause instanceof TypeError;
    throw err;
  }
  if (res.status === 429) {
    const err = new Error("Lynz llegó a su límite de peticiones por semana");
    const seconds = Number(res.headers?.get?.("retry-after"));
    if (seconds > 0) err.retryAfterMs = Math.min(Math.max(seconds * 1000, MIN_WAIT_MS), WEEK_MS);
    throw err;
  }
  if (!res.ok) throw new Error(`Lynz respondió ${res.status}`);
  return parseTopSongs(await res.json().catch(() => null));
}

/** The songs as the tracks the TrackResolver looks up (the same shape as a Spotify playlist's). */
export function lynzTracks(songs) {
  return songs.map((s) => ({
    spotifyId: lynzSongId(s.name, s.artist),
    title: s.name,
    // "Artista A, Artista B": the main artists first, like Spotify's.
    artists: s.artist.split(/,\s*/).map((a) => a.trim()).filter(Boolean),
    albumId: null,
    albumName: "",
    albumType: "",
    albumArtist: "",
    trackNumber: null,
    discNumber: 1,
    year: null,
    durationMs: 0,
    previewUrl: null,
  }));
}

/** The playlist as the rooms keep it (see RoomManager.newLinkEntry). It has no cover until a song is found. */
export function lynzPlaylist(songs) {
  return { id: LYNZ_ID, kind: "playlist", name: LYNZ_NAME, image: null, tracks: lynzTracks(songs) };
}

// ---------- What is kept between restarts: { songs, fetchedAt, requests } ----------
function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8"));
  } catch {
    return null;
  }
}

export const savedLynz = {
  async load() {
    if (supabaseEnabled()) {
      const { data, error } = await getSupabase().from(TABLE).select("data").eq("key", CACHE_KEY).maybeSingle();
      if (!error && data) return data.data;
      if (error) console.warn(`[Lynz] No se pudo leer Supabase (${error.message}); uso ${LOCAL_PATH}`);
    }
    return readLocal();
  },
  async save(record) {
    if (supabaseEnabled()) {
      const row = { key: CACHE_KEY, data: record, fetched_at: new Date(record.fetchedAt || Date.now()).toISOString() };
      const { error } = await getSupabase().from(TABLE).upsert(row, { onConflict: "key" });
      if (!error) return;
      console.warn(`[Lynz] No se pudo guardar en Supabase (${error.message}); se guarda en ${LOCAL_PATH}`);
    }
    fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(record));
  },
};

/**
 * Lynz's top, kept up to date: `refresh()` loads what was saved and asks Lynz again only when it is a week old (or
 * there is nothing yet), never more than MAX_REQUESTS_PER_WEEK times in a week, and waiting out a 429's Retry-After.
 * A failed ask keeps the songs it had.
 */
export class LynzTop {
  constructor({ url, fetchImpl = (...a) => fetch(...a), store = savedLynz, now = Date.now } = {}) {
    this.url = url; // read when needed, not at import: the .env is loaded after the modules
    this.fetch = fetchImpl;
    this.store = store;
    this.now = now;
    this.songs = null;
    this.fetchedAt = 0;
    this.requests = []; // when we asked, newest last
    this.nextTryAt = 0;
    this.loaded = false;
  }

  get endpoint() {
    return lynzEndpoint(this.url ?? process.env.LYNZ_API_URL);
  }

  get enabled() {
    return Boolean(this.endpoint);
  }

  /** Whether `songs` changed (loaded from what was saved, or just fetched). */
  async refresh() {
    const endpoint = this.endpoint;
    if (!endpoint) {
      if (!this.warnedNoUrl) console.warn("[Lynz] Falta LYNZ_API_URL (la dirección de la API de Lynz, con https://): no se ofrece su playlist");
      this.warnedNoUrl = true;
      return false;
    }
    let changed = false;
    if (!this.loaded) {
      this.loaded = true;
      const saved = await this.store.load().catch((err) => {
        console.warn(`[Lynz] No se pudo leer lo guardado (${err.message})`);
        return null;
      });
      if (saved) {
        this.requests = (Array.isArray(saved.requests) ? saved.requests : []).filter(Number.isFinite);
        this.fetchedAt = Number(saved.fetchedAt) || 0;
        if (Array.isArray(saved.songs) && saved.songs.length) {
          this.songs = saved.songs;
          changed = true;
          console.log(`[Lynz] ${this.songs.length} canciones guardadas, leídas hace ${Math.floor((this.now() - this.fetchedAt) / 86_400_000)} días`);
        }
      }
    }
    const now = this.now();
    if ((this.songs && now - this.fetchedAt < WEEK_MS) || now < this.nextTryAt) return changed;
    this.requests = this.requests.filter((t) => now - t < WEEK_MS);
    if (this.requests.length >= MAX_REQUESTS_PER_WEEK) {
      this.nextTryAt = this.requests[0] + WEEK_MS;
      console.warn(`[Lynz] Ya se hicieron ${this.requests.length} peticiones esta semana (el límite de Lynz): vuelvo a pedir el ${new Date(this.nextTryAt).toISOString()}`);
      return changed;
    }
    // The ask is written down before it is made: if the server stops in the middle, the next start still counts it.
    this.requests.push(now);
    await this.save();
    try {
      this.songs = await fetchTopSongs(endpoint, this.fetch);
      this.fetchedAt = now;
      this.nextTryAt = 0;
      changed = true;
      console.log(`[Lynz] ${this.songs.length} canciones leídas`);
    } catch (err) {
      if (err.neverReached) this.requests.pop();
      this.nextTryAt = now + (err.retryAfterMs ?? RETRY_MS);
      console.warn(`[Lynz] ${err.message}; ${this.songs ? "sigo con la lista anterior y " : ""}lo intento otra vez más tarde`);
    }
    await this.save();
    return changed;
  }

  async save() {
    await this.store
      .save({ songs: this.songs || [], fetchedAt: this.fetchedAt, requests: this.requests })
      .catch((err) => console.warn(`[Lynz] No se pudo guardar (${err.message})`));
  }
}
