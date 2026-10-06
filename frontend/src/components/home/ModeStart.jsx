import { useState } from "react";
import Icon from "./Icon.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../../modes/index.js";

// Starting the room's match, shared by the button on the game's card and the phone's bottom bar (RoomDock).
// `canStart` is false while nothing is picked, nobody is connected or the game isn't ready yet (not enough songs or
// questions: the mode's `ready`; the server checks too).
export function useStartGame(room) {
  const { user, startGame } = useApp();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const mode = findMode(room.game);
  const isHost = room.hostId === user?.id;
  const ready = Boolean(mode?.available) && (mode.ready ? mode.ready(room) : true);
  const canStart = isHost && room.players.some((p) => p.connected) && ready && !busy;

  async function start() {
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

  return { isHost, canStart, busy, err, start };
}

// "Comenzar partida" at the bottom of a game's big card (ModeStage); everyone else sees that they're waiting for
// the host. Phones hide it: their bottom bar has the same button.
export default function ModeStart({ room }) {
  const { isHost, canStart, busy, err, start } = useStartGame(room);

  if (!isHost) {
    return (
      <p className="tv-mstage-wait">
        Esperando a que {room.hostName || "el anfitrión"} comience la partida
      </p>
    );
  }

  return (
    <>
      {err && <p className="tv-lobby-error">{err}</p>}
      <button className="tv-mstage-start tv-shine" onClick={start} disabled={!canStart} type="button">
        <Icon name="play" size={22} filled strokeWidth={1.5} />
        {busy ? "Empezando…" : "Comenzar partida"}
      </button>
    </>
  );
}
