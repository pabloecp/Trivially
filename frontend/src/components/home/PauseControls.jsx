import Icon from "./Icon.jsx";
import { useApp } from "../../lib/store.jsx";

// The host's "Pausar" / "Reanudar", next to "Terminar" on every game's screen: it stops the clock for everyone
// (RoomManager.pause), and nobody can answer until it goes on. On phones only its icon shows, so the round's title
// keeps its room.
export function PauseButton({ room, isHost, onError }) {
  const { pauseGame } = useApp();
  if (!isHost || !["countdown", "playing", "reveal"].includes(room?.phase)) return null;
  return (
    <button
      type="button"
      className={`tv-mini-btn tv-pause-btn${room.paused ? " is-on" : ""}`}
      onClick={() => pauseGame(!room.paused).catch((e) => onError?.(e.message || "No se pudo pausar la partida"))}
      title={room.paused ? "La partida sigue donde se quedó" : "Detiene el tiempo para todos"}
      aria-label={room.paused ? "Reanudar" : "Pausar"}
    >
      <Icon name={room.paused ? "play" : "pause"} size={13} filled strokeWidth={0} />
      <span className="tv-pause-label">{room.paused ? "Reanudar" : "Pausar"}</span>
    </button>
  );
}

// Over a game's stage while the match is paused, so nobody tries to answer.
export function PauseVeil({ room, isHost }) {
  if (!room?.paused) return null;
  return (
    <div className="tv-pause-veil" role="status">
      <Icon name="pause" size={30} filled strokeWidth={0} />
      <strong>Partida en pausa</strong>
      <span>{isHost ? "Toca ▶ arriba para seguir." : "El anfitrión la reanudará en breve."}</span>
    </div>
  );
}
