import { useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import Confetti from "./Confetti.jsx";
import CountUp from "./CountUp.jsx";
import Icon from "./Icon.jsx";
import PartyPanel from "./PartyPanel.jsx";
import PlayerName from "./PlayerName.jsx";
import { useApp } from "../../lib/store.jsx";
import { withSound } from "../../lib/sounds.js";
import { findMode } from "../../modes/index.js";
import { PlaylistProgress, PlaylistStandings } from "../../modes/playlist/Standings.jsx";

// The podium of a match (or of a playlist): first place in the middle, second and third on each side. `players` are
// in final position; `score(p)` is what shows under each name (the points, by default).
export function Podium({ players, score = (p) => <><CountUp value={p.score} /> pts</> }) {
  const podium = [players[1], players[0], players[2]]; // 2nd, 1st, 3rd
  return (
    <div className="tv-podium" role="list" aria-label="Podio">
      {podium.map((p, i) => {
        const place = i === 1 ? 1 : i === 0 ? 2 : 3;
        if (!p) return <div key={place} className="tv-podium-spot is-empty" aria-hidden="true" />;
        return (
          <div key={p.id} role="listitem" className={`tv-podium-spot is-${place}`}>
            <span className="tv-podium-avatar">
              {place === 1 && <Icon name="crown" size={30} filled strokeWidth={1.6} className="tv-podium-crown" />}
              <Avatar name={p.name} avatar={p.avatar} className={place === 1 ? "tv-avatar--lg" : ""} />
            </span>
            <PlayerName player={p} className="tv-podium-name" />
            <span className="tv-podium-score">{score(p)}</span>
            <div className="tv-podium-block">
              <span className="tv-podium-place">{place}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The end of a match in any game, in the room's frame: the podium and what to do next, with everyone's results in
// the room's column (PartyPanel). `color` is the mode's tile colour for the host's main button. The host can play
// again straight away (same game, same settings) or go back to the game's lobby to change them. A game of a playlist
// says which one it was, shows the playlist's tally, and the host goes on to the next game (or, after the last one,
// to the playlist's winner) or ends the playlist.
export default function MatchResults({ room, color = "green" }) {
  const { user, isCentral, restartGame, replayGame, nextInPlaylist } = useApp();
  const [err, setErr] = useState("");
  // "Terminar playlist" throws away the tally, so it asks first: a second tap within 3 s.
  const [confirmEnd, setConfirmEnd] = useState(false);
  // The room's central device shows the results; what comes next is the host's, from their phone.
  const isHost = room.hostId === user?.id && !isCentral;
  const run = room.run && !room.run.finished ? room.run : null;
  const last = Boolean(run) && run.index + 1 >= run.total;
  const nextMode = run && !last ? findMode(run.games[run.index + 1]) : null;

  useEffect(() => {
    if (!confirmEnd) return undefined;
    const t = setTimeout(() => setConfirmEnd(false), 3000);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  const top = room.results;
  const winner = top[0];
  // Geografía settles a tie for first place with tiebreak rounds; if none of them had a winner, the tie stands.
  const tied = Boolean(room.tiebreak) && !winner?.tiebreakWinner && top.length > 1 && top[1].score === winner.score;

  function endPlaylist() {
    if (!confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    setConfirmEnd(false);
    restartGame().catch((e) => setErr(e.message || "No se pudo terminar la playlist"));
  }

  return (
    <div className="tv-room tv-game">
      <div className="tv-room-main">
        <section className={`tv-game-stage tv-results${run ? " is-playlist" : ""}`}>
          <Confetti />
          <header className="tv-results-head">
            <p className="tv-mono-label">{run ? `${run.name} · Juego ${run.index + 1} de ${run.total}` : "Partida terminada"}</p>
            <h1 className="tv-page-title tv-results-title">
              {tied ? "¡Empate!" : top.length > 1 ? `¡Ganó ${winner?.name}!` : "¡Fin de la partida!"}
            </h1>
            {winner?.tiebreakWinner && <p className="tv-hint">Ganó en el desempate</p>}
          </header>

          <Podium players={top} />

          {run && (
            <>
              <PlaylistProgress run={run} />
              <PlaylistStandings run={run} />
            </>
          )}

          {err && <p className="tv-lobby-error" role="alert">{err}</p>}

          <div className="tv-results-actions">
            {isHost && run ? (
              <>
                <button
                  className={`tv-btn tv-btn--block tv-c-${nextMode?.color || "playlist"} tv-shine`}
                  onClick={() => nextInPlaylist().catch((e) => setErr(e.message || "No se pudo seguir con la playlist"))}
                  type="button"
                >
                  <Icon name={last ? "crown" : nextMode?.icon || "play"} size={20} filled={last} strokeWidth={last ? 1.6 : 2.4} />
                  {last ? "Ver ganador de la playlist" : `Siguiente: ${nextMode?.name || "otro juego"}`}
                </button>
                <button
                  className={`tv-btn tv-btn--block ${confirmEnd ? "tv-c-danger" : "tv-c-neutral"}`}
                  data-sound="back"
                  onClick={endPlaylist}
                  type="button"
                >
                  <Icon name={confirmEnd ? "close" : "back"} size={18} />
                  {confirmEnd ? "Toca otra vez para terminarla" : "Terminar playlist"}
                </button>
              </>
            ) : isHost ? (
              <>
                <button
                  className={`tv-btn tv-btn--block tv-c-${color} tv-shine`}
                  onClick={() => withSound(replayGame).catch((e) => setErr(e.message || "No se pudo empezar otra partida"))}
                  type="button"
                  data-sound="none"
                >
                  <Icon name="play" size={20} filled strokeWidth={1.5} />
                  Volver a jugar
                </button>
                <button
                  className="tv-btn tv-btn--block tv-c-neutral"
                  data-sound="back"
                  onClick={() => restartGame().catch((e) => setErr(e.message || "No se pudo volver al lobby"))}
                  type="button"
                >
                  <Icon name="back" size={18} />
                  Volver al lobby
                </button>
              </>
            ) : (
              <p className="tv-mstage-wait tv-results-wait">
                {run
                  ? last
                    ? `Esperando a que ${room.hostName || "el anfitrión"} muestre el ganador de la playlist`
                    : `Esperando a que ${room.hostName || "el anfitrión"} siga con la playlist`
                  : "Esperando a que el anfitrión decida qué jugar"}
              </p>
            )}
          </div>
        </section>
      </div>
      <PartyPanel room={room} scores display={isCentral} onToast={setErr} />
    </div>
  );
}
