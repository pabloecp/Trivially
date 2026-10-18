import { useEffect, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import "../../styles/central.css";

/**
 * "Dispositivo central", at the top of the room's column while the room has one: whose screen shows the match while
 * the players answer from their phones (picked from a player's menu, "Usar su pantalla como central"). The host or a
 * player with the settings permission (`canEdit`) takes it off with the X; mid-match it asks first. (The players asking
 * to use another device as it are CentralRequests', on every screen.)
 */
export default function CentralSpot({ room, canEdit, onToast }) {
  const { removeCentral } = useApp();
  const central = room.central;
  const lobby = room.phase === "lobby";
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    if (!confirmOff) return undefined;
    const t = setTimeout(() => setConfirmOff(false), 3000);
    return () => clearTimeout(t);
  }, [confirmOff]);

  if (!central) return null;

  async function takeOff() {
    // Mid-match it changes every player's screen, so it asks first there.
    if (!lobby && !confirmOff) {
      setConfirmOff(true);
      return;
    }
    setConfirmOff(false);
    try {
      await removeCentral();
      onToast?.("Cada uno vuelve a jugar en su pantalla", "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo quitar el dispositivo central");
    }
  }

  return (
    <div className={`tv-central-spot is-set${central.connected ? "" : " is-away"}`} aria-live="polite">
      <span className="tv-central-spot-icon">
        <Avatar name={central.name} avatar={central.avatar} />
        <span className="tv-central-spot-badge">
          <Icon name="tv" size={11} strokeWidth={3} />
        </span>
      </span>
      <span className="tv-central-spot-text">
        <strong>Dispositivo central</strong>
        <span>{central.connected ? `Pantalla de ${central.name}` : `Pantalla de ${central.name} · Reconectando…`}</span>
      </span>
      {canEdit && (
        <button
          type="button"
          className={`tv-central-spot-x${confirmOff ? " is-confirm" : ""}`}
          data-sound="back"
          onClick={takeOff}
          aria-label={confirmOff ? "Toca otra vez para quitar el dispositivo central" : "Quitar el dispositivo central"}
        >
          {confirmOff ? "¿Quitar?" : <Icon name="close" size={16} strokeWidth={3} />}
        </button>
      )}
    </div>
  );
}
