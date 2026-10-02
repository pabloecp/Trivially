// Linking a Trivially account to Spotify (Authorization Code flow). For now only owners can do it.
// Needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET, plus the callback registered in the Spotify app:
// <site>/auth/spotify/callback (SPOTIFY_REDIRECT_URI to override it). The site's /auth is rewritten to this server.

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const ME_URL = "https://api.spotify.com/v1/me";
const SCOPES = "user-read-private user-read-email playlist-read-private";

export function spotifyConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

export function spotifyRedirectUri() {
  const site = (process.env.CLIENT_ORIGIN || "https://triviallyonline.vercel.app").replace(/\/$/, "");
  return process.env.SPOTIFY_REDIRECT_URI || `${site}/auth/spotify/callback`;
}

/** Where to send the player to approve the link. `state` is the signed ticket that says who they are. */
export function spotifyAuthUrl(state) {
  if (!spotifyConfigured()) throw new Error("Spotify no está configurado (faltan SPOTIFY_CLIENT_ID o SPOTIFY_CLIENT_SECRET)");
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    scope: SCOPES,
    state,
    show_dialog: "true",
  });
  return `${AUTH_URL}?${params}`;
}

/** Trades the code Spotify sent back for tokens, then reads the Spotify profile. */
export async function exchangeSpotifyCode(code, now = Date.now()) {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: spotifyRedirectUri() }),
  });
  if (!tokenRes.ok) {
    console.error("Spotify token error:", await tokenRes.text());
    throw new Error("Spotify no aceptó la conexión. Inténtalo otra vez.");
  }
  const tokens = await tokenRes.json();

  const meRes = await fetch(ME_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!meRes.ok) throw new Error("No se pudo leer tu perfil de Spotify");
  const me = await meRes.json();

  return {
    id: me.id,
    displayName: me.display_name || me.id,
    url: me.external_urls?.spotify || `https://open.spotify.com/user/${me.id}`,
    image: me.images?.[0]?.url || null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: now + (tokens.expires_in || 3600) * 1000,
    connectedAt: new Date(now).toISOString(),
  };
}
