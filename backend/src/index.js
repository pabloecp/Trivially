import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import cookieSession from "cookie-session";
import { Server } from "socket.io";
import { loadCatalog } from "./catalog/catalogProvider.js";
import { flushStore, initStore } from "./db/store.js";
import { RoomManager } from "./game/roomManager.js";
import {
  createApiRouter,
  handleGoogleCallback,
  handleGoogleRedirect,
} from "./auth/routes.js";
import { attachSockets } from "./realtime/sockets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PORT = Number(process.env.PORT || 8080);

const catalog = await loadCatalog();
const store = await initStore();
const rooms = new RoomManager({ catalog, store });

const app = express();
app.set("trust proxy", 1);

const clientOrigin = (process.env.CLIENT_ORIGIN || "https://triviallyonline.vercel.app").replace(/\/$/, "");
// Cross-site cookies only when serving HTTPS clients (production).
// On localhost, always use lax/insecure so dev works without HTTPS.
const isLocalhost = clientOrigin.includes("localhost") || clientOrigin.includes("127.0.0.1");
const isCrossSite = !isLocalhost && clientOrigin.startsWith("https://");

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      // Permitir el origen configurado de Vercel, localhost y subdominios
      if (
        origin === clientOrigin ||
        origin.endsWith(".vercel.app") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(
  cookieSession({
    name: "yoavlly",
    secret: process.env.SESSION_SECRET || "yoavlly-dev-secret",
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // stay signed in for 30 days
    sameSite: isCrossSite ? "none" : "lax",
    secure: isCrossSite,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true, name: "YOAVLLY" }));

// Audio proxy: re-serves iTunes preview URLs with audio/mp4 MIME type
// Needed because iTunes returns audio/x-m4p which browsers don't play natively
app.get("/api/audio/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith("https://audio-ssl.itunes.apple.com/")) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ error: "Upstream error" });
    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

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
  cors: {
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  },
});
attachSockets(io, rooms);

// Make sure the last stats reach the database when the host stops the server (Railway sends SIGTERM on deploy).
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    flushStore().finally(() => process.exit(0));
  });
}

server.listen(PORT, () => {
  console.log(`YOAVLLY API en http://localhost:${PORT}`);
});
