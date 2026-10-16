import { readPublicSpotify } from "./spotifyEmbed.js";

// The Spotify playlists every room offers in Adivina la canción's "Tus playlists", for everyone, without adding them,
// and that can't be deleted. Same list as the frontend's (modes/music/MusicSettings.jsx).
// They are read once a day (Spotify itself updates them about daily), kept here, and put in every room already loaded
// (RoomManager.ensureDefaultPlaylists), so ticking one is instant and never reads Spotify again.
export const DEFAULT_SPOTIFY = [{ kind: "playlist", id: "37i9dQZEVXbMDoHDwVN2tF", name: "Top 50: Global" }];

/** Whether a link's target ({ kind, id }) or a room playlist's id ("sp:<id>") is one of the default playlists. */
export function isDefaultSpotify(target) {
  if (typeof target === "string") return DEFAULT_SPOTIFY.some((p) => target === `sp:${p.kind === "album" ? `album:${p.id}` : p.id}`);
  return DEFAULT_SPOTIFY.some((p) => p.kind === (target?.kind || "playlist") && p.id === target?.id);
}

// "<kind>:<id>" -> { playlist (as readPublicSpotify gives it), day ("2026-10-16") }.
const cache = new Map();
const today = () => new Date().toISOString().slice(0, 10);

/** The default playlists read so far, each with the day it was read: [{ playlist, day }]. */
export function cachedDefaultPlaylists() {
  return [...cache.values()];
}

/**
 * Reads the default playlists that weren't read today (a failed read keeps yesterday's, if any). Calls `onChange`
 * when any of them is new, so the rooms get it.
 */
export async function refreshDefaultPlaylists(onChange, read = readPublicSpotify) {
  let changed = false;
  for (const p of DEFAULT_SPOTIFY) {
    const key = `${p.kind}:${p.id}`;
    if (cache.get(key)?.day === today()) continue;
    try {
      const playlist = await read({ kind: p.kind, id: p.id });
      if (!playlist.tracks.length) continue;
      cache.set(key, { playlist, day: today() });
      changed = true;
    } catch (err) {
      console.warn(`[Spotify] No se pudo leer "${p.name}": ${err.message}`);
    }
  }
  if (changed) onChange?.();
}

/** At boot: reads them now, then checks every hour whether the day changed (or a read failed) and reads them again. */
export function startDefaultPlaylists(onChange) {
  refreshDefaultPlaylists(onChange);
  setInterval(() => refreshDefaultPlaylists(onChange), 60 * 60 * 1000).unref?.();
}
