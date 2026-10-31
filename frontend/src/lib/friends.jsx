import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import FriendInvite from "../components/home/FriendInvite.jsx";
import FriendsSheet from "../components/home/FriendsSheet.jsx";
import { api } from "./api.js";
import { emitAck, getSocket } from "./socket.js";
import { useApp } from "./store.jsx";

// The friends tab: the list (who is online and where), the requests, the friend code, and what a friend can do about a
// group (join it, or ask its leader). The server pushes the whole view (`friends:state`) whenever something about it
// changes.
const FriendsContext = createContext(null);

export function FriendsProvider({ children }) {
  const { user, joinGroup } = useApp();
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
  const joinRef = useRef(joinGroup);
  joinRef.current = joinGroup;
  // A friend's invitation to their group, shown as a card until it's answered (FriendInvite).
  const [invite, setInvite] = useState(null);

  // The view could not be loaded (the server is older than this page, or the connection failed): the panel says so.
  const [failed, setFailed] = useState(false);
  const reload = useCallback(
    () =>
      api("/api/friends")
        .then((v) => {
          setView(v);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    []
  );

  useEffect(() => {
    if (!isAccount) {
      setView(null);
      setOpen(false);
      return undefined;
    }
    reload();
    const s = getSocket();
    const onState = (next) => {
      setView(next);
      setFailed(false);
    };
    // The leader let this account in: it enters the group with the code the server sends only now.
    const onApproved = async ({ code, hostName } = {}) => {
      try {
        await joinRef.current(code);
        say(`${hostName || "El líder"} te dejó entrar a su sala`);
      } catch (err) {
        say(err.message || "No pudimos entrar a la sala", "lock");
      }
    };
    const onDeclined = ({ hostName } = {}) => say(`${hostName || "El líder"} no te dejó entrar esta vez`, "lock");
    // A friend invites this account to their group: a card with "Unirme".
    const onInvited = (data = {}) => data.code && setInvite({ ...data, id: Date.now() });
    s.on("friends:state", onState);
    s.on("friend:approved", onApproved);
    s.on("friend:declined", onDeclined);
    s.on("friend:invited", onInvited);
    return () => {
      s.off("friends:state", onState);
      s.off("friend:approved", onApproved);
      s.off("friend:declined", onDeclined);
      s.off("friend:invited", onInvited);
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
      requestByUsername: (username) => call("/api/friends/request", { method: "POST", body: { username } }),
      // People by username (from 3 letters), with where each one stands with this account.
      search: (q) => api(`/api/friends/search?q=${encodeURIComponent(q)}`).then((r) => r.results),
      requestUser: (userId) => call("/api/friends/request", { method: "POST", body: { userId } }),
      accept: (id) => call(`/api/friends/${id}/accept`, { method: "POST" }),
      decline: (id) => call(`/api/friends/${id}/decline`, { method: "POST" }),
      remove: (id) => call(`/api/friends/${id}`, { method: "DELETE" }),
      // A friend in a group: straight in, or asking its leader, as the group allows.
      async joinFriend(friendId) {
        const res = await emitAck("friend:join", { friendId });
        if (!res.ok) throw new Error(res.error);
        if (res.action === "join") await joinRef.current(res.code);
        return res.action;
      },
      // Sends this group's code to a friend who is online (they see "Ana te invita a su sala").
      async inviteFriend(friendId) {
        const res = await emitAck("friend:invite", { friendId });
        if (!res.ok) throw new Error(res.error);
      },
      async cancelJoin(friendId) {
        const res = await emitAck("friend:cancelJoin", { friendId });
        if (!res.ok) throw new Error(res.error);
      },
      // The leader's side: what friends can do, and answering a friend who asks to join.
      async setJoinMode(mode) {
        const res = await emitAck("group:joinMode", mode);
        if (!res.ok) throw new Error(res.error);
      },
      async answerJoin(userId, accept) {
        const res = await emitAck("group:answerJoin", { userId, accept });
        if (!res.ok) throw new Error(res.error);
      },
    };
  }, [reload]);

  const value = useMemo(
    () => ({
      isAccount,
      view,
      failed,
      username: view?.username || null,
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
    [isAccount, view, failed, open, notice, say, actions]
  );

  return (
    <FriendsContext.Provider value={value}>
      {children}
      {isAccount && <FriendsSheet />}
      <FriendInvite
        invite={invite}
        onClose={() => setInvite(null)}
        onJoin={async (inv) => {
          try {
            await joinRef.current(inv.code);
            setInvite(null);
            say(`Entraste a la sala de ${inv.fromName}`);
          } catch (err) {
            setInvite(null);
            if (!err.offer) say(err.message || "No pudimos entrar a la sala", "lock");
          }
        }}
      />
    </FriendsContext.Provider>
  );
}

const NONE = {
  isAccount: false,
  view: null,
  username: null,
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
