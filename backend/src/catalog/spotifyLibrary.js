// Reads an owner's Spotify playlists with the tokens saved by the Spotify link (auth/spotify.js). Only song names,
// artists, albums and lengths come from here: the audio is found on iTunes (catalog/trackResolver.js).
import { saveStore } from "../db/store.js";

const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const MAX_PLAYLISTS = 200;
const MAX_TRACKS = 500;

/** A valid access token for the user, refreshing it (and saving the new one) when it is about to expire. */
async function accessToken(store, userId) {
  const user = store.users[userId];
  const link = user?.spotify;
  if (!link) throw new Error("Conecta tu Spotify en tu perfil primero");
  if (link.accessToken && link.expiresAt > Date.now() + 60_000) return link.accessToken;

  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: link.refreshToken || "" }),
  });
  if (!res.ok) {
    console.error("Spotify refresh error:", await res.text());
    throw new Error("Tu conexión con Spotify caducó. Vuelve a conectarlo en tu perfil.");
  }
  const tokens = await res.json();
  link.accessToken = tokens.access_token;
  link.expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
  if (tokens.refresh_token) link.refreshToken = tokens.refresh_token;
  saveStore(store);
  return link.accessToken;
}

async function get(store, userId, pathOrUrl) {
  const token = await accessToken(store, userId);
  const res = await fetch(pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error(res.status === 403 || res.status === 404 ? "Spotify no deja leer esa playlist" : "Spotify no respondió. Inténtalo otra vez.");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function bestImage(images) {
  if (!images?.length) return null;
  // The smallest one that is still at least 160px, otherwise the first.
  const fit = [...images].filter((i) => (i.width || 640) >= 160).sort((a, b) => (a.width || 640) - (b.width || 640));
  return (fit[0] || images[0]).url;
}

/** The user's playlists (their own and the ones they follow): id, name, cover and number of songs. */
export async function listSpotifyPlaylists(store, userId) {
  const out = [];
  let next = "/me/playlists?limit=50";
  while (next && out.length < MAX_PLAYLISTS) {
    const page = await get(store, userId, next);
    for (const p of page.items || []) {
      if (!p?.id) continue;
      out.push({
        id: p.id,
        name: p.name || "Playlist",
        image: bestImage(p.images),
        // Newer API responses call the songs `items`, older ones `tracks`.
        total: p.items?.total ?? p.tracks?.total ?? 0,
        owner: p.owner?.display_name || p.owner?.id || "",
      });
    }
    next = page.next;
  }
  return out;
}

/** One playlist's name, cover and songs (only real songs: no podcast episodes or local files). */
export async function readSpotifyPlaylist(store, userId, playlistId) {
  const info = await get(store, userId, `/playlists/${encodeURIComponent(playlistId)}?fields=id,name,images`);
  const tracks = [];
  // Spotify renamed /tracks to /items; try the new one first.
  let next = `/playlists/${encodeURIComponent(playlistId)}/items?limit=100&additional_types=track`;
  try {
    await collect();
  } catch (err) {
    if (tracks.length || (err.status !== 404 && err.status !== 403)) throw err;
    next = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
    await collect();
  }
  return { id: info.id, name: info.name || "Playlist", image: bestImage(info.images), tracks };

  async function collect() {
    while (next && tracks.length < MAX_TRACKS) {
      const page = await get(store, userId, next);
      for (const entry of page.items || []) {
        const t = entry?.item || entry?.track;
        if (!t?.id || t.type === "episode" || t.is_local) continue;
        if (tracks.some((x) => x.spotifyId === t.id)) continue;
        tracks.push({
          spotifyId: t.id,
          title: t.name,
          artists: (t.artists || []).map((a) => a.name).filter(Boolean),
          albumName: t.album?.name || "",
          year: Number(String(t.album?.release_date || "").slice(0, 4)) || null,
          durationMs: t.duration_ms || 0,
        });
      }
      next = page.next;
    }
  }
}
