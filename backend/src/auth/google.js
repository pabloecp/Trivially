import crypto from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const pendingGoogleStates = new Map();

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function createGoogleAuthUrl(returnTo = "/play", purpose = "login") {
  if (!googleConfigured()) {
    throw new Error("Google OAuth no está configurado (GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET ausente)");
  }

  const state = crypto.randomBytes(16).toString("hex");
  pendingGoogleStates.set(state, { returnTo, purpose, at: Date.now() });

  // Clean old entries after 10 minutes
  const now = Date.now();
  for (const [s, data] of pendingGoogleStates.entries()) {
    if (now - data.at > 600000) pendingGoogleStates.delete(s);
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "https://trivially-production.up.railway.app/auth/google/callback";

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code, state) {
  const stateData = pendingGoogleStates.get(state);
  pendingGoogleStates.delete(state);

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "https://trivially-production.up.railway.app/auth/google/callback";

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Google token error:", errText);
    throw new Error("No se pudo intercambiar el código con Google");
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Get user profile
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) {
    throw new Error("No se pudo obtener el perfil del usuario de Google");
  }

  const profile = await userRes.json();
  return {
    profile: {
      id: `goog_${profile.sub}`,
      googleId: profile.sub,
      email: profile.email,
      name: profile.name || profile.given_name || "Usuario de Google",
      avatar: profile.picture,
    },
    returnTo: stateData?.returnTo || "/play",
    purpose: stateData?.purpose || "login",
  };
}
