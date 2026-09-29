import { io } from "socket.io-client";
import { BACKEND_URL } from "./config.js";

let socket;

export function getSocket() {
  if (!socket) {
    const socketUrl = BACKEND_URL || "/";
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
