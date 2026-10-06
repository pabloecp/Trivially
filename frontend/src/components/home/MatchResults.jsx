import { useState } from "react";
import Avatar from "./Avatar.jsx";
import Confetti from "./Confetti.jsx";
import CountUp from "./CountUp.jsx";
import Icon from "./Icon.jsx";
import PartyPanel from "./PartyPanel.jsx";
import PlayerName from "./PlayerName.jsx";
import { useApp } from "../../lib/store.jsx";

// The end of a match in any game, in the room's frame: the podium and what to do next, with everyone's results in
// the room's column (PartyPanel). `color` is the mode's tile colour for the host's main button.
export default function MatchResults({ room, color = "green" }) {
  const { user, restartGame, setGame } = useApp();
  const [err, setErr] = useState("");
  const isHost = room.hostId === user?.id;

  const top = room.results;
  const winner = top[0];
  const podium = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd
  // Geografía settles a tie for first place with tiebreak rounds; if none of them had a winner, the tie stands.
  const tied = Boolean(room.tiebreak) && !winner?.tiebreakWinner && top.length > 1 && top[1].score === winner.score;

  return (
    <div className="tv-room tv-game">
      <div className="tv-room-main">
        <section className="tv-game-stage tv-results">
          <Confetti />
          <header className="tv-results-head">
            <p className="tv-mono-label">Partida terminada</p>
            <h1 className="tv-page-title tv-results-title">
              {tied ? "¡Empate!" : top.length > 1 ? `¡Ganó ${winner?.name}!` : "¡Fin de la partida!"}
            </h1>
            {winner?.tiebreakWinner && <p className="tv-hint">Ganó en el desempate</p>}
          </header>

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
                  <span className="tv-podium-score">
                    <CountUp value={p.score} /> pts
                  </span>
                  <div className="tv-podium-block">
                    <span className="tv-podium-place">{place}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {err && <p className="tv-lobby-error" role="alert">{err}</p>}

          <div className="tv-results-actions">
            {isHost ? (
              <>
                <button className={`tv-btn tv-btn--block tv-c-${color} tv-shine`} onClick={restartGame} type="button">
                  <Icon name="play" size={20} filled strokeWidth={1.5} />
                  Volver al lobby
                </button>
                <button
                  className="tv-btn tv-btn--block tv-c-neutral"
                  onClick={() => setGame(null).catch((e) => setErr(e.message || "No se pudo volver a la sala"))}
                  type="button"
                >
                  <Icon name="home" size={18} />
                  Elegir otro modo de juego
                </button>
              </>
            ) : (
              <p className="tv-mstage-wait tv-results-wait">
                Esperando a que el anfitrión decida qué jugar
              </p>
            )}
          </div>
        </section>
      </div>
      <PartyPanel room={room} scores onToast={setErr} />
    </div>
  );
}
