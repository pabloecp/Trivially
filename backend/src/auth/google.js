import crypto from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const pendingGoogleStates = new Map();

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function createGoogleAuthUrl(returnTo = "/", purpose = "login", clientOrigin = "") {
  if (!googleConfigured()) {
    throw new Error("Google OAuth no está configurado (GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET ausente)");
  }

  const statePayload = {
    nonce: crypto.randomBytes(12).toString("hex"),
    returnTo,
    purpose,
    origin: clientOrigin || "",
    at: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");
  pendingGoogleStates.set(state, statePayload);

  // Clean old entries after 10 minutes
  const now = Date.now();
  for (const [s, data] of pendingGoogleStates.entries()) {
    if (now - data.at > 600000) pendingGoogleStates.delete(s);
  }

  // Dynamic redirect_uri: derive from the client's origin so it works on both
  // localhost (http://localhost:5173/auth/google/callback) and production
  // (https://triviallyonline.vercel.app/auth/google/callback).
  let redirectUri;
  if (clientOrigin && (clientOrigin.includes("localhost") || clientOrigin.includes("127.0.0.1"))) {
    // In dev, callback goes directly to the backend (port 8080)
    const backendPort = process.env.PORT || 8080;
    redirectUri = `http://localhost:${backendPort}/auth/google/callback`;
  } else {
    redirectUri = process.env.GOOGLE_REDIRECT_URI || "https://triviallyonline.vercel.app/auth/google/callback";
  }

  console.log(`[Google OAuth] redirect_uri utilizado: ${redirectUri}`);

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
  let stateData = pendingGoogleStates.get(state);
  pendingGoogleStates.delete(state);

  // If state was created by another server/worker, decode from the state payload
  if (!stateData && state) {
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    } catch {
      try {
        stateData = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
      } catch {}
    }
  }

  // Use the same dynamic logic as createGoogleAuthUrl based on state origin
  const originFromState = stateData?.origin || "";
  let redirectUri;
  if (originFromState && (originFromState.includes("localhost") || originFromState.includes("127.0.0.1"))) {
    const backendPort = process.env.PORT || 8080;
    redirectUri = `http://localhost:${backendPort}/auth/google/callback`;
  } else {
    redirectUri = process.env.GOOGLE_REDIRECT_URI || "https://triviallyonline.vercel.app/auth/google/callback";
  }

  console.log(`[Google OAuth] Intercambiando token con redirect_uri: ${redirectUri}`);

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
    returnTo: stateData?.returnTo || "/",
    purpose: stateData?.purpose || "login",
    origin: stateData?.origin || "",
  };
}
