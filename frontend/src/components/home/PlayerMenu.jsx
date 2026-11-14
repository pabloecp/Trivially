import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import { profilePath } from "./PlayerName.jsx";

import { translate as tr } from "../../lib/i18n.js";
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
      onToast?.(res?.granted ? tr("{name} ya puede cambiar los ajustes", { name: player.name }) : tr("{name} ya no puede cambiar los ajustes", { name: player.name }), "check");
    } catch (err) {
      onToast?.(err.message || tr("No se pudieron cambiar los permisos"));
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
      onToast?.(tr("{name} ahora es el anfitrión", { name: player.name }), "check");
    } catch (err) {
      onToast?.(err.message || tr("No se pudo pasar el anfitrión"));
    }
  }

  async function kick() {
    onClose();
    try {
      await kickPlayer(player.id);
      onToast?.(tr("Sacaste a {name} de la partida", { name: player.name }), "check");
    } catch (err) {
      onToast?.(err.message || tr("No se pudo sacar al jugador"));
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
          aria-label={tr("{v0} a {name} permiso de ajustes", { v0: player.canEditConfig ? tr("Quitarle") : tr("Darle"), name: player.name })}
          title={player.canEditConfig ? tr("Quitar permiso de ajustes") : tr("Dar permiso de ajustes")}
          onClick={togglePermission}
        >
          <Icon name="sliders" size={16} strokeWidth={2.6} />
        </button>
      )}
      {canManage && (
        <button type="button" role="menuitem" className="tv-iconbtn tv-iconbtn--sm" aria-label={tr("Sacar a {name} de la partida", { name: player.name })} title={tr("Sacar de la partida")} onClick={kick}>
          <Icon name="close" size={16} strokeWidth={2.8} />
          {named && tr("Sacar")}
        </button>
      )}
      {canManage && !inMatch && player.connected && (
        <button
          type="button"
          role="menuitem"
          className={`tv-iconbtn tv-iconbtn--sm${confirmHost ? " is-on" : ""}`}
          data-sound={confirmHost ? "next" : undefined}
          aria-label={confirmHost ? tr("¿Seguro? Toca otra vez") : tr("Hacer anfitrión a {name}", { name: player.name })}
          title={confirmHost ? tr("¿Seguro? Toca otra vez") : tr("Hacer anfitrión")}
          onClick={makeHost}
        >
          <Icon name={confirmHost ? "check" : "crown"} size={16} strokeWidth={2.4} />
        </button>
      )}
      {player.isGuest ? (
        <button type="button" role="menuitem" className="tv-iconbtn tv-iconbtn--sm is-none" aria-disabled="true" aria-label={tr("{name} juega como invitado: no tiene perfil", { name: player.name })} title={tr("Juega como invitado: no tiene perfil")}>
          <Icon name="user" size={16} strokeWidth={2.6} />
          {named && tr("Sin perfil")}
        </button>
      ) : (
        // Same tab: the socket stays connected, so the seat is kept, and the profile has a way back to the room.
        <Link role="menuitem" className="tv-iconbtn tv-iconbtn--sm" to={profilePath(player)} aria-label={isMe ? tr("Ver mi perfil") : tr("Ver el perfil de {name}", { name: player.name })} title={isMe ? tr("Ver mi perfil") : tr("Ver perfil")} onClick={onClose}>
          <Icon name="user" size={16} strokeWidth={2.6} />
          {named && (isMe ? tr("Mi perfil") : tr("Perfil"))}
        </Link>
      )}
    </div>
  );
}
