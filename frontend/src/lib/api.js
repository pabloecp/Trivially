import { BACKEND_URL } from "./config.js";

// Session token handed out at every login (see backend socketToken.js). Phones that drop our session cookie
// still stay signed in because every request carries it.
const AUTH_KEY = "trivially_auth";

function loadAuthToken() {
  try {
    return localStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_KEY, token);
    else localStorage.removeItem(AUTH_KEY);
  } catch {}
}

export async function api(path, options = {}) {
  const url = path.startsWith("http") ? path : `${BACKEND_URL}${path}`;
  const token = loadAuthToken();
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de red");
  if (data.authToken) setAuthToken(data.authToken);
  return data;
}
