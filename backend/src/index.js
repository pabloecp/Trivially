import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import cookieSession from "cookie-session";
import { Server } from "socket.io";
import { loadCatalog } from "./catalog/catalogProvider.js";
import { loadStore } from "./db/store.js";
import { RoomManager } from "./game/roomManager.js";
import {
  createApiRouter,
  handleGoogleCallback,
  handleGoogleRedirect,
} from "./auth/routes.js";
import { attachSockets } from "./realtime/sockets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

const catalog = await loadCatalog();
const store = loadStore();
const rooms = new RoomManager({ catalog, store });

const app = express();
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  })
);
app.use(express.json());
app.use(
  cookieSession({
    name: "yoavlly",
    secret: process.env.SESSION_SECRET || "yoavlly-dev-secret",
    httpOnly: true,
    sameSite: "lax",
  })
);

app.get("/health", (_req, res) => res.json({ ok: true, name: "YOAVLLY" }));
app.use("/api", createApiRouter({ catalog, store }));
app.get("/auth/google", handleGoogleRedirect);
app.get("/auth/google/callback", (req, res) => handleGoogleCallback(req, res, store));

const frontendDist = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path.startsWith("/auth")) {
    return next();
  }
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) next();
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, callback) => callback(null, true), credentials: true },
});
attachSockets(io, rooms);

server.listen(PORT, () => {
  console.log(`YOAVLLY API en http://localhost:${PORT}`);
});
