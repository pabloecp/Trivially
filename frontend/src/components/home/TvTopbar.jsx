import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { roomPath } from "../../modes/index.js";
import { useApp } from "../../lib/store.jsx";
import { useFriends } from "../../lib/friends.jsx";
import { useIsOwner } from "../../lib/ownerView.js";
import AdminPanel from "./AdminPanel.jsx";
import AppIcon from "./AppIcon.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Icon from "./Icon.jsx";
import ProfileChip from "./ProfileChip.jsx";
import VolumeMenu from "./VolumeMenu.jsx";

/**
 * Where leaving a room goes: one step back, to the option of "¿Cómo quieres jugar?" it came from (PlayPage): a public
 * match's tab of Pública (Casual or Competitivo), otherwise Privada (create a room or join one with a code).
 */
export function exitPath(room) {
  return room?.matchmaking ? `/jugar/${room.matchmaking.kind}` : "/jugar/privada";
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

// The button on the left of the logo goes back one step, which depends on where you are in the room:
//  - the host, in a game's panel (`toModes`): back to the game menu, for everyone in the room;
//  - anyone else in the room, the game menu included: out of the room. It asks first, in the modal "¿Seguro que
//    quieres salir?" (`asking`, shared through the store; the top bar draws it), whose "Salir" calls `leaveNow`;
//  - on a match's own screen (`inGame`): the top bar turns it into an "X" that opens a modal instead (see TvTopbar),
//    which calls `leaveNow` when it is confirmed. The host of a private room (`toMenu`) doesn't leave: the match ends
//    for everyone and the room goes back to the game menu, like the games' "Terminar" (`endToMenu`).
// `press` is the button's onClick; outside a room it lets the Inicio link go home. The browser's Back button does the
// same through `step` (RoomNavigator, App.jsx). `onRoomScreen` is false away from the room's own screen (profile,
// another page), where going back to the modes makes no sense. `onError` gets the message when going back to the
// modes fails.
export function useRoomExit({ onRoomScreen = true, onError } = {}) {
  const { user, room, isCentral, setGame, leaveRoom, leaveAsk, setLeaveAsk } = useApp();
  const nav = useNavigate();
  // The room's central device only leaves (it is never the host, even with the host's account).
  const toModes =
    onRoomScreen && Boolean(room) && room.phase === "lobby" && Boolean(room.game) && room.hostId === user?.id && !isCentral;
  const inGame = onRoomScreen && Boolean(room) && room.phase !== "lobby";
  // A public match has no host and no menu to go back to, and only the host can change the room's game.
  const toMenu = inGame && !isCentral && !room.matchmaking && room.hostId === user?.id;
  const asking = leaveAsk && Boolean(room) && !inGame;

  // Out of the room right away, one step back: to the option of "¿Cómo quieres jugar?" the room came from (exitPath).
  // Replacing, not pushing: Back must not return to the room's address (/sala/CODE), which joins it again.
  function leaveNow() {
    const target = exitPath(room);
    setLeaveAsk(false);
    leaveRoom();
    nav(target, { replace: true });
  }

  // The match ends for everyone and the room goes back to the game menu (or to the playlist's panel, from a playlist).
  // Resolves when the room has moved; the match's screens follow it (RoomNavigator, App.jsx).
  function endToMenu() {
    return setGame(null).catch((err) => onError?.(err.message || "No se pudo volver a elegir juego"));
  }

  // One step back. Returns true when it left the room.
  function step({ fromBack = false } = {}) {
    if (toModes) {
      setGame(null).catch((err) => onError?.(err.message || "No se pudo volver a elegir juego"));
      return false;
    }
    setLeaveAsk(true);
    return false;
  }

  function press(e) {
    if (!room) return;
    e.preventDefault();
    step();
  }

  return { toModes, toMenu, inGame, asking, press, step, leaveNow, endToMenu, cancelAsk: () => setLeaveAsk(false) };
}

// Same top bar on every screen: on the left the way back and the small logo with "trivially", which goes to Inicio
// (inside a room, after asking, since it leaves the room); the volume (music and sounds) and the profile on the right. The way back is "Volver" everywhere:
//  - on the room's own screen (see `useRoomExit`): back to the game menu, or out of the room after asking;
//  - on a match's screen it is an "X" that asks in a modal before leaving (the host of a private room goes back to the
//    game menu instead of leaving);
//  - on any other page (profile...): back to the room, or to the match if one is running, and to Inicio when there is
//    no room;
//  - nothing on the home screen itself.
export default function TvTopbar() {
  const { user, room, isCentral, leaveRoom, setLeaveAsk } = useApp();
  const nav = useNavigate();
  const friends = useFriends();
  const isOwner = useIsOwner();
  const [adminOpen, setAdminOpen] = useState(false);
  const { pathname } = useLocation();
  const roomTarget = room ? roomPath(room) : null;
  const awayFromRoom = Boolean(roomTarget) && pathname !== roomTarget;
  const inMatch = Boolean(room) && room.phase !== "lobby";
  const onHome = !room && pathname === "/";
  // The logo on the left is not here on Inicio (the big one in the middle is the only one).
  const brandHidden = onHome;
  const goUp = useGoUp();
  const [modesErr, setModesErr] = useState("");
  const { toModes, toMenu, inGame, asking, press, leaveNow, endToMenu, cancelAsk } = useRoomExit({
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
    if (room) setHomeAsk(true);
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
      <Link to={roomTarget} className="tv-chip tv-chip--leave" aria-label={inMatch ? "Volver a la partida" : "Volver a la sala"}>
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="back" size={20} strokeWidth={2.6} />
        </span>
        <span className="tv-chip-name tv-chip-long">Volver</span>
      </Link>
    );
  } else if (room) {
    leaveButton = (
      <button
        type="button"
        className="tv-chip tv-chip--leave"
        aria-label={toModes ? "Volver a los juegos" : "Volver: salir de la sala"}
        aria-haspopup={toModes ? undefined : "dialog"}
        onClick={press}
      >
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="back" size={20} strokeWidth={2.6} />
        </span>
        {toModes && modesErr ? (
          <span className="tv-chip-name">{modesErr}</span>
        ) : (
          // Phones only have room for the icon (home.css).
          <span className="tv-chip-name tv-chip-long">Volver</span>
        )}
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
      {/* "Volver" out of the room, outside a match (this bar, the phones' room bar or the browser's Back): the same modal
          as the room's "Salir de la sala". */}
      <ConfirmDialog
        open={asking}
        icon={isCentral ? "tv" : "logout"}
        title={isCentral ? "¿Dejar de ser el dispositivo central?" : "¿Seguro que quieres salir?"}
        text={
          isCentral
            ? "Esta pantalla saldrá de la sala."
            : "Saldrás de la sala. Para volver a entrar necesitarás el código o el enlace de invitación."
        }
        cancelLabel="Quedarme"
        confirmLabel="Salir"
        onCancel={cancelAsk}
        onConfirm={leaveNow}
      />
      {/* The logo, inside a room: out of it (asking first) and to Inicio. */}
      <ConfirmDialog
        open={homeAsk && Boolean(room)}
        icon={isCentral ? "tv" : "logout"}
        title={isCentral ? "¿Dejar de ser el dispositivo central?" : "¿Seguro que quieres salir?"}
        text={
          isCentral
            ? "Esta pantalla saldrá de la sala y volverá al inicio."
            : inMatch
            ? "Saldrás de la sala, dejarás la partida en curso y volverás al inicio."
            : "Saldrás de la sala y volverás al inicio. Para volver a entrar necesitarás el código o el enlace de invitación."
        }
        cancelLabel={inMatch && !isCentral ? "Seguir jugando" : "Quedarme"}
        confirmLabel="Salir"
        onCancel={() => setHomeAsk(false)}
        onConfirm={leaveHome}
      />
      <ConfirmDialog
        open={leaving && inGame}
        icon={isCentral ? "tv" : toMenu ? "grid" : "logout"}
        title={isCentral ? "¿Dejar de ser el dispositivo central?" : toMenu ? "¿Volver a los juegos?" : "¿Seguro que quieres salir?"}
        text={
          isCentral
            ? "Esta pantalla saldrá de la sala y cada jugador volverá a ver la partida en su teléfono."
            : toMenu
            ? modesErr ||
              (room.phase === "finished"
                ? "Toda la sala volverá al menú de juegos."
                : "La partida se acabará para todos y la sala volverá al menú de juegos.")
            : "Saldrás de la sala y dejarás la partida en curso."
        }
        cancelLabel={isCentral ? "Seguir mostrándola" : "Seguir jugando"}
        confirmLabel={toMenu ? "Volver" : "Salir"}
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          // Back to the menu the dialog stays up until the room has moved (or says why it couldn't).
          if (toMenu) {
            endToMenu();
            return;
          }
          setLeaving(false);
          leaveNow();
        }}
      />
    </>
  );
}
