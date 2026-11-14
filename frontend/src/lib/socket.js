import { io } from "socket.io-client";
import { BACKEND_URL } from "./config.js";

import { translate as tr } from "../lib/i18n.js";
let socket;
// Supplies the signed token that tells the server who we are (set by AppProvider in store.jsx).
let tokenProvider = async () => null;

export function setSocketTokenProvider(fn) {
  tokenProvider = fn;
}

export function getSocket() {
  if (!socket) {
    // Socket.IO needs a direct connection to Railway — Vercel rewrites don't support WebSockets.
    // In dev, BACKEND_URL is "" so we connect to "/" (same-origin proxy via Vite).
    // In production, we must connect directly to Railway.
    const socketUrl = BACKEND_URL || (import.meta.env.DEV ? "/" : "https://trivially-production.up.railway.app");
    socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      // Called on every (re)connect, so the token always matches the current account.
      auth: (cb) => {
        tokenProvider()
          .then((token) => cb({ token }))
          .catch(() => cb({ token: null }));
      },
    });
  }
  return socket;
}

/** Reconnects so the server picks up a new identity (after signing in/out or becoming a guest). */
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

// The server writes its messages in Spanish: they reach the screens in the site's language.
function localized(res) {
  return res && typeof res.error === "string" ? { ...res, error: tr(res.error) } : res;
}

export function emitAck(event, ...args) {
  const s = getSocket();
  return new Promise((resolve) => {
    s.emit(event, ...args, (res) => resolve(localized(res) || { ok: false, error: tr("Sin respuesta") }));
  });
}

/** Like emitAck, but gives up after `ms` (a server that doesn't know the event, or a slow outside service). */
export function emitAckWithin(ms, event, ...args) {
  const s = getSocket();
  return new Promise((resolve) => {
    s.timeout(ms).emit(event, ...args, (err, res) =>
      resolve(err ? { ok: false, error: tr("El servidor no respondió. Inténtalo otra vez.") } : localized(res) || { ok: false, error: tr("Sin respuesta") })
    );
  });
}
