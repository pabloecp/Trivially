import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../lib/theme.js";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import ProfileChip from "./ProfileChip.jsx";

// Same top bar on every screen: Inicio on the left, profile and theme toggle on the right.
export default function TvTopbar() {
  const { user, room, leaveRoom } = useApp();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();
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
    <header className="tv-topbar">
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
      <div className="tv-topbar-end">
        <ProfileChip user={user} />
        <button
          type="button"
          className="tv-icon-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={22} />
        </button>
      </div>
    </header>
  );
}
