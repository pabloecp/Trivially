import { Router } from "express";
import { hydrateSong } from "../catalog/catalogProvider.js";
import { selectSongs } from "../catalog/songSelector.js";
import {
  claimGuestStats,
  deleteUser,
  leaderboard,
  linkGoogle,
  loginWithPassword,
  registerWithPassword,
  sanitizeUser,
  sanitizeUserPublic,
  unlinkGoogle,
  updateUserName,
  upsertGoogleUser,
  upsertUser,
} from "../db/store.js";
import { createGoogleAuthUrl, exchangeGoogleCode, googleConfigured } from "./google.js";
import { authRateLimit } from "./rateLimit.js";

export function createApiRouter({ catalog, store }) {
  const router = Router();

  router.post("/session", (req, res) => {
    const { id, name, avatar, isGuest } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: "Nombre requerido" });
    const user = upsertUser(store, { id, name, avatar, isGuest });
    req.session.userId = user.id;
    res.json({
      user: sanitizeUser(user),
      google: { configured: googleConfigured() },
    });
  });

  router.post("/auth/register", authRateLimit, (req, res) => {
    try {
      const { id, name, email, password, guestId, avatar } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: "Nombre requerido" });
      if (!email || !email.trim()) return res.status(400).json({ error: "Correo electrónico requerido" });

      let safeUser;
      if (password) {
        safeUser = registerWithPassword(store, { name, email, password, avatar, guestId });
      } else {
        const userId = id || `usr_${Date.now()}`;
        const user = upsertUser(store, { id: userId, name: name.trim(), email: email.trim(), avatar, isGuest: false });
        if (guestId) claimGuestStats(store, user.id, guestId);
        safeUser = sanitizeUser(store.users[user.id]);
      }

      req.session.userId = safeUser.id;
      res.json({ ok: true, user: safeUser });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/auth/login", authRateLimit, (req, res) => {
    try {
      const { identifier, email, password, guestId } = req.body || {};
      const loginId = (identifier || email || "").trim();
      if (!loginId) return res.status(400).json({ error: "Introduce tu correo o nombre" });

      let safeUser;
      if (password) {
        safeUser = loginWithPassword(store, { identifier: loginId, password, guestId });
      } else {
        const clean = loginId.toLowerCase();
        const existing = Object.values(store.users).find(
          (u) => (u.email && u.email.toLowerCase() === clean) || (u.name && u.name.toLowerCase() === clean && !u.isGuest)
        );
        if (!existing) {
          return res.status(404).json({ error: "No se encontró una cuenta con ese correo o nombre. ¿Deseas crear una?" });
        }
        if (guestId && guestId !== existing.id) {
          claimGuestStats(store, existing.id, guestId);
        }
        safeUser = sanitizeUser(existing);
      }

      req.session.userId = safeUser.id;
      res.json({ ok: true, user: safeUser });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/auth/logout", (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  router.post("/auth/claim-guest", (req, res) => {
    const { guestId } = req.body || {};
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "No autenticado" });
    const updated = claimGuestStats(store, userId, guestId);
    if (!updated) return res.status(400).json({ error: "No se pudieron vincular las estadísticas" });
    res.json({ ok: true, user: sanitizeUser(updated) });
  });

  // --- Account Linking / Unlinking ---

  router.post("/auth/unlink-google", (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: "No autenticado" });
      const user = unlinkGoogle(store, userId);
      res.json({ ok: true, user });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Delete Account ---

  router.delete("/auth/delete-account", (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: "No autenticado" });
      const { confirmName } = req.body || {};
      deleteUser(store, userId, confirmName);
      req.session = null;
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- User Info ---

  router.get("/me", (req, res) => {
    const id = req.session?.userId;
    const rawUser = id ? store.users[id] : null;
    const user = rawUser ? sanitizeUser(rawUser) : null;

    // Add linking status info for the owner
    let linkingStatus = null;
    if (rawUser) {
      linkingStatus = {
        hasPassword: Boolean(rawUser.passwordHash && rawUser.passwordSalt),
        googleLinked: Boolean(rawUser.googleId),
      };
    }

    res.json({
      user,
      linkingStatus,
      google: { configured: googleConfigured() },
    });
  });

  router.patch("/users/:id/name", (req, res) => {
    try {
      // Authorization: only the owner can change their name
      const sessionUserId = req.session?.userId;
      if (!sessionUserId || sessionUserId !== req.params.id) {
        return res.status(403).json({ error: "No tienes permiso para modificar este usuario" });
      }
      const { name } = req.body || {};
      const updated = updateUserName(store, req.params.id, name);
      res.json({ ok: true, user: updated });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Catalog ---

  router.get("/catalog", (req, res) => {
    res.json({
      source: catalog.songs[0]?.source || "seed",
      artists: catalog.artists,
      genres: catalog.genres,
      albums: catalog.albums,
      playlists: catalog.playlists.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image: p.image,
        trackCount: p.trackIds.length,
      })),
    });
  });

  router.post("/catalog/preview", async (req, res) => {
    const songs = selectSongs(catalog, req.body || {}).map((s) => {
      const h = hydrateSong(catalog, s);
      return { id: h.id, title: h.title, artistName: h.artistName, albumName: h.albumName, year: h.year, image: h.image, previewUrl: h.previewUrl };
    });
    res.json({ count: songs.length, songs });
  });

  // --- Leaderboard ---

  router.get("/leaderboard", (req, res) => {
    res.json({ entries: leaderboard(store, req.query.sort) });
  });

  // --- Public User Profile (sanitized) ---

  router.get("/users/:id", (req, res) => {
    const user = store.users[req.params.id];
    if (!user) return res.status(404).json({ error: "No encontrado" });

    // If requesting own profile, return full sanitized data; otherwise public-only
    const isOwner = req.session?.userId === req.params.id;
    if (isOwner) {
      res.json({ user: sanitizeUser(user) });
    } else {
      res.json({ user: sanitizeUserPublic(user) });
    }
  });

  // --- Google Auth ---

  router.get("/google/login", (req, res) => {
    try {
      const returnTo = req.query.returnTo || "/play";
      const purpose = req.query.purpose || "login";
      res.json({ url: createGoogleAuthUrl(returnTo, purpose) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

export function handleGoogleRedirect(req, res) {
  const host = req.headers.host || "";
  const defaultOrigin = host.includes("127.0.0.1") || host.includes("localhost")
    ? (host.includes("127.0.0.1") ? "http://127.0.0.1:5173" : "http://localhost:5173")
    : "https://triviallyonline.vercel.app";
  const origin = (process.env.CLIENT_ORIGIN || defaultOrigin).replace(/\/$/, "");
  try {
    const returnTo = req.query.returnTo || "/play";
    const purpose = req.query.purpose || "login";
    const url = createGoogleAuthUrl(returnTo, purpose);
    res.redirect(url);
  } catch (err) {
    console.error("Google redirect error:", err);
    res.redirect(`${origin}/login?google=error&msg=${encodeURIComponent(err.message)}`);
  }
}

export async function handleGoogleCallback(req, res, store) {
  const host = req.headers.host || "";
  const defaultOrigin = host.includes("127.0.0.1") || host.includes("localhost")
    ? (host.includes("127.0.0.1") ? "http://127.0.0.1:5173" : "http://localhost:5173")
    : "https://triviallyonline.vercel.app";
  const origin = (process.env.CLIENT_ORIGIN || defaultOrigin).replace(/\/$/, "");
  let returnTo = "/play";
  try {
    const { code, state } = req.query;
    if (!code) throw new Error("Código de autenticación ausente");
    const { profile, returnTo: stateReturnTo, purpose } = await exchangeGoogleCode(code, state);
    if (stateReturnTo) returnTo = stateReturnTo;

    if (purpose === "link") {
      // Linking Google to existing account
      const userId = req.session?.userId;
      if (!userId) {
        res.redirect(`${origin}${returnTo}?google=link_error&msg=${encodeURIComponent("No autenticado")}`);
        return;
      }
      linkGoogle(store, userId, {
        googleId: profile.googleId,
        email: profile.email,
        avatar: profile.avatar,
      });
      res.redirect(`${origin}${returnTo}?google=link_success`);
    } else {
      // Default: login / create account
      const guestId = req.session?.userId || null;
      const user = upsertGoogleUser(store, profile, guestId);
      req.session.userId = user.id;
      res.redirect(`${origin}${returnTo}?google=success&userId=${encodeURIComponent(user.id)}`);
    }
  } catch (err) {
    console.error("Google callback error:", err);
    res.redirect(`${origin}/login?google=error&msg=${encodeURIComponent(err.message)}`);
  }
}
