import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import { Podium } from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import TvShell from "../../components/home/TvShell.jsx";
import { useApp } from "../../lib/store.jsx";
import { PlaylistProgress, PlaylistStandings, winsText } from "./Standings.jsx";
import "../../styles/home.css";
import "../../styles/playlist.css";

// The end of a playlist (route /playlist/:code): who won the most games, on the podium, the games played with their
// winners and the whole tally. The host can play the playlist again (shuffled again if it's random) or go back to its
// panel to change it.
function ResultsScreen() {
  const { code } = useParams();
  const { user, room, isCentral, joinRoom, replayGame, restartGame } = useApp();
  const nav = useNavigate();
  const [err, setErr] = useState("");

  // Join the room after a reload. Going back to the room screen is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (!room || room.code !== code) joinRoom(code).catch(() => nav("/"));
  }, [code]);

  if (!room) {
    return (
      <div className="tv-card tv-lobby-guest">
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          Conectando a la sala…
        </p>
      </div>
    );
  }

  // The room's central device only shows the results; what comes next is the host's.
  const isHost = room.hostId === user?.id && !isCentral;
  const run = room.run;
  const standings = run?.standings || [];
  const winner = standings.find((p) => p.id === run?.winnerId) || null;
  const solo = standings.length < 2;
  let title = "¡Fin de la playlist!";
  if (winner && !solo) title = `¡${winner.name} gana la playlist!`;
  else if (!winner && standings[0]?.wins > 0) title = "¡Empate!";
  // Played "aleatorio", the playlist was one match with every game's rounds mixed: the most points win.
  const mixed = Boolean(run?.mixed);
  const pointsText = (p) => `${p.points.toLocaleString("es-ES")} pts`;
  let hint = null;
  if (mixed && winner) hint = `${pointsText(winner)} en ${run.total === 1 ? "1 juego" : `${run.total} juegos`} mezclados`;
  else if (mixed && standings[0]?.wins > 0) hint = "Mismos puntos";
  else if (winner && solo) hint = `Ganaste ${run.played.filter((g) => g.winnerId === winner.id).length} de ${run.total} juegos`;
  else if (winner) hint = `${winsText(winner.wins)} de ${run.total}`;
  else if (standings[0]?.wins > 0) hint = "Mismos juegos ganados y mismos puntos";

  return (
    <div className="tv-room tv-game">
      <div className="tv-room-main">
        <section className="tv-game-stage tv-results is-playlist">
          <Confetti />
          <header className="tv-results-head">
            <p className="tv-mono-label">Playlist terminada{run ? ` · ${run.name}` : ""}</p>
            <h1 className="tv-page-title tv-results-title">{title}</h1>
            {hint && <p className="tv-hint">{hint}</p>}
          </header>

          {run && (
            <>
              <Podium players={standings} score={mixed ? pointsText : (p) => winsText(p.wins)} />
              {!mixed && <PlaylistProgress run={run} />}
              <PlaylistStandings run={run} />
            </>
          )}

          {err && <p className="tv-lobby-error" role="alert">{err}</p>}

          <div className="tv-results-actions">
            {isHost ? (
              <>
                {run && (
                  <button
                    className="tv-btn tv-btn--block tv-c-playlist tv-shine"
                    onClick={() => replayGame().catch((e) => setErr(e.message || "No se pudo empezar otra vez la playlist"))}
                    type="button"
                  >
                    <Icon name={run.order === "aleatorio" ? "shuffle" : "play"} size={20} strokeWidth={2.6} />
                    Jugar otra vez
                  </button>
                )}
                <button
                  className="tv-btn tv-btn--block tv-c-neutral"
                  data-sound="back"
                  onClick={() => restartGame().catch((e) => setErr(e.message || "No se pudo volver al lobby"))}
                  type="button"
                >
                  <Icon name="back" size={18} />
                  Volver a la playlist
                </button>
              </>
            ) : (
              <p className="tv-mstage-wait tv-results-wait">Esperando a que el anfitrión decida qué jugar</p>
            )}
          </div>
        </section>
      </div>
      <PartyPanel room={room} display={isCentral} onToast={setErr} />
    </div>
  );
}

export default function PlaylistResults() {
  return (
    <TvShell mode="playlist">
      <ResultsScreen />
    </TvShell>
  );
}
