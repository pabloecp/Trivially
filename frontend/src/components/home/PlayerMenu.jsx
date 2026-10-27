import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { useFriends } from "../../lib/friends.jsx";
import Icon from "./Icon.jsx";
import { profilePath } from "./PlayerName.jsx";

// What tapping a player offers, in the room card and on the live scoreboard: their profile (registered players),
// and for the host, letting them change the match settings or not, making them the host (a second tap confirms it)
// taking them out of the room (they can come back with the code) and blocking them (a second tap confirms it: they
// can't join the room again). `canCentral` (the host or a player with the settings permission, while the room
// waits): making that player's device the room's central device, the same as dragging them onto the spot; your own
// too ("Usar mi pantalla como central"; if you're the host, the host role passes to the next player).
export default function PlayerMenu({ player, isMe, canManage, canCentral = false, onClose, onToast }) {
  const { toggleConfigPermission, kickPlayer, blockPlayer, giveHost, makeCentral } = useApp();
  const friends = useFriends();
  const ref = useRef(null);
  const [confirmHost, setConfirmHost] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

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

  // "Añadir amigo": only between two accounts.
  const relation = friends.relationTo(player.id);
  async function addFriend() {
    onClose();
    try {
      const res = await friends.requestUser(player.id);
      onToast?.(res.status === "accepted" ? `¡Ahora ${player.name} y tú son amigos!` : `Le enviaste una solicitud a ${player.name}`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo enviar la solicitud");
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

  async function toCentral() {
    onClose();
    try {
      await makeCentral(player.id);
      onToast?.(isMe ? "Tu pantalla es ahora el dispositivo central" : `La pantalla de ${player.name} es ahora el dispositivo central`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo cambiar el dispositivo central");
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

  async function block() {
    if (!confirmBlock) {
      setConfirmBlock(true);
      return;
    }
    onClose();
    try {
      await blockPlayer(player.id);
      onToast?.(`Bloqueaste a ${player.name}: ya no puede volver a esta sala`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo bloquear al jugador");
    }
  }

  return (
    <div ref={ref} className="tv-player-menu" role="menu">
      {player.isGuest ? (
        <p className="tv-player-menu-note">{isMe ? "Juegas como invitado" : "Juega como invitado"}</p>
      ) : (
        // Same tab: the socket stays connected, so the seat is kept, and the profile has a way back to the room.
        <Link role="menuitem" className="tv-player-menu-item" to={profilePath(player.id)} onClick={onClose}>
          <Icon name="user" size={16} strokeWidth={2.6} />
          {isMe ? "Ver mi perfil" : "Ver perfil"}
        </Link>
      )}
      {friends.isAccount && !isMe && !player.isGuest && (
        <button
          type="button"
          role="menuitem"
          className="tv-player-menu-item"
          onClick={addFriend}
          disabled={relation === "friends" || relation === "asked"}
        >
          <Icon name={relation === "friends" ? "check" : "plus"} size={16} strokeWidth={2.8} />
          {relation === "friends" ? "Ya son amigos" : relation === "asked" ? "Solicitud enviada" : relation === "asking" ? "Aceptar como amigo" : "Añadir amigo"}
        </button>
      )}
      {canManage && (
        <button type="button" role="menuitem" className="tv-player-menu-item" onClick={togglePermission}>
          <Icon name={player.canEditConfig ? "lock" : "check"} size={16} strokeWidth={2.8} />
          {player.canEditConfig ? "Quitar permiso de ajustes" : "Dar permiso de ajustes"}
        </button>
      )}
      {canManage && player.connected && (
        <button
          type="button"
          role="menuitem"
          className={`tv-player-menu-item${confirmHost ? " is-confirm" : ""}`}
          data-sound={confirmHost ? "next" : undefined}
          onClick={makeHost}
        >
          <Icon name="crown" size={16} strokeWidth={2.2} />
          {confirmHost ? "¿Seguro? Toca otra vez" : "Hacer anfitrión"}
        </button>
      )}
      {canCentral && player.connected && (
        <button type="button" role="menuitem" className="tv-player-menu-item" onClick={toCentral}>
          <Icon name="tv" size={16} strokeWidth={2.4} />
          {isMe ? "Usar mi pantalla como central" : "Usar su pantalla como central"}
        </button>
      )}
      {canManage && (
        <button type="button" role="menuitem" className="tv-player-menu-item tv-player-menu-item--danger" onClick={kick}>
          <Icon name="logout" size={16} strokeWidth={2.6} />
          Sacar de la sala
        </button>
      )}
      {canManage && (
        <button
          type="button"
          role="menuitem"
          className={`tv-player-menu-item tv-player-menu-item--danger${confirmBlock ? " is-confirm" : ""}`}
          data-sound={confirmBlock ? "next" : undefined}
          onClick={block}
        >
          <Icon name="close" size={16} strokeWidth={2.8} />
          {confirmBlock ? "¿Seguro? No podrá volver" : "Bloquear"}
        </button>
      )}
    </div>
  );
}
