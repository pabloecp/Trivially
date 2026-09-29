import crypto from "node:crypto";
import dotenv from "dotenv";
import { fetchUserSpotifyLibrary } from "../catalog/spotifyCatalog.js";

dotenv.config();

const SPOTIFY_AUTH = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME = "https://api.spotify.com/v1/me";
const SCOPES = [
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-library-read",
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");

const pending = new Map();

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function spotifyConfigured() {
  if (!process.env.SPOTIFY_CLIENT_ID) {
    dotenv.config();
  }
  return Boolean(process.env.SPOTIFY_CLIENT_ID);
}

/**
 * @param {string} userId
 * @param {string} returnTo
 * @param {"connect"|"login"|"link"} purpose — "connect" for library, "login" for auth, "link" for linking
 */
export function createSpotifyAuthUrl(userId = "guest", returnTo = "/login", purpose = "connect") {
  if (!spotifyConfigured()) {
    throw new Error("Spotify no está configurado en el servidor (SPOTIFY_CLIENT_ID ausente)");
  }
  const state = `${userId}.${crypto.randomBytes(8).toString("hex")}`;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  pending.set(state, { userId, returnTo, codeVerifier, purpose, at: Date.now() });

  // Clean old entries after 10 minutes
  const now = Date.now();
  for (const [s, data] of pending.entries()) {
    if (now - data.at > 600000) pending.delete(s);
  }

  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:8787/auth/spotify/callback",
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    scope: SCOPES,
    state,
  });

  return `${SPOTIFY_AUTH}?${params.toString()}`;
}

export async function exchangeSpotifyCode(code, state) {
  const ctx = pending.get(state);
  pending.delete(state);
  if (!ctx) throw new Error("Sesión o state de Spotify inválido o expirado");

  const body = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:8787/auth/spotify/callback",
    code_verifier: ctx.codeVerifier,
  });

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const secret = process.env.SPOTIFY_CLIENT_SECRET ? process.env.SPOTIFY_CLIENT_SECRET.trim() : "";
  const isPlaceholder = !secret || secret === "TU_CLIENT_SECRET" || secret === "your_client_secret";

  // Secret is confidential on backend only. When using PKCE with public clients, Basic auth is omitted.
  if (!isPlaceholder) {
    const auth = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${secret}`
    ).toString("base64");
    headers.Authorization = `Basic ${auth}`;
  }

  const res = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Spotify token error:", errText);
    let parsedMsg = "";
    try {
      const parsed = JSON.parse(errText);
      parsedMsg = parsed.error_description || parsed.error || "";
    } catch {}
    throw new Error(parsedMsg ? `Spotify: ${parsedMsg}` : "No se pudo intercambiar el código con Spotify");
  }

  const tokens = await res.json();
  return {
    userId: ctx.userId,
    returnTo: ctx.returnTo || "/login",
    purpose: ctx.purpose || "connect",
    tokens,
  };
}

/** Get the Spotify user profile (email, display_name, images) */
export async function getSpotifyUserProfile(accessToken) {
  const res = await fetch(SPOTIFY_ME, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("No se pudo obtener el perfil del usuario de Spotify");
  }

  const profile = await res.json();
  return {
    spotifyId: profile.id,
    email: profile.email,
    name: profile.display_name || "Jugador Spotify",
    avatar: profile.images?.[0]?.url || null,
  };
}

export async function getSpotifyLibrary(tokens) {
  if (!tokens?.access_token) return fetchUserSpotifyLibrary(null);
  return fetchUserSpotifyLibrary(tokens.access_token);
}
