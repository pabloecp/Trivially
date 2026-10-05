import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, setAuthToken } from "./api.js";
import { emitAck, getSocket, reconnectSocket, setSocketTokenProvider } from "./socket.js";
import { BACKEND_URL } from "./config.js";

const AppContext = createContext(null);

// The first one is the default. The profile adds an eighth option: the Google photo.
export const AVATAR_COLORS = [
  "#FF2D55", // Rojo
  "#FF8A00", // Naranja
  "#2BD94F", // Verde
  "#0A9BFF", // Azul
  "#A63DFF", // Violeta
];

// Per-tab, so a reload puts you back in the same room.
const ROOM_KEY = "trivially_room";

// The saved identity. These keys used the project's old name (YOAVLLY) until they were renamed; the values saved
// under the old keys are moved over once, on load, so nobody loses their guest id or account.
const USER_KEY = "trivially_user";
export const GUEST_NAME_KEY = "trivially_guest_name";
const GUEST_ID_KEY = "trivially_guest_id";
const OLD_KEYS = { "yoavlly-user": USER_KEY, yoavlly_guest_name: GUEST_NAME_KEY, yoavlly_guest_id: GUEST_ID_KEY };

try {
  for (const [oldKey, newKey] of Object.entries(OLD_KEYS)) {
    const value = localStorage.getItem(oldKey);
    if (value === null) continue;
    if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, value);
    localStorage.removeItem(oldKey);
  }
} catch {
  // No storage (private mode): nothing to move.
}

function loadSavedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);

    const guestName = localStorage.getItem(GUEST_NAME_KEY);
    const guestId = localStorage.getItem(GUEST_ID_KEY) || `gst_${Math.random().toString(36).slice(2, 10)}`;
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
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
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
  // Set when the host takes us out of the room; Home shows it once and clears it.
  const [kickedNotice, setKickedNotice] = useState("");

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

  // Signing out (or deleting the account/guest) also leaves the room, so nobody stays seated as a ghost.
  function forgetUser() {
    if (roomCodeRef.current) emitAck("room:leave").catch(() => {});
    clearRoom();
    setAuthToken(null);
    applyUser(null);
    localStorage.removeItem(GUEST_NAME_KEY);
    localStorage.removeItem(GUEST_ID_KEY);
    setLinkingStatus(null);
    reconnectSocket();
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

  // A guest's id can be swapped by the server (see /api/session); keep localStorage in step.
  function adoptUser(next) {
    if (next?.isGuest) localStorage.setItem(GUEST_ID_KEY, next.id);
    applyUser(next);
  }

  // Resolves once a Google login coming back in the URL has been finished, so the socket (and its guest
  // fallback) never runs in the middle of it.
  const googleDone = useRef(null);
  if (!googleDone.current) {
    let resolve;
    googleDone.current = { promise: new Promise((r) => (resolve = r)), resolve };
  }

  // Makes sure the server session is ours, then returns the signed token the socket connects with.
  useEffect(() => {
    setSocketTokenProvider(async () => {
      await googleDone.current.promise;
      let res = await api("/api/socket-token").catch(() => null);
      const current = userRef.current;
      // Only start a guest session when the server has none; never replace one (e.g. a Google login in progress).
      if (current?.isGuest && current.name && res && !res.userId) {
        const s = await api("/api/session", { method: "POST", body: current }).catch(() => null);
        if (s?.user && s.user.id !== current.id) adoptUser({ ...current, id: s.user.id });
        res = await api("/api/socket-token").catch(() => null);
      }
      return res?.token || null;
    });
  }, []);

  function googleFailed(msg) {
    window.location.replace(`/login?google=error&msg=${encodeURIComponent(msg)}`);
  }

  useEffect(() => {
    refreshCatalog();

    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get("google");

    let googleJustLoaded = false;

    if (googleStatus === "ticket" || googleStatus === "success") {
      // Back from Google: trade the one-time ticket for our session (a normal request, so the cookie sticks
      // on every browser), then ask the server who we are.
      googleJustLoaded = true;
      const ticket = params.get("ticket");
      (ticket ? api("/api/auth/google/finish", { method: "POST", body: { ticket } }) : Promise.resolve())
        .then(() => api("/api/me"))
        .then((d) => {
          setLinkingStatus(d.linkingStatus || null);
          if (d.user && !d.user.isGuest) {
            applyUser(d.user);
            localStorage.removeItem(GUEST_ID_KEY);
            reconnectSocket();
          } else {
            googleFailed("tu navegador no guardó la sesión. Permite cookies para este sitio e inténtalo otra vez.");
          }
        })
        .catch((e) => googleFailed(e.message || "no hubo respuesta del servidor. Inténtalo otra vez."))
        .finally(() => googleDone.current.resolve());

      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("google");
        url.searchParams.delete("ticket");
        url.searchParams.delete("userId");
        url.searchParams.delete("userData");
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ""));
      } catch {}
    }

    if (!googleJustLoaded) googleDone.current.resolve();

    // Only fetch /api/me if we didn't just load from Google params
    // to avoid overwriting the freshly-loaded Google user with null
    if (!googleJustLoaded) {
      api("/api/me")
        .then((d) => {
          setLinkingStatus(d.linkingStatus || null);
          if (d.user) applyUser(d.user);
          // The server session expired: a saved registered account can't be used anymore without signing in.
          else if (userRef.current && !userRef.current.isGuest) applyUser(null);
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
    const onKicked = ({ code } = {}) => {
      if (code !== roomCodeRef.current) return;
      clearRoom();
      setKickedNotice("El anfitrión te sacó de la sala");
    };
    s.on("room:state", onState);
    s.on("room:kicked", onKicked);
    s.on("connect", rejoin);
    if (s.connected) rejoin();
    return () => {
      s.off("room:state", onState);
      s.off("room:kicked", onKicked);
      s.off("connect", rejoin);
    };
  }, []);

  const actions = useMemo(
    () => ({
      async saveGuest(name, avatar) {
        const cleanName = (name || "").trim();
        if (!cleanName) throw new Error("Por favor introduce un nombre");
        let guestId = localStorage.getItem(GUEST_ID_KEY);
        if (!guestId) {
          guestId = `gst_${Math.random().toString(36).slice(2, 10)}`;
        }
        localStorage.setItem(GUEST_ID_KEY, guestId);
        localStorage.setItem(GUEST_NAME_KEY, cleanName);
        const guestObj = { id: guestId, name: cleanName, avatar: avatar || AVATAR_COLORS[0], isGuest: true };
        applyUser(guestObj);
        let saved = guestObj;
        try {
          const res = await api("/api/session", { method: "POST", body: guestObj });
          if (res.user && res.user.id !== guestId) {
            saved = { ...guestObj, id: res.user.id };
            adoptUser(saved);
          }
        } catch {}
        reconnectSocket();
        return saved;
      },

      async updateUsername(newName) {
        const current = userRef.current;
        if (!current) throw new Error("No autenticado");
        const clean = (newName || "").trim();
        if (!clean) throw new Error("Por favor introduce un nombre de usuario");
        const res = await api(`/api/users/${current.id}/name`, { method: "PATCH", body: { name: clean } });
        if (res.user) {
          localStorage.setItem(GUEST_NAME_KEY, res.user.name);
          applyUser(res.user);
        }
        return res.user;
      },

      async registerAccount({ name, email, password }) {
        const current = userRef.current;
        const guestId = current?.isGuest ? current.id : localStorage.getItem(GUEST_ID_KEY);
        const nextId = `usr_${Math.random().toString(36).slice(2, 10)}`;
        const res = await api("/api/auth/register", {
          method: "POST",
          body: { id: nextId, name, email, password, guestId, avatar: current?.avatar || AVATAR_COLORS[0] },
        });
        if (res.user) {
          localStorage.setItem(GUEST_NAME_KEY, res.user.name);
          localStorage.removeItem(GUEST_ID_KEY);
          applyUser(res.user);
          reconnectSocket();
        }
        return res.user;
      },

      async loginAccount(identifier, password) {
        const current = userRef.current;
        const guestId = current?.isGuest ? current.id : localStorage.getItem(GUEST_ID_KEY);
        const res = await api("/api/auth/login", { method: "POST", body: { identifier, password, guestId } });
        if (res.user) {
          localStorage.setItem(GUEST_NAME_KEY, res.user.name);
          localStorage.removeItem(GUEST_ID_KEY);
          applyUser(res.user);
          reconnectSocket();
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

      // Owners only: sends the browser to Spotify, which comes back to /profile?spotify=linked (or =error).
      async connectSpotify() {
        const { url } = await api("/api/spotify/login");
        if (url) window.location.href = url;
      },


      async deleteAccount(confirmName) {
        await api("/api/auth/delete-account", { method: "DELETE", body: { confirmName } });
        forgetUser();
      },

      // `choice` is a color from AVATAR_COLORS or "google" for the Google photo. Saved on the server
      // (guests and accounts alike) and in the current room.
      async updateAvatar(choice) {
        const current = userRef.current;
        if (!current) throw new Error("No autenticado");
        const res = await api(`/api/users/${current.id}/avatar`, { method: "PATCH", body: { avatar: choice } });
        const avatar = res.user?.avatar || choice;
        applyUser({ ...current, ...(res.user || {}), avatar });
        if (roomCodeRef.current) {
          const ack = await emitAck("player:update", { avatar });
          if (ack?.state) setRoom(ack.state);
        }
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

      // Owners: their Spotify playlists, to add one to the room (the server reads it and loads its songs).
      async listSpotifyPlaylists() {
        const res = await api("/api/spotify/playlists");
        return res.playlists || [];
      },

      async addSpotifyPlaylist(playlistId) {
        const res = await emitAck("room:spotifyPlaylist", playlistId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      async toggleConfigPermission(targetUserId) {
        const res = await emitAck("room:toggleConfigPermission", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
        return res;
      },

      async kickPlayer(targetUserId) {
        const res = await emitAck("room:kick", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
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

      // "Saltar": give up on the current round.
      async skipSong() {
        const res = await emitAck("game:skip");
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      leaveRoom() {
        emitAck("room:leave").catch(() => {});
        clearRoom();
      },

      async logout() {
        try { await api("/api/auth/logout", { method: "POST" }); } catch {}
        forgetUser();
      },
    }),
    []
  );

  // spotify prop provided as safe inert object for any backward compat
  const spotify = useMemo(() => ({ configured: false, connected: false }), []);

  return (
    <AppContext.Provider value={{ user, catalog, refreshCatalog, room, setRoom, kickedNotice, setKickedNotice, spotify, linkingStatus, error, setError, ...actions }}>
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
