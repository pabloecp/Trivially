import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../../modes/index.js";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { useStartGame } from "./ModeStart.jsx";
import PartyPanel from "./PartyPanel.jsx";
import { ChatButton } from "./RoomChat.jsx";
import { useRoomExit } from "./TvTopbar.jsx";
import { useInvite } from "./useInvite.js";
import VolumeMenu from "./VolumeMenu.jsx";

const STACK = 5;

// Phones only (home.css): the room screen's own top bar, pinned to the top in place of the usual one. The button on
// the left of the logo, which is not a button, is the top bar's "Volver" (see `useRoomExit`), only its arrow here:
// back to the game modes for the host once a game is picked, otherwise out of the room after asking (two taps).
// Then the room's code and your role, the players' faces (tap: the room's column drops down, with everyone and the
// way out), the volume and your own avatar, to your profile.
export function RoomHeader({ room, onToast }) {
  const { user } = useApp();
  const { toModes, confirmLeave, press } = useRoomExit({ onError: onToast });
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const me = room.players.find((p) => p.id === user?.id);
  const role = room.hostId === user?.id ? "Anfitrión" : me?.canEditConfig ? "Puede editar" : "Jugador";
  const shown = room.players.slice(0, STACK);
  const more = room.players.length - shown.length;

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header ref={rootRef} className="tv-roomhead">
      <div className="tv-roomhead-start">
        <button
          type="button"
          className={`tv-roomhead-leave${confirmLeave ? " is-confirm" : ""}`}
          aria-label={toModes ? "Volver a modos de juego" : confirmLeave ? "Toca otra vez para salir de la sala" : "Volver: salir de la sala"}
          onClick={press}
        >
          <Icon name={confirmLeave ? "logout" : "back"} size={22} strokeWidth={2.6} />
        </button>
        <AppIcon small />
      </div>
      <div className="tv-roomhead-text">
        <span className="tv-roomhead-kicker">{confirmLeave ? "¿Salir? Otra vez" : `Sala · ${role}`}</span>
        <span className="tv-roomhead-code">{room.code}</span>
      </div>
      <button
        type="button"
        className="tv-roomhead-players"
        aria-expanded={open}
        aria-label={`${room.players.length === 1 ? "1 jugador" : `${room.players.length} jugadores`} en la sala`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tv-roomhead-stack" aria-hidden="true">
          {shown.map((p) => (
            <Avatar key={p.id} name={p.name} avatar={p.avatar} className={p.connected ? "" : "is-away"} />
          ))}
          {more > 0 && <span className="tv-avatar tv-avatar--empty">+{more}</span>}
        </span>
        <Icon name="chevron" size={18} strokeWidth={3} className="tv-roomhead-chevron" />
      </button>
      <VolumeMenu />
      {user && (
        <Link to="/profile" className="tv-roomhead-me" aria-label={`Tu perfil: ${user.name}`}>
          <Avatar name={user.name} avatar={user.avatar} />
        </Link>
      )}
      {open && (
        <div className="tv-roomhead-drop">
          <PartyPanel room={room} onToast={onToast} className="tv-party--drop" />
        </div>
      )}
    </header>
  );
}

// Phones only (home.css): the bar pinned to the bottom of the room screen. The invite link, the chat (with how many
// messages from others came since it was last open), and the host's "Empezar" (in the picked game's colour; "Elige un
// modo de juego" until there is one). Everyone else sees who they wait for.
export function RoomDock({ room, onToast }) {
  const mode = findMode(room.game);
  const { isHost, canStart, busy, err, start } = useStartGame(room);
  const { copied, copy } = useInvite(room.code, onToast);

  return (
    <div className="tv-roomdock">
      {err && <p className="tv-lobby-error">{err}</p>}
      <div className="tv-roomdock-row">
        <button
          type="button"
          className="tv-btn tv-c-violet tv-roomdock-invite"
          onClick={copy}
          aria-label={copied ? "Enlace copiado" : "Invitar con enlace"}
        >
          <Icon name={copied ? "check" : "link"} size={22} strokeWidth={2.6} />
        </button>
        <ChatButton room={room} className="tv-btn tv-c-neutral tv-roomdock-invite" />
        {isHost ? (
          <button
            type="button"
            className={`tv-btn tv-c-${mode?.color || "neutral"} tv-roomdock-start${mode ? "" : " is-pick"}`}
            onClick={start}
            disabled={!canStart}
          >
            {mode ? (busy ? "Empezando…" : "Empezar") : "Elige un modo de juego"}
          </button>
        ) : (
          <p className="tv-roomdock-wait">Esperando a {room.hostName || "el anfitrión"}…</p>
        )}
      </div>
    </div>
  );
}
