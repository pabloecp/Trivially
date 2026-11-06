import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import { profilePath } from "./PlayerName.jsx";

// What tapping a player offers on a match's scoreboard, the same buttons and order as "Tu grupo" (GroupSheet), only their
// icons: for the host, taking them out of the room (for good) and, only while the room waits (`inMatch` false), letting
// them change the settings or not and making them the host (a second tap confirms it); and for everyone their profile
// (faded and doing nothing on a guest, who has none).
export default function PlayerMenu({ player, isMe, canManage, inMatch = false, onClose, onToast }) {
  const { toggleConfigPermission, kickPlayer, giveHost } = useApp();
  const ref = useRef(null);
  const [confirmHost, setConfirmHost] = useState(false);

  // The whole menu in sight: the list scrolls to it when it opens near the bottom.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
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

  async function makeHost() {
    if (!confirmHost) {
      setConfirmHost(true);
      return;
    }
    onClose();
    try {
      await giveHost(player.id);
      onToast?.(`${player.name} ahora es el anfitrión`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo pasar el anfitrión");
    }
  }

  async function kick() {
    onClose();
    try {
      await kickPlayer(player.id);
      onToast?.(`Sacaste a ${player.name} de la partida`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo sacar al jugador");
    }
  }

  // Few buttons (a match's two at most) have room for their names; the four of a room waiting are only icons.
  const named = !canManage || inMatch;

  return (
    <div ref={ref} className="tv-player-menu" role="menu">
      {canManage && !inMatch && (
        <button
          type="button"
          role="menuitem"
          className={`tv-iconbtn tv-iconbtn--sm${player.canEditConfig ? " is-on" : ""}`}
          aria-label={`${player.canEditConfig ? "Quitarle" : "Darle"} a ${player.name} permiso de ajustes`}
          title={player.canEditConfig ? "Quitar permiso de ajustes" : "Dar permiso de ajustes"}
          onClick={togglePermission}
        >
          <Icon name="sliders" size={16} strokeWidth={2.6} />
        </button>
      )}
      {canManage && (
        <button type="button" role="menuitem" className="tv-iconbtn tv-iconbtn--sm" aria-label={`Sacar a ${player.name} de la partida`} title="Sacar de la partida" onClick={kick}>
          <Icon name="close" size={16} strokeWidth={2.8} />
          {named && "Sacar"}
        </button>
      )}
      {canManage && !inMatch && player.connected && (
        <button
          type="button"
          role="menuitem"
          className={`tv-iconbtn tv-iconbtn--sm${confirmHost ? " is-on" : ""}`}
          data-sound={confirmHost ? "next" : undefined}
          aria-label={confirmHost ? "¿Seguro? Toca otra vez" : `Hacer anfitrión a ${player.name}`}
          title={confirmHost ? "¿Seguro? Toca otra vez" : "Hacer anfitrión"}
          onClick={makeHost}
        >
          <Icon name={confirmHost ? "check" : "crown"} size={16} strokeWidth={2.4} />
        </button>
      )}
      {player.isGuest ? (
        <button type="button" role="menuitem" className="tv-iconbtn tv-iconbtn--sm is-none" aria-disabled="true" aria-label={`${player.name} juega como invitado: no tiene perfil`} title="Juega como invitado: no tiene perfil">
          <Icon name="user" size={16} strokeWidth={2.6} />
          {named && "Sin perfil"}
        </button>
      ) : (
        // Same tab: the socket stays connected, so the seat is kept, and the profile has a way back to the room.
        <Link role="menuitem" className="tv-iconbtn tv-iconbtn--sm" to={profilePath(player)} aria-label={isMe ? "Ver mi perfil" : `Ver el perfil de ${player.name}`} title={isMe ? "Ver mi perfil" : "Ver perfil"} onClick={onClose}>
          <Icon name="user" size={16} strokeWidth={2.6} />
          {named && (isMe ? "Mi perfil" : "Perfil")}
        </Link>
      )}
    </div>
  );
}
