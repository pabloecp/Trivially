import { useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";

// "Comenzar partida" for the music mode. Shown right under the players in the room card (PartyPanel).
export default function StartButton({ room }) {
  const { user, startGame } = useApp();
  const [err, setErr] = useState("");
  const isHost = room.hostId === user?.id;
  // A match needs a different song for every round (the server checks it too; older servers don't send songsReady).
  const enoughSongs = room.songsReady == null || room.songsReady >= (room.config?.rounds || 10);
  const canStart = room.players.some((p) => p.connected) && enoughSongs;

  async function onStart() {
    setErr("");
    try {
      await startGame();
    } catch (e) {
      setErr(e.message);
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
      <button className="tv-btn tv-btn--block tv-c-green" onClick={onStart} disabled={!canStart} type="button">
        <Icon name="play" size={20} filled strokeWidth={1.5} />
        Comenzar partida
      </button>
    </>
  );
}
