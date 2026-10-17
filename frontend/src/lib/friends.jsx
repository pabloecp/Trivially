import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import FriendsSheet from "../components/home/FriendsSheet.jsx";
import { api } from "./api.js";
import { emitAck, getSocket } from "./socket.js";
import { useApp } from "./store.jsx";

// The friends tab: the list (who is online and in which room), the requests, the friend code, and what a friend can do
// about a room. The server pushes the whole view (`friends:state`) whenever something about it changes.
const FriendsContext = createContext(null);

export function FriendsProvider({ children }) {
  const { user, joinRoom } = useApp();
  const isAccount = Boolean(user) && !user.isGuest;
  const [view, setView] = useState(null);
  const [open, setOpen] = useState(false);
  // A short message for the page to show as a toast (a friend let you in, or turned you down).
  const [notice, setNotice] = useState(null);
  const say = useCallback((text, icon = "check") => {
    const id = Date.now();
    setNotice({ id, text, icon });
    setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), 3000);
  }, []);
  const joinRef = useRef(joinRoom);
  joinRef.current = joinRoom;

  const reload = useCallback(() => api("/api/friends").then(setView).catch(() => {}), []);

  useEffect(() => {
    if (!isAccount) {
      setView(null);
      setOpen(false);
      return undefined;
    }
    reload();
    const s = getSocket();
    const onState = (next) => setView(next);
    // The host let this account in: it enters the room with the code the server sends only now.
    const onApproved = async ({ code, hostName } = {}) => {
      try {
        await joinRef.current(code);
        say(`${hostName || "El anfitrión"} te dejó entrar`);
      } catch (err) {
        say(err.message || "No pudimos entrar a la sala", "lock");
      }
    };
    const onDeclined = ({ hostName } = {}) => say(`${hostName || "El anfitrión"} no te dejó entrar esta vez`, "lock");
    s.on("friends:state", onState);
    s.on("friend:approved", onApproved);
    s.on("friend:declined", onDeclined);
    return () => {
      s.off("friends:state", onState);
      s.off("friend:approved", onApproved);
      s.off("friend:declined", onDeclined);
    };
  }, [isAccount, user?.id]);

  const actions = useMemo(() => {
    const call = async (path, options) => {
      const res = await api(path, options);
      reload();
      return res;
    };
    return {
      reload,
      requestByCode: (code) => call("/api/friends/request", { method: "POST", body: { code } }),
      requestUser: (userId) => call("/api/friends/request", { method: "POST", body: { userId } }),
      accept: (id) => call(`/api/friends/${id}/accept`, { method: "POST" }),
      decline: (id) => call(`/api/friends/${id}/decline`, { method: "POST" }),
      remove: (id) => call(`/api/friends/${id}`, { method: "DELETE" }),
      // A friend in a room: straight in, or asking the host, as the room allows.
      async joinFriend(friendId) {
        const res = await emitAck("friend:join", { friendId });
        if (!res.ok) throw new Error(res.error);
        if (res.action === "join") await joinRef.current(res.code);
        return res.action;
      },
      async cancelJoin(friendId) {
        const res = await emitAck("friend:cancelJoin", { friendId });
        if (!res.ok) throw new Error(res.error);
      },
      // The host's side: what friends can do, and answering a friend who asks to join.
      async setJoinMode(mode) {
        const res = await emitAck("room:joinMode", mode);
        if (!res.ok) throw new Error(res.error);
      },
      async answerJoin(userId, accept) {
        const res = await emitAck("room:answerJoin", { userId, accept });
        if (!res.ok) throw new Error(res.error);
      },
    };
  }, [reload]);

  const value = useMemo(
    () => ({
      isAccount,
      view,
      code: view?.code || null,
      // The friends tab's badge: requests waiting for an answer.
      pending: view?.incoming?.length || 0,
      open,
      setOpen,
      notice,
      say,
      // Where this account stands with another one: "friends", "asked" (we asked), "asking" (they asked us) or "none".
      relationTo(id) {
        if (!view) return "none";
        if (view.friends.some((f) => f.id === id)) return "friends";
        if (view.outgoing.some((f) => f.id === id)) return "asked";
        if (view.incoming.some((f) => f.id === id)) return "asking";
        return "none";
      },
      ...actions,
    }),
    [isAccount, view, open, notice, say, actions]
  );

  return (
    <FriendsContext.Provider value={value}>
      {children}
      {isAccount && <FriendsSheet />}
    </FriendsContext.Provider>
  );
}

const NONE = {
  isAccount: false,
  view: null,
  code: null,
  pending: 0,
  open: false,
  notice: null,
  setOpen() {},
  say() {},
  relationTo: () => "none",
};

export function useFriends() {
  return useContext(FriendsContext) || NONE;
}
