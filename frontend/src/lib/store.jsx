import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { emitAck, getSocket } from "./socket.js";
import { BACKEND_URL } from "./config.js";

const AppContext = createContext(null);

export const AVATAR_COLORS = [
  "#33A8C7", // Turquoise Surf
  "#52E3E1", // Neon Ice
  "#A0E426", // Slime Lime
  "#FFAB00", // Orange
  "#F77976", // Grapefruit Pink
  "#F050AE", // Deep Pink
  "#D883FF", // Mauve Magic
  "#9336FD", // Purple
];

// Per-tab, so a reload puts you back in the same room.
const ROOM_KEY = "trivially_room";

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

function loadSavedRoomCode() {
  try {
    return sessionStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}

function saveRoomCode(code) {
  try {
    if (code) sessionStorage.setItem(ROOM_KEY, code);
    else sessionStorage.removeItem(ROOM_KEY);
  } catch {}
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(loadSavedUser);
  const [catalog, setCatalog] = useState(null);
  const [room, setRoom] = useState(null);
  const [linkingStatus, setLinkingStatus] = useState(null);
  const [error, setError] = useState("");

  // Actions read these refs instead of closing over state, so e.g. saveGuest() followed by joinRoom() sees the new user.
  const userRef = useRef(user);
  userRef.current = user;
  const roomCodeRef = useRef(loadSavedRoomCode());

  function applyUser(next) {
    userRef.current = next;
    persistUser(next);
    setUser(next);
  }

  function enterRoom(state) {
    roomCodeRef.current = state.code;
    saveRoomCode(state.code);
    setRoom(state);
    return state;
  }

  function clearRoom() {
    roomCodeRef.current = null;
    saveRoomCode(null);
    setRoom(null);
  }

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
        applyUser(loadedUser);
        api("/api/session", { method: "POST", body: loadedUser }).catch(() => {});
      } else if (userIdParam) {
        googleJustLoaded = true;
        api(`/api/users/${userIdParam}`)
          .then((res) => {
            if (res.user) applyUser(res.user);
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
          if (d.user) applyUser(d.user);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const s = getSocket();
    const onState = (state) => {
      // A broadcast for a room we already left can still be in flight.
      if (state?.code === roomCodeRef.current) setRoom(state);
    };
    // Re-enter our room after a reload or a dropped connection; the server holds the seat for a few seconds.
    const rejoin = async () => {
      const code = roomCodeRef.current;
      const current = userRef.current;
      if (!code || !current?.name) return;
      const res = await emitAck("room:join", { user: current, code });
      if (roomCodeRef.current !== code) return;
      if (res.ok) setRoom(res.state);
      else clearRoom();
    };
    s.on("room:state", onState);
    s.on("connect", rejoin);
    if (s.connected) rejoin();
    return () => {
      s.off("room:state", onState);
      s.off("connect", rejoin);
    };
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
        applyUser(guestObj);
        try {
          await api("/api/session", { method: "POST", body: guestObj });
        } catch {}
        return guestObj;
      },

      async saveProfile(name, avatar) {
        const current = userRef.current || { id: `usr_${Math.random().toString(36).slice(2, 10)}`, avatar: AVATAR_COLORS[0] };
        const next = { ...current, name: (name || current.name || "").trim(), avatar: avatar || current.avatar || AVATAR_COLORS[0], isGuest: false };
        applyUser(next);
        await api("/api/session", { method: "POST", body: next });
        return next;
      },

      async updateUsername(newName) {
        const current = userRef.current;
        if (!current) throw new Error("No autenticado");
        const clean = (newName || "").trim();
        if (!clean) throw new Error("Por favor introduce un nombre de usuario");
        const res = await api(`/api/users/${current.id}/name`, { method: "PATCH", body: { name: clean } });
        if (res.user) {
          localStorage.setItem("yoavlly_guest_name", res.user.name);
          applyUser(res.user);
        }
        return res.user;
      },

      async registerAccount({ name, email, password }) {
        const current = userRef.current;
        const guestId = current?.isGuest ? current.id : localStorage.getItem("yoavlly_guest_id");
        const nextId = `usr_${Math.random().toString(36).slice(2, 10)}`;
        const res = await api("/api/auth/register", {
          method: "POST",
          body: { id: nextId, name, email, password, guestId, avatar: current?.avatar || AVATAR_COLORS[0] },
        });
        if (res.user) {
          localStorage.setItem("yoavlly_guest_name", res.user.name);
          localStorage.removeItem("yoavlly_guest_id");
          applyUser(res.user);
        }
        return res.user;
      },

      async loginAccount(identifier, password) {
        const current = userRef.current;
        const guestId = current?.isGuest ? current.id : localStorage.getItem("yoavlly_guest_id");
        const res = await api("/api/auth/login", { method: "POST", body: { identifier, password, guestId } });
        if (res.user) {
          localStorage.setItem("yoavlly_guest_name", res.user.name);
          localStorage.removeItem("yoavlly_guest_id");
          applyUser(res.user);
        }
        return res.user;
      },

      async loginWithGoogle(returnTo = "/") {
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
          applyUser(res.user);
          setLinkingStatus((prev) => ({ ...prev, googleLinked: false }));
        }
        return res.user;
      },

      async deleteAccount(confirmName) {
        await api("/api/auth/delete-account", { method: "DELETE", body: { confirmName } });
        applyUser(null);
        localStorage.removeItem("yoavlly_guest_name");
        localStorage.removeItem("yoavlly_guest_id");
        setLinkingStatus(null);
      },

      async updatePlayer(data) {
        const current = userRef.current;
        if (!current) return;
        const next = { ...current, ...data };
        applyUser(next);
        const res = await emitAck("player:update", data);
        if (res?.state) setRoom(res.state);
        return next;
      },

      // `game` is where the room starts: null for the Home screen, or a game id such as "musica".
      // `explicitUser` is for callers that just created the user and want to be sure it's the one sent.
      async createRoom(mode, config, game = "musica", explicitUser) {
        const current = explicitUser || userRef.current;
        if (!current?.name) throw new Error("Debes identificarte antes de crear una sala");
        const res = await emitAck("room:create", { user: current, mode, config, game });
        if (!res.ok) throw new Error(res.error);
        return enterRoom(res.state);
      },

      async joinRoom(code, explicitUser) {
        const current = explicitUser || userRef.current;
        if (!current?.name) throw new Error("Debes identificarte antes de unirte");
        const res = await emitAck("room:join", { user: current, code: code.toUpperCase() });
        if (!res.ok) throw new Error(res.error);
        return enterRoom(res.state);
      },

      // Host only: moves every player in the room into `game` (null = back to the Home screen).
      async setGame(game) {
        const res = await emitAck("room:setGame", game ?? null);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
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
        emitAck("room:leave").catch(() => {});
        clearRoom();
      },

      async logout() {
        try { await api("/api/auth/logout", { method: "POST" }); } catch {}
        applyUser(null);
        localStorage.removeItem("yoavlly_guest_name");
        localStorage.removeItem("yoavlly_guest_id");
        setLinkingStatus(null);
      },
    }),
    []
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
