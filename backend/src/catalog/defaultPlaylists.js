import { LYNZ_ID, LynzTop, lynzPlaylist } from "./lynz.js";
import { readPublicSpotify } from "./spotifyEmbed.js";

// The playlists every room offers in Adivina la canción's "Tus playlists", for everyone, without adding them, and that
// can't be deleted: Spotify's Top 50 and the top 100 of Lynz (catalog/lynz.js). Spotify's are the same list as the
// frontend's (modes/music/MusicSettings.jsx); Lynz's reach the rooms like any playlist of theirs, flagged `defaultFrom`.
// They are read once a day (Spotify itself updates them about daily) or once a week (Lynz), kept here, and put in every
// room already loaded (RoomManager.ensureDefaultPlaylists), so ticking one is instant and never reads the source again.
export const DEFAULT_SPOTIFY = [{ kind: "playlist", id: "37i9dQZEVXbMDoHDwVN2tF", name: "Top 50: Global" }];

/** Whether a link's target ({ kind, id }) or a room playlist's id ("sp:<id>") is one of the default Spotify playlists. */
export function isDefaultSpotify(target) {
  if (typeof target === "string") return DEFAULT_SPOTIFY.some((p) => target === `sp:${p.kind === "album" ? `album:${p.id}` : p.id}`);
  return DEFAULT_SPOTIFY.some((p) => p.kind === (target?.kind || "playlist") && p.id === target?.id);
}

/** Where a default playlist of a room ("sp:<id>") comes from ("Spotify" or "Lynz"), or null when it isn't a default one. */
export function defaultSourceOf(roomPlaylistId) {
  if (isDefaultSpotify(roomPlaylistId)) return "Spotify";
  return roomPlaylistId === `sp:${LYNZ_ID}` ? "Lynz" : null;
}

// "<kind>:<id>" -> { playlist (as readPublicSpotify gives it), version, from }. The version is what the rooms compare to
// know theirs is old: the day it was read, or Lynz's read time.
const cache = new Map();
const today = () => new Date().toISOString().slice(0, 10);
const lynzTop = new LynzTop();
const LYNZ_KEY = `playlist:${LYNZ_ID}`;
const LOOKUP_MAX_MS = 60 * 60 * 1000;

/** The default playlists read so far, each with its version: [{ playlist, version, from }]. */
export function cachedDefaultPlaylists() {
  return [...cache.values()];
}

/** Looks the tracks up through the resolver and answers when every one has: Map(spotifyId -> song | null). */
function lookUp(resolver, tracks, { deep = false } = {}) {
  return new Promise((resolve) => {
    const answers = new Map();
    if (!tracks.length) return resolve(answers);
    const timer = setTimeout(() => resolve(answers), LOOKUP_MAX_MS);
    timer.unref?.();
    const done = () => {
      clearTimeout(timer);
      resolve(answers);
    };
    resolver
      .resolve(tracks, {
        deep,
        onResult: (id, song) => {
          answers.set(id, song);
          if (answers.size >= tracks.length) done();
        },
      })
      .catch((err) => {
        console.warn(`[Lynz] ${err.message}`);
        done();
      });
  });
}

/**
 * Looks up the songs of Lynz's playlist that aren't known yet (not in the catalog nor saved from earlier lookups): on
 * iTunes, once, then a second deeper pass for the ones not found, like a room does when its playlist is ticked. What is
 * found is kept by the resolver (and saved in `spotify_songs`), so ticking the playlist later is instant. When the first
 * pass is over, the best song found gives the playlist its cover.
 */
async function warmLynz(playlist, resolver, onChange) {
  const first = await lookUp(resolver, playlist.tracks);
  const cover = playlist.tracks.map((t) => first.get(t.spotifyId)?.image).find(Boolean);
  const entry = cache.get(LYNZ_KEY);
  if (cover && entry?.playlist === playlist && playlist.image !== cover) {
    playlist.image = cover;
    entry.version = `${entry.version}:cover`;
    onChange?.();
  }
  const second = await lookUp(resolver, playlist.tracks.filter((t) => !first.get(t.spotifyId)), { deep: true });
  const found = playlist.tracks.filter((t) => first.get(t.spotifyId) || second.get(t.spotifyId)).length;
  console.log(`[Lynz] ${found} de ${playlist.tracks.length} canciones listas para jugar`);
}

/** Reads Lynz's top when it is due (catalog/lynz.js); true when the playlist is new. */
async function refreshLynz(onChange, { top = lynzTop, resolver } = {}) {
  let changed;
  try {
    changed = await top.refresh();
  } catch (err) {
    console.warn(`[Lynz] ${err.message}`);
    return false;
  }
  if (!changed || !top.songs?.length) return false;
  const playlist = lynzPlaylist(top.songs);
  cache.set(LYNZ_KEY, { playlist, version: `lynz:${top.fetchedAt}`, from: "Lynz" });
  if (resolver) warmLynz(playlist, resolver, onChange).catch((err) => console.warn(`[Lynz] ${err.message}`));
  return true;
}

/**
 * Reads the default playlists that are due: Spotify's that weren't read today (a failed read keeps yesterday's, if
 * any) and Lynz's when it is a week old. Calls `onChange` when any of them is new, so the rooms get it. With a
 * `resolver`, the songs Lynz's playlist has that aren't known are looked up in the background.
 */
export async function refreshDefaultPlaylists(onChange, read = readPublicSpotify, { lynz = lynzTop, resolver } = {}) {
  let changed = false;
  for (const p of DEFAULT_SPOTIFY) {
    const key = `${p.kind}:${p.id}`;
    if (cache.get(key)?.version === today()) continue;
    try {
      const playlist = await read({ kind: p.kind, id: p.id });
      if (!playlist.tracks.length) continue;
      cache.set(key, { playlist, version: today(), from: "Spotify" });
      changed = true;
    } catch (err) {
      console.warn(`[Spotify] No se pudo leer "${p.name}": ${err.message}`);
    }
  }
  if (await refreshLynz(onChange, { top: lynz, resolver })) changed = true;
  if (changed) onChange?.();
}

/** At boot: reads them now, then checks every hour whether the day changed (or a read failed) and reads them again. */
export function startDefaultPlaylists(onChange, { resolver } = {}) {
  const check = () => refreshDefaultPlaylists(onChange, readPublicSpotify, { resolver });
  check();
  setInterval(check, 60 * 60 * 1000).unref?.();
}
