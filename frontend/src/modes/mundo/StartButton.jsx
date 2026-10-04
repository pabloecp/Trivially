import { useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";
import { geoConfig } from "./geoInfo.js";

// "Comenzar partida" for Geografía. Shown right under the players in the room card (PartyPanel).
export default function StartButton({ room }) {
  const { user, startGame } = useApp();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isHost = room.hostId === user?.id;
  // A match needs a different question for every round (the server checks it too).
  const enough = room.questionsReady == null || room.questionsReady >= geoConfig(room).rounds;
  const canStart = room.players.some((p) => p.connected) && enough && !busy;

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
      <p className="tv-party-status">
        <span className="tv-pulse" aria-hidden="true" />
        Esperando a que {room.hostName || "el anfitrión"} comience la partida…
      </p>
    );
  }

  return (
    <>
      {err && <p className="tv-lobby-error">{err}</p>}
      <button className="tv-btn tv-btn--block tv-c-world" onClick={onStart} disabled={!canStart} type="button">
        <Icon name="play" size={20} filled strokeWidth={1.5} />
        {busy ? "Empezando…" : "Comenzar partida"}
      </button>
    </>
  );
}
