import { useState } from "react";
import Dots from "../../components/home/Dots.jsx";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";

// "Comenzar partida" for the music mode, at the bottom of the mode's big card (LobbyPanel). Everyone else sees
// that they're waiting for the host.
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
        Comenzar partida
      </button>
    </>
  );
}
