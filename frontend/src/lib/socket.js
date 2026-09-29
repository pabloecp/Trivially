import { io } from "socket.io-client";

let socket;

export function getSocket() {
  if (!socket) {
    socket = io("/", { transports: ["websocket"] });
  }
  return socket;
}

export function emitAck(event, ...args) {
  const s = getSocket();
  return new Promise((resolve) => {
    s.emit(event, ...args, (res) => resolve(res || { ok: false, error: "Sin respuesta" }));
  });
}
