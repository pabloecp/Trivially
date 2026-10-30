import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { useFriends } from "../lib/friends.jsx";
import { useLocalPlan } from "../lib/plan.js";
import { findMode } from "../modes/index.js";
import Icon from "../components/home/Icon.jsx";
import TvTopbar from "../components/home/TvTopbar.jsx";
import CentralLobby from "../components/home/CentralLobby.jsx";
import HomeFrame from "../components/home/HomeFrame.jsx";
import MatchIntro from "../components/home/MatchIntro.jsx";
import PartyPanel from "../components/home/PartyPanel.jsx";
import PlaySheet from "../components/home/PlaySheet.jsx";
import "../styles/home.css";
import { resolveCode, resolveGroupCode, tabGroupCode } from "../lib/hiddenCode.js";

// How a choice of the menu reads in a sentence: "Trivia", "Clásico normal".
const choiceName = (mode) => mode?.fullName || mode?.name || "un juego";

// The old pages of "¿Cómo quieres jugar?" (/jugar/casual, /jugar/privada…) are Inicio now, on the side they named.
const OPTION_AUDIENCE = { casual: "publica", competitivo: "publica", privada: "grupo" };

// Inicio and the room's screen (/, or your sala's /grupo/CODE while you have one, also while a room waits, and
// /sala/CODE while a public match or a Clásico plays; another group's /grupo/CODE is its invite link). Inicio, a private match while it waits and the search for a public match are
// the same frame (HomeFrame): the game's card in the middle and the
// group's bar at the bottom. Before each game of a public match or a Clásico, its roulette and tutorial (MatchIntro)
// take the card's place beside the scoreboard. The room's central device shows its own big waiting screen
// (CentralLobby).
export default function Home() {
  const { user, room, group, isCentral, joinRoom, joinGroup, kickedNotice, setKickedNotice } = useApp();
  const { code: inviteParam, option, groupCode: groupParam } = useParams();
  // An address with "oculta" (the code hidden, lib/hiddenCode.js) is this tab's room.
  const inviteCode = resolveCode(inviteParam, room)?.toUpperCase();
  const nav = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetJoinCode, setSheetJoinCode] = useState(null);
  // A group's invite link opened without a name: the name first, then into the group.
  const [askName, setAskName] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);
  const [, updateLocalPlan] = useLocalPlan();

  const isHost = Boolean(room) && room.hostId === user?.id && !isCentral;
  const game = room?.game ?? null;

  const showToast = useCallback((text, icon = "lock") => {
    setToast({ id: Date.now(), text, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!option || room) return;
    if (OPTION_AUDIENCE[option]) updateLocalPlan({ audience: OPTION_AUDIENCE[option] });
    nav("/", { replace: true });
  }, [option]);

  // Everyone but the host hears about it, like the host's choice popping up on their screen.
  const lastGame = useRef({ code: room?.code, game });
  useEffect(() => {
    const before = lastGame.current;
    lastGame.current = { code: room?.code, game };
    if (before.code !== room?.code || before.game === game) return;
    const picked = findMode(game);
    // A public match has no host: its games come from the roulette, which says so itself.
    if (picked && !isHost && !room.matchmaking) {
      const host = room.hostName || "El anfitrión";
      showToast(`${host} eligió ${choiceName(picked)}`, "play");
    }
  }, [game, room?.code]);

  // The group's leader hears about each friend who asks to join (the group's sheet has the Aceptar button).
  const isLeader = Boolean(group) && group.leaderId === user?.id;
  const askedBefore = useRef(new Set());
  useEffect(() => {
    if (!isLeader) return;
    for (const r of group?.joinRequests || []) {
      const key = `${r.userId}:${r.at}`;
      if (askedBefore.current.has(key)) continue;
      askedBefore.current.add(key);
      showToast(`${r.name} quiere unirse a tu grupo`, "users");
    }
  }, [group?.joinRequests, isLeader]);

  // A friend let you in, or turned you down.
  const friendsNotice = useFriends().notice;
  useEffect(() => {
    if (friendsNotice) showToast(friendsNotice.text, friendsNotice.icon);
  }, [friendsNotice]);

  useEffect(() => {
    if (!kickedNotice) return;
    showToast(kickedNotice, "logout");
    setKickedNotice("");
  }, [kickedNotice]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    if (inviteCode) nav("/", { replace: true });
  }, [inviteCode, nav]);

  // A group's invite link (/grupo/CODE) joins it straight away (and goes where it is), asking for a name first if we
  // don't have one. Then the address is Inicio's, now the group's own (or the group's match's, RoomNavigator).
  const groupInvite = resolveGroupCode(groupParam, group)?.toUpperCase();
  useEffect(() => {
    if (!groupParam || askName) return;
    // "oculta" with no sala in this tab: nothing to join.
    if (!groupInvite) {
      nav("/", { replace: true });
      return;
    }
    // Your own sala's address (Inicio while you have one, or a reload, whose rejoin brings the sala back).
    if (tabGroupCode(group) === groupInvite) return;
    if (!user?.name) {
      setAskName(true);
      return;
    }
    joinGroup(groupInvite)
      .then(() => showToast("Entraste al grupo", "users"))
      .catch((err) => !err.offer && showToast(err.message || "No pudimos entrar a ese grupo"))
      .finally(() => nav("/", { replace: true }));
  }, [groupInvite, user?.name, askName]);

  // A match's address (/sala/XOTRIV: an older link, a reload during a public match) joins it straight away, asking for a
  // name first if we don't have one.
  useEffect(() => {
    if (!inviteCode || room?.code === inviteCode || sheetOpen) return;
    if (!user?.name) {
      setSheetJoinCode(inviteCode);
      setSheetOpen(true);
      return;
    }
    joinRoom(inviteCode).catch((err) => {
      // Already playing in it from another device: CentralOffer asks whether this one is its central device.
      if (!err.offer) showToast(err.message || "No pudimos entrar a ese grupo");
      nav("/", { replace: true });
    });
  }, [inviteCode, user?.name]);

  const roomMode = findMode(room?.game);
  // The site takes the picked game's colour while the room waits in it (see :root[data-mode] in global.css).
  useEffect(() => {
    if (!roomMode) return;
    document.documentElement.setAttribute("data-mode", roomMode.id);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [roomMode?.id]);

  const centralScreen = isCentral && Boolean(room);
  const intro = room?.phase === "intro";

  return (
    <div className="tv-app">
      <TvTopbar />

      <main className={`tv-main is-room${centralScreen ? " is-central" : ""}${intro ? "" : " is-lobby"}`}>
        {centralScreen ? (
          // A Clásico's roulette and tutorial show on the central device too.
          intro ? <MatchIntro room={room} /> : <CentralLobby room={room} />
        ) : intro ? (
          // Before each game of a public match or a Clásico: the roulette and how it's played, beside the scoreboard.
          <div className="tv-room is-intro">
            <div className="tv-room-main">
              <MatchIntro room={room} />
            </div>
            <PartyPanel room={room} onToast={showToast} scores />
          </div>
        ) : (
          <HomeFrame room={room} Lobby={room?.matchmaking ? null : roomMode?.Lobby || null} onToast={showToast} />
        )}
      </main>

      <PlaySheet joinCode={sheetJoinCode} open={sheetOpen} onClose={closeSheet} />
      {/* A group's invite link without a name: once it's written, the link's effect joins the group. */}
      <PlaySheet
        askName
        open={askName}
        onClose={() => {
          setAskName(false);
          nav("/", { replace: true });
        }}
        onNamed={() => setAskName(false)}
      />

      <div className="tv-toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="tv-toast">
            <Icon name={toast.icon} size={16} strokeWidth={2.8} />
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
