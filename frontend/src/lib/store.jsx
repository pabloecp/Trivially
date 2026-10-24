import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, setAuthToken } from "./api.js";
import { emitAck, emitAckWithin, getSocket, reconnectSocket, setSocketTokenProvider } from "./socket.js";
import { BACKEND_URL } from "./config.js";
import { getForcedGames, getOwnerView } from "./ownerView.js";

const AppContext = createContext(null);

// The first one is the default. The profile adds an eighth option: the Google photo.
export const AVATAR_COLORS = [
  "#FF2D55", // Rojo
  "#FF8A00", // Naranja
  "#2BD94F", // Verde
  "#0A9BFF", // Azul
  "#A63DFF", // Violeta
  "#FF5FB8", // Rosado
];

// Per-tab, so a reload puts you back in the same room, and as what: a player, or the room's central device
// ("central": the screen that only shows the match).
const ROOM_KEY = "trivially_room";
const ROLE_KEY = "trivially_room_role";

// The saved identity. These keys used the project's old name (YOAVLLY) until they were renamed; the values saved
// under the old keys are moved over once, on load, so nobody loses their guest id or account.
const USER_KEY = "trivially_user";
export const GUEST_NAME_KEY = "trivially_guest_name";
const GUEST_ID_KEY = "trivially_guest_id";
const GUEST_AVATAR_KEY = "trivially_guest_avatar";
// A guest is only signed in for the tab where they wrote their name (sessionStorage, so a reload keeps it). A new
// visit starts without a user: the name and colour stay on the device only to fill in the name box again.
const GUEST_ACTIVE_KEY = "trivially_guest_active";
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

function guestActive() {
  try {
    return sessionStorage.getItem(GUEST_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

function setGuestActive(on) {
  try {
    if (on) sessionStorage.setItem(GUEST_ACTIVE_KEY, "1");
    else sessionStorage.removeItem(GUEST_ACTIVE_KEY);
  } catch {}
}

/** The name and colour a guest used last time on this device, to fill in the name box ({ name: "" } if none). */
export function savedGuest() {
  try {
    const name = localStorage.getItem(GUEST_NAME_KEY) || "";
    const avatar = localStorage.getItem(GUEST_AVATAR_KEY);
    return { name, avatar: AVATAR_COLORS.includes(avatar) ? avatar : AVATAR_COLORS[0] };
  } catch {
    return { name: "", avatar: AVATAR_COLORS[0] };
  }
}

function loadSavedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    // An account stays signed in; a guest only in the tab where they wrote their name.
    if (saved && !saved.isGuest) return saved;
    if (!guestActive()) return null;
    if (saved) return saved;
    const guestName = localStorage.getItem(GUEST_NAME_KEY);
    const guestId = localStorage.getItem(GUEST_ID_KEY) || `gst_${Math.random().toString(36).slice(2, 10)}`;
    return guestName ? { id: guestId, name: guestName, isGuest: true, avatar: savedGuest().avatar } : null;
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

function loadSavedRole() {
  try {
    return sessionStorage.getItem(ROLE_KEY) === "central" ? "central" : "player";
  } catch {
    return "player";
  }
}

function saveRole(role) {
  try {
    if (role === "central") sessionStorage.setItem(ROLE_KEY, role);
    else sessionStorage.removeItem(ROLE_KEY);
  } catch {}
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(loadSavedUser);
  const [catalog, setCatalog] = useState(null);
  const [room, setRoomState] = useState(null);
  // Every snapshot is stamped, on arrival, with how far the server's clock is from ours (see remainingMs).
  const setRoom = useCallback(
    (state) => setRoomState(state ? { ...state, clockOffset: (state.serverNow || Date.now()) - Date.now() } : state),
    []
  );
  const [linkingStatus, setLinkingStatus] = useState(null);
  const [error, setError] = useState("");
  // Set when the host takes us out of the room; Home shows it once and clears it.
  const [kickedNotice, setKickedNotice] = useState("");
  // What this device is in its room: "player", or "central" (the room's central device: it only shows the match).
  const [role, setRoleState] = useState(loadSavedRole);
  const roleRef = useRef(role);
  // Joining a room this account already plays in from another device: this one can be the room's central device
  // instead (CentralOffer). { code, isHost, hostName, status: "offer" | "sending" | "waiting" | "denied", error }.
  const [centralOffer, setCentralOfferState] = useState(null);
  const offerRef = useRef(null);
  function setCentralOffer(next) {
    offerRef.current = next;
    setCentralOfferState(next);
  }
  // "Volver" out of the room asks first (useRoomExit): true while the modal "¿Seguro que quieres salir?" is open. It
  // lives here because the top bar, the phones' room bar and the browser's Back button all open it.
  const [leaveAsk, setLeaveAsk] = useState(false);
  useEffect(() => {
    if (!room) setLeaveAsk(false);
  }, [room]);

  // Actions read these refs instead of closing over state, so e.g. saveGuest() followed by joinRoom() sees the new user.
  const userRef = useRef(user);
  // The game the host last pointed at on the menu, so hovering the same tile again sends nothing.
  const previewRef = useRef(null);
  userRef.current = user;
  const roomCodeRef = useRef(loadSavedRoomCode());

  function applyUser(next) {
    userRef.current = next;
    persistUser(next);
    setUser(next);
  }

  function applyRole(next) {
    roleRef.current = next;
    saveRole(next);
    setRoleState(next);
  }

  function enterRoom(state, nextRole = "player") {
    roomCodeRef.current = state.code;
    saveRoomCode(state.code);
    applyRole(nextRole);
    setRoom(state);
    return state;
  }

  function clearRoom() {
    roomCodeRef.current = null;
    saveRoomCode(null);
    applyRole("player");
    setRoom(null);
  }

  // A room this account already plays in from another device: instead of joining, offer to make this device the
  // room's central device. The error that comes with it is marked (`offer`), so whoever was joining stays quiet:
  // CentralOffer says it.
  function offerCentral(code, res) {
    setCentralOffer({ code, isHost: Boolean(res.isHost), hostName: res.hostName || "el anfitrión", status: "offer", error: "" });
    const err = new Error(res.error);
    err.offer = true;
    return err;
  }

  // Signing out (or deleting the account/guest) also leaves the room, so nobody stays seated as a ghost.
  function forgetUser() {
    if (roomCodeRef.current) emitAck("room:leave").catch(() => {});
    clearRoom();
    setAuthToken(null);
    applyUser(null);
    setGuestActive(false);
    localStorage.removeItem(GUEST_NAME_KEY);
    localStorage.removeItem(GUEST_ID_KEY);
    localStorage.removeItem(GUEST_AVATAR_KEY);
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
          // A guest from an earlier visit isn't signed in again: they write (or confirm) their name first.
          if (d.user && !(d.user.isGuest && !guestActive())) applyUser(d.user);
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
    // Re-enter our room after a reload or a dropped connection; the server holds the seat (or the central device's
    // place) for a few seconds.
    const rejoin = async () => {
      // A request to be a room's central device dies with the connection: it has to be asked again.
      const offer = offerRef.current;
      if (offer?.status === "waiting") setCentralOffer({ ...offer, status: "offer", error: "Se cortó la conexión. Pídelo otra vez." });
      const code = roomCodeRef.current;
      const current = userRef.current;
      if (!code || !current?.name) return;
      const central = roleRef.current === "central";
      const res = await emitAck("room:join", { user: current, code, central });
      if (roomCodeRef.current !== code) return;
      if (res.ok) enterRoom(res.state, res.role || "player");
      else {
        clearRoom();
        // The same account plays in this room from another device: this one can be its central device instead.
        if (res.sameRoom) offerCentral(code, res);
        // Same account already in a room from another tab or device, or no longer the central device: say why.
        else if (res.busy || central) setKickedNotice(res.error);
      }
    };
    // The server moved this connection: it became the room's central device (the host dragged this player onto the
    // spot, or accepted this device's request), plays again, or is out of the room (taken off the spot, turned down,
    // the room closed).
    const onRole = ({ code, role: next, notice, state } = {}) => {
      const offer = offerRef.current;
      if (offer?.code === code && (offer.status === "waiting" || offer.status === "sending")) {
        if (next === "central" && state) {
          setCentralOffer(null);
          enterRoom(state, "central");
        } else if (!next) {
          setCentralOffer({ ...offer, status: "denied", error: notice || "" });
        }
        return;
      }
      if (code !== roomCodeRef.current) return;
      if (next && state) enterRoom(state, next);
      else if (next) applyRole(next);
      else {
        clearRoom();
        if (notice) setKickedNotice(notice);
      }
      if (next && notice) setKickedNotice(notice);
    };
    // The server asks whether this tab is alive when the same account tries to enter a room from somewhere else.
    const onPing = (ack) => ack?.();
    const onKicked = ({ code, blocked, reason } = {}) => {
      if (code !== roomCodeRef.current) return;
      clearRoom();
      setKickedNotice(
        reason === "inactivo"
          ? "Saliste de la partida por inactividad"
          : blocked
          ? "El anfitrión te bloqueó de la sala"
          : "El anfitrión te sacó de la sala. Puedes volver con el código"
      );
    };
    s.on("room:state", onState);
    s.on("room:kicked", onKicked);
    s.on("room:role", onRole);
    s.on("room:ping", onPing);
    s.on("connect", rejoin);
    if (s.connected) rejoin();
    return () => {
      s.off("room:state", onState);
      s.off("room:kicked", onKicked);
      s.off("room:role", onRole);
      s.off("room:ping", onPing);
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
        const guestObj = { id: guestId, name: cleanName, avatar: avatar || AVATAR_COLORS[0], isGuest: true };
        // The server refuses a name with a link (the Jugar sheet shows why); any other failure (offline) is ignored,
        // and the guest plays with what they wrote.
        let res = null;
        try {
          res = await api("/api/session", { method: "POST", body: guestObj });
        } catch (err) {
          if (/enlaces/.test(err.message)) throw err;
        }
        localStorage.setItem(GUEST_ID_KEY, guestId);
        localStorage.setItem(GUEST_NAME_KEY, cleanName);
        localStorage.setItem(GUEST_AVATAR_KEY, avatar || AVATAR_COLORS[0]);
        setGuestActive(true);
        applyUser(guestObj);
        let saved = guestObj;
        if (res?.user && res.user.id !== guestId) {
          saved = { ...guestObj, id: res.user.id };
          adoptUser(saved);
        }
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

      // The signed-in account as the server has it now: its stats, history and rank change with every match, and this
      // page only loads them once (the /jugar page asks again when it opens).
      async refreshUser() {
        const current = userRef.current;
        if (!current || current.isGuest) return;
        const d = await api("/api/me");
        if (d.user && !d.user.isGuest && d.user.id === userRef.current?.id) applyUser(d.user);
      },

      // The account's @username (unique; a few changes a month). The name for the games is updateUsername above.
      async changeHandle(username) {
        const res = await api("/api/me/username", { method: "PATCH", body: { username } });
        if (res.user) applyUser(res.user);
        return res.user;
      },

      async registerAccount({ name, username, email, password }) {
        const current = userRef.current;
        const guestId = current?.isGuest ? current.id : localStorage.getItem(GUEST_ID_KEY);
        const nextId = `usr_${Math.random().toString(36).slice(2, 10)}`;
        const res = await api("/api/auth/register", {
          method: "POST",
          body: { id: nextId, name, username, email, password, guestId, avatar: current?.avatar || AVATAR_COLORS[0] },
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

      async unlinkSpotify() {
        const res = await api("/api/spotify/unlink", { method: "POST" });
        if (res.user) applyUser(res.user);
        return res.user;
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

      // "Casual" (Competitivo is disabled for now): into a public room of that kind, which starts by itself once it's
      // full; every match is two games (and a third when they end one each). `size` is how many players it needs (2:
      // "Duelo", or 5). Also "Buscar otra partida" at the end of one (the server leaves the old room first).
      async findMatch(kind, size = 5, explicitUser) {
        const current = explicitUser || userRef.current;
        if (!current?.name) throw new Error("Debes identificarte antes de buscar partida");
        // An owner in debug view can force the games of its match (the admin panel); the server checks the account.
        const force = current.role === "owner" && getOwnerView() === "debug" ? getForcedGames() : [];
        const res = await emitAck("match:find", { user: current, kind, size, ...(force.length ? { force } : {}) });
        if (!res.ok) throw new Error(res.error);
        return enterRoom(res.state);
      },

      // Whether a code opens a room, before asking for a name. An older server that doesn't know the check lets it
      // through, and the join itself says what's wrong.
      async checkRoom(code) {
        const res = await emitAckWithin(6000, "room:check", code.toUpperCase());
        if (!res.ok && res.error !== "El servidor no respondió. Inténtalo otra vez.") throw new Error(res.error);
      },

      // Also coming back to the room after a reload, as what this tab was in it (a player or its central device).
      // An error with `offer` means this account already plays in that room from another device: CentralOffer asks
      // whether to make this one its central device, so the caller shouldn't show the error itself.
      async joinRoom(code, explicitUser) {
        const current = explicitUser || userRef.current;
        if (!current?.name) throw new Error("Debes identificarte antes de unirte");
        const upper = code.toUpperCase();
        const central = roleRef.current === "central" && roomCodeRef.current === upper;
        const res = await emitAck("room:join", { user: current, code: upper, central });
        if (!res.ok) throw res.sameRoom ? offerCentral(upper, res) : new Error(res.error);
        return enterRoom(res.state, res.role || "player");
      },

      // CentralOffer, for the host: this device becomes the room's central device straight away.
      async joinAsCentral() {
        const offer = offerRef.current;
        if (!offer) return;
        setCentralOffer({ ...offer, status: "sending", error: "" });
        const res = await emitAck("room:joinCentral", { user: userRef.current, code: offer.code });
        if (!res.ok) {
          setCentralOffer({ ...offer, status: "offer", error: res.error || "No se pudo entrar como dispositivo central" });
          return;
        }
        setCentralOffer(null);
        enterRoom(res.state, "central");
      },

      // CentralOffer, for anyone else: asks the host, and waits for the answer ("room:role").
      async requestCentral() {
        const offer = offerRef.current;
        if (!offer) return;
        setCentralOffer({ ...offer, status: "sending", error: "" });
        const res = await emitAck("room:requestCentral", { user: userRef.current, code: offer.code });
        if (offerRef.current?.code !== offer.code || offerRef.current.status !== "sending") return;
        if (!res.ok) setCentralOffer({ ...offer, status: "offer", error: res.error || "No se pudo enviar la solicitud" });
        else setCentralOffer({ ...offer, status: "waiting", error: "" });
      },

      // Closes CentralOffer, taking back the request if one was waiting.
      dismissCentralOffer() {
        if (offerRef.current?.status === "waiting" || offerRef.current?.status === "sending") {
          emitAck("room:cancelCentralRequest").catch(() => {});
        }
        setCentralOffer(null);
      },

      // Host only: the player dropped onto the "Dispositivo central" spot; that player's device becomes the central one.
      async makeCentral(targetUserId) {
        const res = await emitAck("room:makeCentral", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
        return res;
      },

      // Host only: the room goes back to everyone playing on their own screen.
      async removeCentral() {
        const res = await emitAck("room:removeCentral");
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Host only: accepts or turns down a player's request to use another device of theirs as the central one.
      async answerCentralRequest(id, accept) {
        const res = await emitAck("room:centralAnswer", { id, accept });
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
        return res;
      },

      // Host only: moves every player in the room into `game` (null = back to the Home screen).
      async setGame(game) {
        previewRef.current = null;
        const res = await emitAck("room:setGame", game ?? null);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Host only: lets everyone see which game on the menu the host is pointing at (null = none). Best effort.
      previewGame(game) {
        const next = game ?? null;
        if (next === previewRef.current) return Promise.resolve();
        previewRef.current = next;
        return emitAck("room:preview", next).catch(() => {});
      },

      // A message to the room's chat (the server refuses it while a round is played, or too soon after the last one).
      async sendChat(text) {
        const res = await emitAck("room:chat", text);
        if (!res.ok) throw new Error(res.error);
      },

      // Any player but the host: suggests a game to the host (allowed once every 5 s; the error says how long to wait).
      async suggestGame(game) {
        // An older server doesn't know this event and never answers: don't leave the player waiting in silence.
        const res = await Promise.race([
          emitAck("room:suggest", game),
          new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "No pudimos enviar la sugerencia. Inténtalo de nuevo." }), 4000)),
        ]);
        if (!res.ok) throw new Error(res.error);
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

      // Anyone who may change the settings: takes a Spotify playlist out of the room.
      async removePlaylist(playlistId) {
        const res = await emitAck("room:removePlaylist", playlistId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Anyone who may change the settings: a public Spotify playlist pasted as a link.
      async addSpotifyLink(link) {
        // Reading Spotify takes a moment; past 25 s it is given up instead of waiting forever.
        const res = await emitAckWithin(25000, "room:spotifyLink", link);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
        // `saved`: the account's list ("Mis playlists"); `added`: the room's id of the playlist just read, and
        // `playlist` its name, cover and songs (a guest keeps it in this browser).
        const playlist = res.added ? res.state?.customPlaylists?.find((p) => p.id === res.added) || null : null;
        return { saved: res.saved || null, added: res.added || null, playlist };
      },

      // The Spotify playlists and albums kept on this account ({ canSave, saved }), and deleting one for good.
      async listSavedSpotify() {
        const res = await emitAck("spotify:saved");
        if (!res.ok) throw new Error(res.error);
        return { canSave: Boolean(res.canSave), saved: res.saved || [] };
      },

      async forgetSavedSpotify(key) {
        const res = await emitAck("spotify:forget", key);
        if (!res.ok) throw new Error(res.error);
        return res.saved || [];
      },

      async toggleConfigPermission(targetUserId) {
        const res = await emitAck("room:toggleConfigPermission", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
        return res;
      },

      // The host makes another player the host (and keeps the permission to change the settings).
      async giveHost(targetUserId) {
        const res = await emitAck("room:giveHost", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Host only: takes a player out of the room; they can come back with the code.
      async kickPlayer(targetUserId) {
        const res = await emitAck("room:kick", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Host only: takes a player out of the room for good (they can't join it again).
      async blockPlayer(targetUserId) {
        const res = await emitAck("room:block", targetUserId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // The room's playlist, all of it (name, order and games with their settings); the server keeps it valid.
      // A playlist kept on the server, the room's (or `playlist`, a saved one): its code ("K7P2M-XH4QN"), the same for
      // the same playlist.
      async sharePlaylist(playlist = null) {
        const res = await emitAckWithin(10000, "playlist:share", playlist);
        if (!res.ok) throw new Error(res.error);
        return res.code;
      },

      // The playlist a pasted code points to ({ name, order, items }).
      async playlistByCode(code) {
        const res = await emitAckWithin(10000, "playlist:byCode", code);
        if (!res.ok) throw new Error(res.error);
        return res.playlist;
      },

      async updatePlaylist(playlist) {
        const res = await emitAck("room:playlist", playlist);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // "Sigo aquí": the answer to the card that asks an idle player of a public match if they are still there.
      async stillHere() { await emitAck("room:present", null); },

      async setReady(ready) { await emitAck("room:ready", ready); },
      async startGame() { const res = await emitAck("room:start"); if (!res.ok) throw new Error(res.error); },
      async restartGame() { const res = await emitAck("room:restart"); if (!res.ok) throw new Error(res.error); },
      async replayGame() { const res = await emitAck("room:replay"); if (!res.ok) throw new Error(res.error); },
      async endGame() { await emitAck("room:end"); },
      async pauseGame(paused) { const res = await emitAck("room:pause", paused); if (!res.ok) throw new Error(res.error); },

      // Owners: reports the question being played, to check it later.
      async reportQuestion() { const res = await emitAck("room:report"); if (!res.ok) throw new Error(res.error); },
      // An owner's test bot for Farsante's lobby (to try it alone).
      async addTestBot() { const res = await emitAck("room:addTestBot", null); if (!res.ok) throw new Error(res.error); },
      async skipRound() { const res = await emitAck("room:skipRound"); if (!res.ok) throw new Error(res.error); },

      async answer(answerTextOrId) {
        const res = await emitAck("game:answer", answerTextOrId);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Geografía's map rounds: `{ lng, lat, lock }`. Without `lock` the pin can still move (except in a tiebreak).
      async placePin(pin) {
        const res = await emitAck("game:pin", pin);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Historia: `{ year, lock }`. Without `lock` the year can still move.
      async placeYear(value) {
        const res = await emitAck("game:year", value);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Campo de minas: `{ cell, turn }`, one cell of the board per turn (`turn` is the one on screen).
      async pickCell(value) {
        const res = await emitAck("game:cell", value);
        if (!res.ok) throw new Error(res.error);
        if (res.state) setRoom(res.state);
      },

      // Lluvia: an answer written in the box. Returns { hit } with the question this player took ({ drop, points,
      // answer }), { takenBy, answer } when it was right but someone else took that question first, or {} when it
      // was right for none of the ones on screen.
      async rainAnswer(text) {
        const res = await emitAck("game:rain", text);
        if (!res.ok) throw new Error(res.error);
        if (res.hit) return { hit: res.hit };
        return res.takenBy ? { takenBy: res.takenBy, answer: res.answer } : {};
      },

      // Farsante: an answer written for the round's prompt (it can be rewritten until the writing ends), and a vote
      // (the position of one of the options).
      async farsanteWrite(text) {
        const res = await emitAck("game:farsante", text);
        if (!res.ok) throw new Error(res.error);
      },
      async farsanteVote(index) {
        const res = await emitAck("game:farsanteVote", index);
        if (!res.ok) throw new Error(res.error);
      },

      // Rey de la colina: the king picks one of the three questions (its position).
      async kingPick(index) {
        const res = await emitAck("game:kingPick", index);
        if (!res.ok) throw new Error(res.error);
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

  // This device is its room's central device: it only shows the match, and is never the host nor a player, even when
  // its account is one of theirs.
  const isCentral = role === "central" && Boolean(room);

  return (
    <AppContext.Provider
      value={{
        user,
        catalog,
        refreshCatalog,
        room,
        setRoom,
        isCentral,
        centralOffer,
        kickedNotice,
        setKickedNotice,
        leaveAsk,
        setLeaveAsk,
        spotify,
        linkingStatus,
        error,
        setError,
        ...actions,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }

// How this device shows a room's match:
//  - "central": it's the room's central device, the screen everyone looks at: the whole match, without any way to
//    answer or control it;
//  - "controller": a player while the room has a central device connected: only the ways to answer (the options, the
//    box to write, the board...), since the question is on that screen;
//  - "full": everything, as when each player plays on their own screen.
// `viewerId` is who "you" are on screen: nobody on the central device.
export function useView(room) {
  const { user, isCentral } = useApp();
  if (isCentral) return { view: "central", central: true, controller: false, viewerId: null };
  const controller = Boolean(room?.central?.connected);
  return { view: controller ? "controller" : "full", central: false, controller, viewerId: user?.id ?? null };
}

// Time left in the phase. `clockOffset` (server time minus ours) was taken when the snapshot arrived, so this keeps
// counting down between snapshots instead of repeating the value the server sent.
export function remainingMs(room) {
  // Paused by the host: the time left stays where it stopped.
  if (room?.paused) return room.paused.remainingMs;
  if (!room?.phaseEndsAt) return 0;
  return Math.max(0, room.phaseEndsAt - (Date.now() + (room.clockOffset || 0)));
}

// remainingMs for a screen that shows a clock. It is worked out while rendering, so the first frame of a new phase
// already has the right value (a `useState` copy refreshed by an interval was stale for up to 100 ms on every change
// of phase: the countdown flashed "1", the bar was empty, the clock turned red). The interval only repaints.
export function useRemainingMs(room) {
  const [, repaint] = useState(0);
  const running = Boolean(room?.phaseEndsAt);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => repaint((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);
  return remainingMs(room);
}
