import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { roomPath, waitsOnInicio } from "../../modes/index.js";
import { useApp } from "../../lib/store.jsx";
import { useFriends } from "../../lib/friends.jsx";
import { useIsOwner } from "../../lib/ownerView.js";
import AdminPanel from "./AdminPanel.jsx";
import AppIcon from "./AppIcon.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Icon from "./Icon.jsx";
import ProfileChip from "./ProfileChip.jsx";
import VolumeMenu from "./VolumeMenu.jsx";

/** Where leaving a room goes: Inicio, which keeps the game and the side (lib/plan.js) the room was on. */
export function exitPath() {
  return "/";
}

/**
 * Outside a room, "Volver" goes back to where you were (the browser's own Back: from the profile to Inicio, or from an
 * option (Casual, Competitivo, Privada) to Inicio's three tiles). Opened straight on a page (nothing behind it in this
 * tab), it goes to Inicio.
 */
export function upPath() {
  return "/";
}

export function useGoUp() {
  const nav = useNavigate();
  return () => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1);
    else nav(upPath(), { replace: true });
  };
}

// Whether the last top bar drawn had a "Volver": kept across pages, so the button only slides in when it appears (Inicio
// → "¿Cómo quieres jugar?"), not each time a page that already had it opens.
let hadBack = false;
// How long "Volver" takes to slide in or out (home.css, tvBackIn / tvBackOut).
const BACK_ANIM_MS = 450;

// The way out of a room, which depends on where you are in it:
//  - while it waits (a private match before it starts, a search) it's Inicio itself (`waitsOnInicio`): players have no
//    "Volver" there. Only the central device has one, which asks first in a modal (`asking`, shared through the store;
//    the top bar draws it) whose button calls `leaveNow`;
//  - on a match's own screen (`inGame`): the top bar has an "X" that opens a modal (see TvTopbar), which calls
//    `leaveNow` when it is confirmed. The group's leader takes the whole group (`leadsGroup`, group:home); anyone else
//    of a group goes alone and stays in it. The host of a private match (`toMenu`) doesn't leave: the match ends for
//    everyone and they go back to waiting in it, like the games' "Terminar" (`endToMenu`).
// `press` is the central device's "Volver". `onRoomScreen` is false away from the room's own screen (profile, another
// page). `onError` gets the message when going back fails.
export function useRoomExit({ onRoomScreen = true, onError } = {}) {
  const { user, room, group, isCentral, restartGame, leaveRoom, groupHome, leaveAsk, setLeaveAsk } = useApp();
  const nav = useNavigate();
  const inGame = onRoomScreen && Boolean(room) && room.phase !== "lobby";
  // A public match has no host and no menu to go back to, and only the host can change the room's game.
  const toMenu = inGame && !isCentral && !room.matchmaking && room.hostId === user?.id;
  const asking = leaveAsk && Boolean(room) && !inGame;
  // The group's leader where the group is, outside a public match being played: going back takes the whole group.
  const leadsGroup =
    Boolean(group) && Boolean(room) && !isCentral && group.leaderId === user?.id && group.place?.code === room.code && !(room.matchmaking && inGame && room.phase !== "finished");

  // Out of the room, back to Inicio (exitPath): the whole group with its leader, otherwise alone.
  // Replacing, not pushing: Back must not return to the room's address (/sala/CODE), which joins it again.
  function leaveNow() {
    const target = exitPath(room);
    if (leadsGroup) {
      return groupHome()
        .then(() => {
          setLeaveAsk(false);
          nav(target, { replace: true });
        })
        .catch((err) => onError?.(err.message || "No se pudo volver al inicio"));
    }
    setLeaveAsk(false);
    leaveRoom();
    nav(target, { replace: true });
  }

  // The match ends for everyone and the group goes back to its room, in the same game (or the playlist's panel).
  // Resolves when the room has moved; the match's screens follow it (RoomNavigator, App.jsx).
  function endToMenu() {
    return restartGame().catch((err) => onError?.(err.message || "No se pudo terminar la partida"));
  }

  // One step back. Returns true when it left the room.
  function step() {
    setLeaveAsk(true);
    return false;
  }

  function press(e) {
    if (!room) return;
    e.preventDefault();
    step();
  }

  return { toMenu, inGame, asking, leadsGroup, press, leaveNow, endToMenu, cancelAsk: () => setLeaveAsk(false) };
}

// Same top bar on every screen: on the left the way back and the small logo with "trivially", which goes to Inicio
// (during a match, after asking, since it leaves it); the volume (music and sounds) and the profile on the right. The way back:
//  - nothing on Inicio itself, also while a room waits there (a private match before it starts, a search: the bar's
//    own buttons change or cancel it). The central device has "Volver" (see `useRoomExit`);
//  - on a match's screen it is an "X" that asks in a modal before leaving (the host of a private match goes back to
//    waiting in it instead of leaving);
//  - on any other page (profile...): "Volver", to the match if one is running, otherwise to Inicio.
export default function TvTopbar() {
  const { user, room, group, isCentral, leaveRoom, setLeaveAsk } = useApp();
  const nav = useNavigate();
  const friends = useFriends();
  const isOwner = useIsOwner();
  const [adminOpen, setAdminOpen] = useState(false);
  const { pathname } = useLocation();
  const roomTarget = room ? roomPath(room) : null;
  const awayFromRoom = Boolean(roomTarget) && pathname !== roomTarget;
  const inMatch = Boolean(room) && room.phase !== "lobby";
  // A room waiting on Inicio is Inicio for its players (not for the central device, whose screen is the room's).
  const waitsHere = waitsOnInicio(room) && !isCentral;
  const onHome = pathname === "/" && (!room || waitsHere);
  const brandHidden = onHome;
  const goUp = useGoUp();
  const [modesErr, setModesErr] = useState("");
  const { toMenu, inGame, asking, leadsGroup, press, leaveNow, endToMenu, cancelAsk } = useRoomExit({
    onRoomScreen: pathname === roomTarget,
    onError: setModesErr,
  });
  // The modal that asks before leaving a match; it only makes sense while the match's own screen is up.
  const [leaving, setLeaving] = useState(false);
  // The logo goes to Inicio: straight away outside a room, and after asking (out of the room) inside one.
  const [homeAsk, setHomeAsk] = useState(false);

  useEffect(() => {
    if (!room) setHomeAsk(false);
  }, [room]);

  function goHome() {
    if (room && !waitsHere) setHomeAsk(true);
    else nav("/");
  }

  function leaveHome() {
    setHomeAsk(false);
    setLeaveAsk(false);
    leaveRoom();
    nav("/", { replace: true });
  }

  useEffect(() => {
    if (!modesErr) return undefined;
    const timer = setTimeout(() => setModesErr(""), 3000);
    return () => clearTimeout(timer);
  }, [modesErr]);

  useEffect(() => {
    if (!inGame) setLeaving(false);
  }, [inGame]);

  // The same "Volver" chip on every screen but Inicio; only what a tap does changes.
  const backChip = (props) => (
    <button type="button" className="tv-chip tv-chip--leave" {...props}>
      <span className="tv-avatar tv-avatar--empty">
        <Icon name="back" size={20} strokeWidth={2.6} />
      </span>
      <span className="tv-chip-name tv-chip-long">Volver</span>
    </button>
  );
  let leaveButton = null;
  if (inGame) {
    // In a match, going back is leaving it, so the arrow is an "X" and a modal asks first.
    leaveButton = (
      <button
        type="button"
        className="tv-chip tv-chip--leave tv-chip--icon"
        aria-label={toMenu ? "Terminar la partida y volver a los juegos" : "Salir de la partida"}
        aria-haspopup="dialog"
        onClick={() => setLeaving(true)}
      >
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="close" size={20} strokeWidth={2.6} />
        </span>
      </button>
    );
  } else if (awayFromRoom) {
    leaveButton = (
      <Link to={roomTarget} className="tv-chip tv-chip--leave" aria-label={inMatch ? "Volver a la partida" : "Volver al inicio"}>
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="back" size={20} strokeWidth={2.6} />
        </span>
        <span className="tv-chip-name tv-chip-long">Volver</span>
      </Link>
    );
  } else if (room && !waitsHere) {
    // The central device while the room waits: out of it, after asking.
    leaveButton = (
      <button type="button" className="tv-chip tv-chip--leave" aria-label="Dejar de ser el dispositivo central" aria-haspopup="dialog" onClick={press}>
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="back" size={20} strokeWidth={2.6} />
        </span>
        {/* Phones only have room for the icon (home.css). */}
        <span className="tv-chip-name tv-chip-long">Volver</span>
      </button>
    );
  } else if (!onHome) {
    leaveButton = backChip({ "aria-label": upPath(pathname) === "/" ? "Volver al inicio" : "Volver", onClick: goUp });
  }

  // "Volver" slides in when it appears (from Inicio, which has none) and slides out when it goes (back to Inicio): while
  // it goes, the last one drawn stays on screen, untouchable, for the length of its animation.
  const hasBack = Boolean(leaveButton);
  const [backAnim, setBackAnim] = useState(() => (hasBack && !hadBack ? "in" : null));
  const lastButton = useRef(leaveButton);
  if (leaveButton) lastButton.current = leaveButton;
  // Read while rendering, not in an effect, so the button never shows (or vanishes) for a frame before it moves.
  const [prevHasBack, setPrevHasBack] = useState(hasBack);
  if (hasBack !== prevHasBack) {
    setPrevHasBack(hasBack);
    setBackAnim(hasBack ? "in" : "out");
  }
  useEffect(() => {
    hadBack = hasBack;
  }, [hasBack]);
  useEffect(() => {
    if (!backAnim) return undefined;
    const t = setTimeout(() => setBackAnim(null), BACK_ANIM_MS);
    return () => clearTimeout(t);
  }, [backAnim]);
  const shownButton = leaveButton || (backAnim === "out" ? lastButton.current : null);

  return (
    <>
      {isOwner && <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />}
      <header className={`tv-topbar${backAnim ? ` is-back-${backAnim}` : ""}`}>
        <div className="tv-topbar-start">
          {shownButton}
          <button
            type="button"
            className={`tv-brand${brandHidden ? " is-hidden" : ""}`}
            aria-label="Ir al inicio"
            aria-haspopup={room ? "dialog" : undefined}
            onClick={goHome}
          >
            <AppIcon small />
            <span className="tv-brand-name">trivially</span>
          </button>
        </div>
        {/* The site's address, faint, in the middle of the bar (computers): on every screen, so the bar never changes. */}
        <span className="tv-topbar-url">playtrivially.com</span>
        <div className="tv-topbar-end">
          {/* Owners only: the admin panel (the owner/user view, the test bot, the games forced in Casual). */}
          {isOwner && !isCentral && (
            <button
              type="button"
              className="tv-chip tv-chip--icon"
              aria-label="Panel de owner"
              aria-haspopup="dialog"
              onClick={(e) => {
                e.currentTarget.blur();
                setAdminOpen(true);
              }}
            >
              <span className="tv-avatar tv-avatar--empty">
                <Icon name="settings" size={20} strokeWidth={2.4} />
              </span>
            </button>
          )}
          {friends.isAccount && !isCentral && (
            <button
              type="button"
              className="tv-chip tv-chip--icon tv-chip--friends"
              aria-label={friends.pending ? `Amigos (${friends.pending} solicitudes)` : "Amigos"}
              aria-haspopup="dialog"
              onClick={(e) => {
                // The sheet doesn't take the focus: left on this button, closing it with Escape drew the keyboard's
                // focus ring around it.
                e.currentTarget.blur();
                friends.setOpen(true);
              }}
            >
              <span className="tv-avatar tv-avatar--empty">
                <Icon name="users" size={20} strokeWidth={2.4} />
              </span>
              {friends.pending > 0 && <span className="tv-fr-badge">{friends.pending}</span>}
            </button>
          )}
          <VolumeMenu />
          <ProfileChip user={user} />
        </div>
      </header>
      {/* The central device's "Volver" while the room waits. */}
      <ConfirmDialog
        open={asking && isCentral}
        icon="tv"
        title="¿Dejar de ser el dispositivo central?"
        text="Esta pantalla saldrá de la partida."
        cancelLabel="Quedarme"
        confirmLabel="Salir"
        onCancel={cancelAsk}
        onConfirm={leaveNow}
      />
      {/* The logo during a match (or on the central device): out of it (asking first) and to Inicio. */}
      <ConfirmDialog
        open={homeAsk && Boolean(room)}
        icon={isCentral ? "tv" : "logout"}
        title={isCentral ? "¿Dejar de ser el dispositivo central?" : "¿Seguro que quieres salir?"}
        text={isCentral ? "Esta pantalla saldrá de la partida y volverá al inicio." : "Dejarás la partida en curso y volverás al inicio."}
        cancelLabel={inMatch && !isCentral ? "Seguir jugando" : "Quedarme"}
        confirmLabel="Salir"
        onCancel={() => setHomeAsk(false)}
        onConfirm={leaveHome}
      />
      <ConfirmDialog
        open={leaving && inGame}
        icon={isCentral ? "tv" : toMenu ? "users" : "logout"}
        title={isCentral ? "¿Dejar de ser el dispositivo central?" : toMenu ? "¿Volver a elegir el juego?" : "¿Seguro que quieres salir?"}
        text={
          isCentral
            ? "Esta pantalla saldrá de la partida y cada jugador volverá a verla en su teléfono."
            : toMenu
            ? modesErr ||
              (room.phase === "finished"
                ? "Todos volverán a la espera de la partida, en el mismo juego."
                : "La partida se acabará para todos y volverán a la espera, en el mismo juego.")
            : leadsGroup
            ? modesErr || "Todo el grupo volverá al inicio contigo."
            : group
            ? "Dejarás la partida en curso. Seguirás en tu grupo."
            : "Dejarás la partida en curso."
        }
        cancelLabel={isCentral ? "Seguir mostrándola" : "Seguir jugando"}
        confirmLabel={toMenu ? "Volver" : "Salir"}
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          // Back to the menu (or the group back to Inicio) the dialog stays up until the room has moved (or says why
          // it couldn't).
          if (toMenu) {
            endToMenu();
            return;
          }
          if (leadsGroup) {
            leaveNow();
            return;
          }
          setLeaving(false);
          leaveNow();
        }}
      />
    </>
  );
}
