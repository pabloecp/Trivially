import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { emitAck, getSocket } from "./socket.js";
import { BACKEND_URL } from "./config.js";

const AppContext = createContext(null);

export const AVATAR_COLORS = [
  "#1DB954", // Spotify Green
  "#10B981", // Emerald
  "#37352F", // Charcoal
  "#F59E0B", // Amber
  "#6366F1", // Indigo
  "#EC4899", // Rose
  "#06B6D4", // Cyan
];

function loadSavedUser() {
  try {
    const raw = localStorage.getItem("yoavlly-user") || localStorage.getItem("bysong-user");
    if (raw) return JSON.parse(raw);

    const guestName = localStorage.getItem("yoavlly_guest_name") || localStorage.getItem("bysong_guest_name");
    const guestId = localStorage.getItem("yoavlly_guest_id") || localStorage.getItem("bysong_guest_id") || `gst_${Math.random().toString(36).slice(2, 10)}`;
    if (guestName) {
      return { id: guestId, name: guestName, isGuest: true, avatar: AVATAR_COLORS[0] };
    }
    return null;
  } catch {
    return null;
  }
}

function persistUser(user) {
  if (user) {
    localStorage.setItem("yoavlly-user", JSON.stringify(user));
  } else {
    localStorage.removeItem("yoavlly-user");
    localStorage.removeItem("bysong-user");
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(loadSavedUser);
  const [catalog, setCatalog] = useState(null);
  const [room, setRoom] = useState(null);
  const [linkingStatus, setLinkingStatus] = useState(null);
  const [error, setError] = useState("");

  const refreshCatalog = useCallback(async () => {
    try {
      const data = await api("/api/catalog");
      setCatalog(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refreshCatalog();

    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get("google");
    const userIdParam = params.get("userId");
    const userDataParam = params.get("userData");

    let googleJustLoaded = false;

    if (googleStatus === "success") {
      let loadedUser = null;
      if (userDataParam) {
        try {
          loadedUser = JSON.parse(decodeURIComponent(userDataParam));
        } catch {}
      }

      if (loadedUser) {
        googleJustLoaded = true;
        persistUser(loadedUser);
        setUser(loadedUser);
        api("/api/session", { method: "POST", body: loadedUser }).catch(() => {});
      } else if (userIdParam) {
        googleJustLoaded = true;
        api(`/api/users/${userIdParam}`)
          .then((res) => {
            if (res.user) {
              persistUser(res.user);
              setUser(res.user);
            }
          })
          .catch(() => {});
      }

      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("google");
        url.searchParams.delete("userId");
        url.searchParams.delete("userData");
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ""));
      } catch {}
    }

    // Only fetch /api/me if we didn't just load from Google params
    // to avoid overwriting the freshly-loaded Google user with null
    if (!googleJustLoaded) {
      api("/api/me")
        .then((d) => {
          setLinkingStatus(d.linkingStatus || null);
          if (d.user) {
            persistUser(d.user);
            setUser(d.user);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const s = getSocket();
    const onState = (state) => setRoom(state);
    s.on("room:state", onState);
    return () => s.off("room:state", onState);
  }, []);

  const actions = useMemo(
    () => ({
      async saveGuest(name, avatar) {
        const cleanName = (name || "").trim();
        if (!cleanName) throw new Error("Por favor introduce un nombre");
        let guestId = localStorage.getItem("yoavlly_guest_id") || localStorage.getItem("bysong_guest_id");
        if (!guestId) {
          guestId = `gst_${Math.random().toString(36).slice(2, 10)}`;
        }
        localStorage.setItem("yoavlly_guest_id", guestId);
        localStorage.setItem("yoavlly_guest_name", cleanName);
        const guestObj = { id: guestId, name: cleanName, avatar: avatar || AVATAR_COLORS[0], isGuest: true };
        persistUser(guestObj);
        setUser(guestObj);
        try {
          await api("/api/session", { method: "POST", body: guestObj });
        } catch {}
        return guestObj;
      },

      async saveProfile(name, avatar) {
        const current = user || { id: `usr_${Math.random().toString(36).slice(2, 10)}`, avatar: AVATAR_COLORS[0] };
        const next = { ...current, name: (name || current.name || "").trim(), avatar: avatar || current.avatar || AVATAR_COLORS[0], isGuest: false };
        persistUser(next);
        setUser(next);
        await api("/api/session", { method: "POST", body: next });
        return next;
      },

      async updateUsername(newName) {
        if (!user) throw new Error("No autenticado");
        const clean = (newName || "").trim();
        if (!clean) throw new Error("Por favor introduce un nombre de usuario");
        const res = await api(`/api/users/${user.id}/name`, { method: "PATCH", body: { name: clean } });
        if (res.user) {
          localStorage.setItem("yoavlly_guest_name", res.user.name);
          persistUser(res.user);
          setUser(res.user);
        }
        return res.user;
      },

      async registerAccount({ name, email, password }) {
        const guestId = user?.isGuest ? user.id : localStorage.getItem("yoavlly_guest_id");
        const nextId = `usr_${Math.random().toString(36).slice(2, 10)}`;
        const res = await api("/api/auth/register", {
          method: "POST",
          body: { id: nextId, name, email, password, guestId, avatar: user?.avatar || AVATAR_COLORS[0] },
        });
        if (res.user) {
          localStorage.setItem("yoavlly_guest_name", res.user.name);
          localStorage.removeItem("yoavlly_guest_id");
          persistUser(res.user);
          setUser(res.user);
        }
        return res.user;
      },

      async loginAccount(identifier, password) {
        const guestId = user?.isGuest ? user.id : localStorage.getItem("yoavlly_guest_id");
        const res = await api("/api/auth/login", { method: "POST", body: { identifier, password, guestId } });
        if (res.user) {
          localStorage.setItem("yoavlly_guest_name", res.user.name);
          localStorage.removeItem("yoavlly_guest_id");
          persistUser(res.user);
          setUser(res.user);
        }
        return res.user;
      },

      async loginWithGoogle(returnTo = "/play") {
        const origin = window.location.origin;
        try {
          const { url } = await api(`/api/google/login?returnTo=${encodeURIComponent(returnTo)}&purpose=login&origin=${encodeURIComponent(origin)}`);
          if (url) {
            window.location.href = url;
            return;
          }
        } catch (e) {
          console.warn("API google login failed, falling back to direct auth redirect", e);
        }
        window.location.href = `${BACKEND_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}&purpose=login&origin=${encodeURIComponent(origin)}`;
      },

      async linkGoogle(returnTo = "/profile") {
        const origin = window.location.origin;
        try {
          const { url } = await api(`/api/google/login?returnTo=${encodeURIComponent(returnTo)}&purpose=link&origin=${encodeURIComponent(origin)}`);
          if (url) {
            window.location.href = url;
            return;
          }
        } catch (e) {
          console.warn("API google link failed, falling back to direct auth redirect", e);
        }
        window.location.href = `${BACKEND_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}&purpose=link&origin=${encodeURIComponent(origin)}`;
      },

      async unlinkGoogle() {
        const res = await api("/api/auth/unlink-google", { method: "POST" });
        if (res.user) {
          persistUser(res.user);
          setUser(res.user);
          setLinkingStatus((prev) => ({ ...prev, googleLinked: false }));
        }
        return res.user;
      },

      async deleteAccount(confirmName) {
        await api("/api/auth/delete-account", { method: "DELETE", body: { confirmName } });
        persistUser(null);
        localStorage.removeItem("yoavlly_guest_name");
        localStorage.removeItem("yoavlly_guest_id");
        setUser(null);
        setLinkingStatus(null);
      },

      async updatePlayer(data) {
        if (!user) return;
        const next = { ...user, ...data };
        persistUser(next);
        setUser(next);
        const res = await emitAck("player:update", data);
        if (res?.state) setRoom(res.state);
        return next;
      },

      async createRoom(mode, config, explicitUser) {
        setRoom(null);
        let u = explicitUser || user || loadSavedUser();
        if (!u) {
          const autoName = `Jugador${Math.floor(100 + Math.random() * 900)}`;
          u = await actions.saveGuest(autoName);
        }
        const res = await emitAck("room:create", { user: u, mode, config });
        if (!res.ok) throw new Error(res.error);
        setRoom(res.state);
        return res.state;
      },

      async joinRoom(code, explicitUser) {
        setRoom(null);
        let u = explicitUser || user || loadSavedUser();
        if (!u) {
          const autoName = `Jugador${Math.floor(100 + Math.random() * 900)}`;
          u = await actions.saveGuest(autoName);
        }
        const res = await emitAck("room:join", { user: u, code: code.toUpperCase() });
        if (!res.ok) throw new Error(res.error);
        setRoom(res.state);
        return res.state;
      },

      async updateConfig(config) {
        const res = await emitAck("room:config", config);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      async toggleConfigPermission(targetUserId) {
        const res = await emitAck("room:toggleConfigPermission", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
        return res;
      },

      async setReady(ready) { await emitAck("room:ready", ready); },
      async startGame() { const res = await emitAck("room:start"); if (!res.ok) throw new Error(res.error); },
      async restartGame() { const res = await emitAck("room:restart"); if (!res.ok) throw new Error(res.error); },
      async endGame() { await emitAck("room:end"); },

      async answer(answerTextOrId) {
        const res = await emitAck("game:answer", answerTextOrId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      leaveRoom() {
        setRoom(null);
        emitAck("room:leave").catch(() => {});
      },

      async logout() {
        try { await api("/api/auth/logout", { method: "POST" }); } catch {}
        persistUser(null);
        localStorage.removeItem("yoavlly_guest_name");
        localStorage.removeItem("yoavlly_guest_id");
        setUser(null);
        setLinkingStatus(null);
      },
    }),
    [user]
  );

  // spotify prop provided as safe inert object for any backward compat
  const spotify = useMemo(() => ({ configured: false, connected: false }), []);

  return (
    <AppContext.Provider value={{ user, catalog, refreshCatalog, room, setRoom, spotify, linkingStatus, error, setError, ...actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }

export function remainingMs(room) {
  if (!room?.phaseEndsAt) return 0;
  const skew = Date.now() - (room.serverNow || Date.now());
  return Math.max(0, room.phaseEndsAt - (Date.now() - skew));
}
