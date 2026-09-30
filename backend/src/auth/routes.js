import { Router } from "express";
import { hydrateSong } from "../catalog/catalogProvider.js";
import { selectSongs } from "../catalog/songSelector.js";
import {
  claimGuestStats,
  deleteUser,
  leaderboard,
  linkGoogle,
  listUsers,
  loginWithPassword,
  registerWithPassword,
  sanitizeUser,
  sanitizeUserPublic,
  setUserRole,
  unlinkGoogle,
  updateUserName,
  upsertGoogleUser,
  upsertUser,
} from "../db/store.js";
import { createGoogleAuthUrl, exchangeGoogleCode, googleConfigured } from "./google.js";
import { authRateLimit } from "./rateLimit.js";
import { hasRole, ROLES } from "./roles.js";
import { consumeTicket, createSocketToken, createTicket } from "./socketToken.js";
import crypto from "node:crypto";

/** Express middleware: only lets through signed-in users with at least `minRole`. */
export function requireRole(store, minRole) {
  return (req, res, next) => {
    const user = req.session?.userId ? store.users[req.session.userId] : null;
    if (!user || user.isGuest) return res.status(401).json({ error: "Inicia sesión para continuar" });
    if (!hasRole(user, minRole)) return res.status(403).json({ error: "No tienes permiso para hacer esto" });
    req.user = user;
    next();
  };
}

// Linking Google needs to know who is signed in, but the callback may land on another domain without our
// session cookie; so the signed-in user's id travels inside the OAuth state as a signed ticket.
function linkTicketFor(req, purpose) {
  return purpose === "link" && req.session?.userId ? createTicket(req.session.userId, "link", 10 * 60 * 1000) : null;
}

/** Only same-site paths like "/profile", never "//evil.com" or full URLs. */
function safePath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

export function createApiRouter({ catalog, store }) {
  const router = Router();

  // Starts (or refreshes) the session of a guest, or of a registered user who is already signed in.
  // A registered account can only be entered through /auth/login, /auth/register or Google, so nobody can
  // take over someone else's account (or role) just by sending its id here.
  router.post("/session", (req, res) => {
    const { id, name, avatar } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: "Nombre requerido" });

    const existing = store.users[id];
    if (existing && !existing.isGuest) {
      if (req.session?.userId !== id) {
        return res.status(401).json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." });
      }
      const user = upsertUser(store, { id, name, avatar });
      return res.json({ user: sanitizeUser(user), google: { configured: googleConfigured() } });
    }

    if (!String(id).startsWith("gst_")) return res.status(400).json({ error: "Identificador de invitado no válido" });
    // Never downgrade a signed-in account to a guest (e.g. a stale guest saved in the browser racing a login).
    const current = req.session?.userId ? store.users[req.session.userId] : null;
    if (current && !current.isGuest) {
      return res.json({ user: sanitizeUser(current), google: { configured: googleConfigured() } });
    }
    // Guest ids are visible to everyone in a room, so an id that already belongs to another browser's session
    // gets a fresh one instead of being handed over. The client adopts whatever id comes back.
    const taken = existing && req.session?.userId !== id;
    const guestId = taken ? `gst_${crypto.randomBytes(5).toString("hex")}` : id;
    const user = upsertUser(store, { id: guestId, name, avatar, isGuest: true });
    req.session.userId = user.id;
    res.json({
      user: sanitizeUser(user),
      google: { configured: googleConfigured() },
    });
  });

  // Token the browser passes to Socket.IO so the realtime server knows which account it is (see socketToken.js).
  router.get("/socket-token", (req, res) => {
    const userId = req.session?.userId;
    if (!userId || !store.users[userId]) return res.json({ token: null, userId: null });
    res.json({ token: createSocketToken(userId), userId });
  });

  router.post("/auth/register", authRateLimit, (req, res) => {
    try {
      const { name, email, password, guestId, avatar } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: "Nombre requerido" });
      if (!email || !email.trim()) return res.status(400).json({ error: "Correo electrónico requerido" });

      if (!password) return res.status(400).json({ error: "Contraseña requerida" });
      const safeUser = registerWithPassword(store, { name, email, password, avatar, guestId });

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

      if (!password) return res.status(400).json({ error: "Introduce tu contraseña" });
      const safeUser = loginWithPassword(store, { identifier: loginId, password, guestId });

      req.session.userId = safeUser.id;
      res.json({ ok: true, user: safeUser });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Second half of the Google login (see handleGoogleCallback): trades the one-time ticket for a session.
  router.post("/auth/google/finish", authRateLimit, (req, res) => {
    const userId = consumeTicket(req.body?.ticket, "login");
    const user = userId ? store.users[userId] : null;
    if (!user) return res.status(400).json({ error: "El inicio de sesión con Google expiró. Inténtalo otra vez." });
    const previous = req.session?.userId;
    if (previous && previous !== user.id) claimGuestStats(store, user.id, previous);
    req.session.userId = user.id;
    res.json({ ok: true, user: sanitizeUser(user) });
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

  // --- Roles / admin ---

  router.get("/admin/roles", requireRole(store, "moderator"), (req, res) => {
    res.json({ roles: ROLES });
  });

  router.get("/admin/users", requireRole(store, "moderator"), (req, res) => {
    const users = listUsers(store, { search: String(req.query.search || ""), role: String(req.query.role || "") });
    res.json({ users });
  });

  router.patch("/admin/users/:id/role", requireRole(store, "admin"), (req, res) => {
    try {
      const user = setUserRole(store, req.user.id, req.params.id, req.body?.role);
      console.log(`[Roles] ${req.user.name} (${req.user.id}) cambió el rol de ${user.name} (${user.id}) a ${user.role}`);
      res.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
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
    res.json({ count: songs.length, matchingCount: songs.length, songs });
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
      const returnTo = req.query.returnTo || "/";
      const purpose = req.query.purpose || "login";
      const origin = req.query.origin || "";
      res.json({ url: createGoogleAuthUrl(returnTo, purpose, origin, linkTicketFor(req, purpose)) });
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
  const originParam = req.query.origin || req.headers.referer || "";
  const clientOrigin = originParam ? new URL(originParam, defaultOrigin).origin : defaultOrigin;
  try {
    const returnTo = req.query.returnTo || "/";
    const purpose = req.query.purpose || "login";
    const url = createGoogleAuthUrl(returnTo, purpose, clientOrigin, linkTicketFor(req, purpose));
    res.redirect(url);
  } catch (err) {
    console.error("Google redirect error:", err);
    res.redirect(`${clientOrigin}/login?google=error&msg=${encodeURIComponent(err.message)}`);
  }
}

export async function handleGoogleCallback(req, res, store) {
  const host = req.headers.host || "";
  const defaultOrigin = host.includes("127.0.0.1") || host.includes("localhost")
    ? (host.includes("127.0.0.1") ? "http://127.0.0.1:5173" : "http://localhost:5173")
    : "https://triviallyonline.vercel.app";
  let returnTo = "/";
  let origin = defaultOrigin;
  try {
    const { code, state } = req.query;
    if (!code) throw new Error("Código de autenticación ausente");
    const { profile, returnTo: stateReturnTo, purpose, origin: originFromState, linkTicket } = await exchangeGoogleCode(code, state);
    if (stateReturnTo) returnTo = safePath(stateReturnTo);
    if (originFromState) {
      origin = originFromState.replace(/\/$/, "");
    } else {
      origin = (host.includes("localhost") || host.includes("127.0.0.1") ? defaultOrigin : process.env.CLIENT_ORIGIN || defaultOrigin).replace(/\/$/, "");
    }

    if (purpose === "link") {
      // Linking Google to existing account
      const userId = req.session?.userId || consumeTicket(linkTicket, "link");
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
      // The site finishes the login itself with POST /api/auth/google/finish, so the session cookie is set by a
      // plain same-site request on its own domain (phones drop cookies set on the other domain or mid-redirect).
      const ticket = createTicket(user.id, "login");
      const sep = returnTo.includes("?") ? "&" : "?";
      res.redirect(`${origin}${returnTo}${sep}google=ticket&ticket=${encodeURIComponent(ticket)}`);
    }
  } catch (err) {
    console.error("Google callback error:", err);
    res.redirect(`${origin}/login?google=error&msg=${encodeURIComponent(err.message)}`);
  }
}

// Second half of the Google login: runs on the site's own domain (Vercel rewrites /auth here) and opens the session.
export function handleGoogleFinish(req, res) {
  const returnTo = safePath(req.query.returnTo);
  const userId = consumeTicket(req.query.ticket, "login");
  if (!userId) {
    res.redirect(`/login?google=error&msg=${encodeURIComponent("El enlace de inicio de sesión expiró. Inténtalo otra vez.")}`);
    return;
  }
  req.session.userId = userId;
  res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}google=success`);
}
