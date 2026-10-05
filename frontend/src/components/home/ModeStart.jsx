import { useState } from "react";
import Dots from "./Dots.jsx";
import Icon from "./Icon.jsx";
import { useApp } from "../../lib/store.jsx";

// "Comenzar partida" at the bottom of a game's big card (ModeStage); everyone else sees that they're waiting for
// the host. `ready` is false while the game can't start yet (not enough songs or questions; the server checks too).
export default function ModeStart({ room, ready = true }) {
  const { user, startGame } = useApp();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isHost = room.hostId === user?.id;
  const canStart = room.players.some((p) => p.connected) && ready && !busy;

  async function onStart() {
    setErr("");
    setBusy(true);
    try {
      await startGame();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isHost) {
    return (
      <p className="tv-mstage-wait">
        Esperando a que {room.hostName || "el anfitrión"} comience la partida
        <Dots />
      </p>
    );
  }

  return (
    <>
      {err && <p className="tv-lobby-error">{err}</p>}
      <button className="tv-mstage-start tv-shine" onClick={onStart} disabled={!canStart} type="button">
        <Icon name="play" size={22} filled strokeWidth={1.5} />
        {busy ? "Empezando…" : "Comenzar partida"}
      </button>
    </>
  );
}
