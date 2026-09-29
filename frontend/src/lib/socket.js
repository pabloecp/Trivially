import { io } from "socket.io-client";
import { BACKEND_URL } from "./config.js";

let socket;

export function getSocket() {
  if (!socket) {
    // Socket.IO needs a direct connection to Railway — Vercel rewrites don't support WebSockets.
    // In dev, BACKEND_URL is "" so we connect to "/" (same-origin proxy via Vite).
    // In production, we must connect directly to Railway.
    const socketUrl = BACKEND_URL || (import.meta.env.DEV ? "/" : "https://trivially-production.up.railway.app");
    socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
  }
  return socket;
}

export function emitAck(event, ...args) {
  const s = getSocket();
  return new Promise((resolve) => {
    s.emit(event, ...args, (res) => resolve(res || { ok: false, error: "Sin respuesta" }));
  });
}
