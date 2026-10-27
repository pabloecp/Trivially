import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/store.jsx";
import "../../styles/admin.css";

/**
 * A public match asks a player who gave no sign of life for several rounds if they are still there (the server sends
 * `afkUntil` on their own seat, RoomManager.askStillThere). Any answer, or "Sigo aquí", keeps them in; with none before
 * the time is up they are taken out of the match.
 */
export default function StillThere() {
  const { room, user, isCentral, stillHere } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const me = room?.matchmaking && !isCentral ? room.players?.find((p) => p.id === user?.id) : null;
  const until = me?.afkUntil || 0;

  useEffect(() => {
    if (!until) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until]);

  const left = until ? Math.ceil((until - (now + (room.clockOffset || 0))) / 1000) : 0;
  if (!until || left <= 0 || room.phase === "finished") return null;

  return createPortal(
    <div className="tv-afk-root" role="alertdialog" aria-modal="true" aria-labelledby="tv-afk-title">
      <div className="tv-afk-backdrop" />
      <div className="tv-afk">
        <h2 id="tv-afk-title">¿Sigues ahí?</h2>
        <p>
          Llevas varias rondas sin responder. Si no confirmas en <strong>{left} s</strong>, te sacamos de la partida.
        </p>
        <button type="button" className="tv-btn tv-btn--primary" data-sound="none" onClick={() => stillHere()} autoFocus>
          Sigo aquí
        </button>
      </div>
    </div>,
    document.querySelector(".tv-app") || document.body
  );
}
