import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import { profilePath } from "./PlayerName.jsx";

// What tapping a player offers, in the room card and on the live scoreboard: their profile (registered players),
// and for the host, letting them change the match settings or not.
export default function PlayerMenu({ player, isMe, canManage, onClose, onToast }) {
  const { toggleConfigPermission, kickPlayer } = useApp();
  const ref = useRef(null);

  useEffect(() => {
    const away = (e) => {
      if (!ref.current?.parentElement?.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  async function togglePermission() {
    onClose();
    try {
      const res = await toggleConfigPermission(player.id);
      onToast?.(res?.granted ? `${player.name} ya puede cambiar los ajustes` : `${player.name} ya no puede cambiar los ajustes`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudieron cambiar los permisos");
    }
  }

  async function kick() {
    onClose();
    try {
      await kickPlayer(player.id);
      onToast?.(`Sacaste a ${player.name} de la sala`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo sacar al jugador");
    }
  }

  return (
    <div ref={ref} className="tv-player-menu" role="menu">
      {player.isGuest ? (
        <p className="tv-player-menu-note">{isMe ? "Juegas como invitado" : "Juega como invitado"}: sin perfil</p>
      ) : (
        // Same tab: the socket stays connected, so the seat is kept, and the profile has a way back to the room.
        <Link role="menuitem" className="tv-player-menu-item" to={profilePath(player.id)} onClick={onClose}>
          <Icon name="user" size={16} strokeWidth={2.6} />
          {isMe ? "Ver mi perfil" : "Ver perfil"}
        </Link>
      )}
      {canManage && (
        <button type="button" role="menuitem" className="tv-player-menu-item" onClick={togglePermission}>
          <Icon name={player.canEditConfig ? "lock" : "check"} size={16} strokeWidth={2.8} />
          {player.canEditConfig ? "Quitar permiso de ajustes" : "Dar permiso de ajustes"}
        </button>
      )}
      {canManage && (
        <button type="button" role="menuitem" className="tv-player-menu-item tv-player-menu-item--danger" onClick={kick}>
          <Icon name="logout" size={16} strokeWidth={2.6} />
          Sacar de la sala
        </button>
      )}
    </div>
  );
}
