import { io } from "socket.io-client";
import { BACKEND_URL } from "./config.js";

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

export function emitAck(event, ...args) {
  const s = getSocket();
  return new Promise((resolve) => {
    s.emit(event, ...args, (res) => resolve(res || { ok: false, error: "Sin respuesta" }));
  });
}
