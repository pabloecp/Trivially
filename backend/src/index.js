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
  handleGoogleFinish,
  handleGoogleRedirect,
  handleSpotifyCallback,
} from "./auth/routes.js";
import { verifyAuthToken } from "./auth/socketToken.js";
import { attachSockets } from "./realtime/sockets.js";
import { getMedia, isCoverUrl, isPreviewUrl } from "./audio/mediaCache.js";

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

// Google must send users back through the site's own domain (Vercel rewrites /auth to this server). If the
// callback lands on the Railway domain instead, the session cookie belongs to that domain and phones block it.
if (!isLocalhost && process.env.GOOGLE_REDIRECT_URI) {
  try {
    if (new URL(process.env.GOOGLE_REDIRECT_URI).host !== new URL(clientOrigin).host) {
      console.warn(`[Google OAuth] GOOGLE_REDIRECT_URI debería ser ${clientOrigin}/auth/google/callback`);
    }
  } catch {}
}

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

// Fallback for browsers that drop the session cookie (mostly phones): the site also sends the token it got at
// login, and a valid one decides who the request belongs to.
app.use((req, _res, next) => {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const userId = match ? verifyAuthToken(match[1]) : null;
  if (userId && store.users[userId] && req.session.userId !== userId) req.session.userId = userId;
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, name: "YOAVLLY" }));

// Audio proxy: re-serves iTunes preview URLs with audio/mp4 MIME type
// Needed because iTunes returns audio/x-m4p which browsers don't play natively. Served from mediaCache, which a
// match fills ahead of time.
app.get("/api/audio/proxy", async (req, res) => {
  const url = req.query.url;
  if (!isPreviewUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  try {
    const audio = await getMedia(url);
    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(audio);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Album covers for the reveal screen, from the same cache, so the cover is ready the moment a round is revealed.
app.get("/api/image/proxy", async (req, res) => {
  const url = req.query.url;
  if (!isCoverUrl(url)) return res.status(400).json({ error: "Invalid URL" });
  try {
    const image = await getMedia(url);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(image);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.use("/api", createApiRouter({ catalog, store }));
app.get("/auth/google", handleGoogleRedirect);
app.get("/auth/google/callback", (req, res) => handleGoogleCallback(req, res, store));
app.get("/auth/google/finish", handleGoogleFinish);
app.get("/auth/spotify/callback", (req, res) => handleSpotifyCallback(req, res, store));

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
