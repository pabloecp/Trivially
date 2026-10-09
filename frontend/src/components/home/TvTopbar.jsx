import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { roomPath } from "../../modes/index.js";
import { useApp } from "../../lib/store.jsx";
import AppIcon from "./AppIcon.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Icon from "./Icon.jsx";
import ProfileChip from "./ProfileChip.jsx";
import VolumeMenu from "./VolumeMenu.jsx";

// The button on the left of the logo goes back one step, which depends on where you are in the room:
//  - the host, in a game's panel (`toModes`): back to the game menu, for everyone in the room;
//  - anyone else in the room, the game menu included: out of the room. It asks first: the first tap turns it into
//    "¿Salir de la sala?" (`confirmLeave`, for 3 s, shared through the store), the second one leaves;
//  - on a match's own screen (`inGame`): the top bar turns it into an "X" that opens a modal instead (see TvTopbar),
//    which calls `leaveNow` when it is confirmed.
// `press` is the button's onClick; outside a room it lets the Inicio link go home. The browser's Back button does the
// same through `step` (RoomNavigator, App.jsx). `onRoomScreen` is false away from the room's own screen (profile,
// another page), where going back to the modes makes no sense. `onError` gets the message when going back to the
// modes fails.
export function useRoomExit({ onRoomScreen = true, onError } = {}) {
  const { user, room, setGame, leaveRoom, leaveAsk, setLeaveAsk } = useApp();
  const nav = useNavigate();
  const toModes = onRoomScreen && Boolean(room) && room.phase === "lobby" && Boolean(room.game) && room.hostId === user?.id;
  const inGame = onRoomScreen && Boolean(room) && room.phase !== "lobby";
  const confirmLeave = leaveAsk && onRoomScreen && !toModes && !inGame;

  // Out of the room right away. `fromBack`: the browser's Back button is what asked, and it has already moved to
  // Home, so there is nowhere to navigate.
  function leaveNow({ fromBack = false } = {}) {
    setLeaveAsk(false);
    leaveRoom();
    // Replacing, not pushing: Back from Home must not return to the room's address (/sala/CODE), which joins it again.
    if (!fromBack) nav("/", { replace: true });
  }

  // One step back. Returns true when it left the room.
  function step({ fromBack = false } = {}) {
    if (toModes) {
      setGame(null).catch((err) => onError?.(err.message || "No se pudo volver a elegir modo de juego"));
      return false;
    }
    if (!confirmLeave) {
      setLeaveAsk(true);
      return false;
    }
    leaveNow({ fromBack });
    return true;
  }

  function press(e) {
    if (!room) return;
    e.preventDefault();
    step();
  }

  return { toModes, inGame, confirmLeave, press, step, leaveNow };
}

// Same top bar on every screen: on the left the way back and the small logo with "trivially", which is just the
// brand and goes nowhere; the volume (music and sounds) and the profile on the right. The way back is "Volver" everywhere:
//  - on the room's own screen (see `useRoomExit`): back to the game menu, or out of the room after asking;
//  - on a match's screen it is an "X" that asks in a modal before leaving;
//  - on any other page (profile...): back to the room, or to the match if one is running, and to Inicio when there is
//    no room;
//  - nothing on the home screen itself.
export default function TvTopbar() {
  const { user, room } = useApp();
  const { pathname } = useLocation();
  const roomTarget = room ? roomPath(room) : null;
  const awayFromRoom = Boolean(roomTarget) && pathname !== roomTarget;
  const inMatch = Boolean(room) && room.phase !== "lobby";
  const onHome = !room && pathname === "/";
  const [modesErr, setModesErr] = useState("");
  const { toModes, inGame, confirmLeave, press, leaveNow } = useRoomExit({
    onRoomScreen: pathname === roomTarget,
    onError: setModesErr,
  });
  // The modal that asks before leaving a match; it only makes sense while the match's own screen is up.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!modesErr) return undefined;
    const timer = setTimeout(() => setModesErr(""), 3000);
    return () => clearTimeout(timer);
  }, [modesErr]);

  useEffect(() => {
    if (!inGame) setLeaving(false);
  }, [inGame]);

  let leaveButton = null;
  if (inGame) {
    leaveButton = (
      <button
        type="button"
        className="tv-chip tv-chip--leave tv-chip--icon"
        aria-label="Salir del juego"
        aria-haspopup="dialog"
        onClick={() => setLeaving(true)}
      >
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="close" size={18} strokeWidth={2.8} />
        </span>
      </button>
    );
  } else if (awayFromRoom) {
    leaveButton = (
      <Link to={roomTarget} className="tv-chip tv-chip--leave" aria-label={inMatch ? "Volver a la partida" : "Volver a la sala"}>
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="back" size={18} strokeWidth={2.6} />
        </span>
        <span className="tv-chip-name tv-chip-long">Volver</span>
      </Link>
    );
  } else if (room) {
    leaveButton = (
      <button
        type="button"
        className={`tv-chip tv-chip--leave${confirmLeave ? " is-confirm" : ""}`}
        aria-label={toModes ? "Volver a modos de juego" : confirmLeave ? "Toca otra vez para salir de la sala" : "Volver: salir de la sala"}
        onClick={press}
      >
        <span className="tv-avatar tv-avatar--empty">
          <Icon name={confirmLeave ? "logout" : "back"} size={18} strokeWidth={2.6} />
        </span>
        {toModes && modesErr ? (
          <span className="tv-chip-name">{modesErr}</span>
        ) : (
          <>
            {/* Phones only have room for the icon (home.css), and "¿Salir?" while asking. */}
            <span className="tv-chip-name tv-chip-long">{confirmLeave ? "¿Salir de la sala?" : "Volver"}</span>
            {confirmLeave && <span className="tv-chip-name tv-chip-short">¿Salir?</span>}
          </>
        )}
      </button>
    );
  } else if (!onHome) {
    leaveButton = (
      <Link to="/" className="tv-chip tv-chip--leave" aria-label="Volver al inicio">
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="back" size={18} strokeWidth={2.6} />
        </span>
        <span className="tv-chip-name tv-chip-long">Volver</span>
      </Link>
    );
  }

  return (
    <>
      <header className={`tv-topbar${confirmLeave ? " is-confirm" : ""}`}>
        <div className="tv-topbar-start">
          {leaveButton}
          <div className="tv-brand">
            <AppIcon small />
            <span className="tv-brand-name">trivially</span>
          </div>
        </div>
        <div className="tv-topbar-end">
          <VolumeMenu />
          <ProfileChip user={user} />
        </div>
      </header>
      <ConfirmDialog
        open={leaving && inGame}
        title="¿Seguro que quieres salir?"
        text="Saldrás de la sala y dejarás la partida en curso."
        cancelLabel="Seguir jugando"
        confirmLabel="Salir"
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          leaveNow();
        }}
      />
    </>
  );
}
