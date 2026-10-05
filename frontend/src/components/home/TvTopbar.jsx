import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { roomPath } from "../../modes/index.js";
import { useTheme } from "../../lib/theme.js";
import { PALETTES } from "../../lib/palettes.js";
import { useApp } from "../../lib/store.jsx";
import AppIcon from "./AppIcon.jsx";
import Icon from "./Icon.jsx";
import ProfileChip from "./ProfileChip.jsx";

// Same top bar on every screen: Inicio on the left (the small logo on the home screen itself, where Inicio would go
// nowhere), profile and theme toggle on the right.
export default function TvTopbar() {
  const { user, room, leaveRoom } = useApp();
  const { palette, toggleTheme } = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();
  // Away from your room (profile, another page): a shortcut back to it, or to the match if one is running.
  const roomTarget = room ? roomPath(room) : null;
  const showBack = Boolean(roomTarget) && pathname !== roomTarget;
  const inMatch = Boolean(room) && room.phase !== "lobby";
  const onHome = !room && pathname === "/";
  // Inside a room, Inicio means leaving it: the first tap asks, the second one leaves.
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!confirmLeave) return undefined;
    const timer = setTimeout(() => setConfirmLeave(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmLeave]);

  useEffect(() => {
    if (!room) setConfirmLeave(false);
  }, [room]);

  function goHome(e) {
    if (!room) return;
    e.preventDefault();
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    setConfirmLeave(false);
    leaveRoom();
    nav("/");
  }

  return (
    <header className={`tv-topbar${showBack && !confirmLeave ? " has-back" : ""}`}>
      {onHome ? (
        <Link to="/" className="tv-brand" aria-label="Trivially, inicio">
          <AppIcon small />
          <span className="tv-brand-name">trivially</span>
        </Link>
      ) : (
        <Link
          to="/"
          className={`tv-chip tv-chip--home${confirmLeave ? " is-confirm" : ""}`}
          aria-label={confirmLeave ? "Toca otra vez para salir de la sala e ir al inicio" : "Volver al inicio"}
          onClick={goHome}
        >
          <span className="tv-avatar tv-avatar--empty">
            <Icon name={confirmLeave ? "logout" : "home"} size={18} />
          </span>
          <span className="tv-chip-name">{confirmLeave ? "¿Salir de la sala?" : "Inicio"}</span>
        </Link>
      )}
      {showBack && !confirmLeave && (
        <Link to={roomTarget} className="tv-chip tv-chip--back" aria-label={inMatch ? "Volver a la partida" : "Volver a la sala"}>
          <span className="tv-avatar tv-avatar--empty">
            <Icon name={inMatch ? "play" : "users"} size={18} filled={inMatch} />
          </span>
          {/* Phones only have room for "Volver" (home.css). */}
          <span className="tv-chip-name tv-chip-long">{inMatch ? "Volver a la partida" : "Volver a la sala"}</span>
          <span className="tv-chip-name tv-chip-short">Volver</span>
        </Link>
      )}
      <div className="tv-topbar-end">
        <ProfileChip user={user} />
        {/* Same chip as Inicio and Entrar: icon in a circle, then the label. */}
        <button
          type="button"
          className="tv-chip tv-chip--theme"
          onClick={toggleTheme}
          aria-label={`Colores: opción ${palette.id} (${palette.name}), ${PALETTES.length} en total. Toca para la siguiente.`}
          title={palette.name}
        >
          <span className="tv-avatar tv-avatar--empty">
            <Icon name={palette.theme === "dark" ? "moon" : "sun"} size={18} />
          </span>
          <span className="tv-chip-name">Opción {palette.id}</span>
        </button>
      </div>
    </header>
  );
}
