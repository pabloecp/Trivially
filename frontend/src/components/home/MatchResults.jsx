import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import Confetti from "./Confetti.jsx";
import CountUp from "./CountUp.jsx";
import Icon from "./Icon.jsx";
import PlayerName from "./PlayerName.jsx";
import { useApp } from "../../lib/store.jsx";

// The end of a match in any game: podium, everyone's results and what to do next. `color` is the mode's tile
// colour for the host's main button.
export default function MatchResults({ room, color = "green" }) {
  const { user, restartGame, leaveRoom, setGame } = useApp();
  const nav = useNavigate();
  const [err, setErr] = useState("");
  const isHost = room.hostId === user?.id;

  const top = room.results;
  const winner = top[0];
  const podium = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd

  return (
    <div className="tv-page tv-results">
      <Confetti />
      <header className="tv-results-head">
        <p className="tv-party-kicker">Partida terminada</p>
        <h1 className="tv-page-title tv-results-title">
          {top.length > 1 ? `¡Ganó ${winner?.name}!` : "¡Fin de la partida!"}
        </h1>
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

      <section className="tv-card" aria-labelledby="tv-breakdown">
        <h2 id="tv-breakdown" className="tv-card-title">Resultados</h2>
        <ol className="tv-rank-list">
          {top.map((p, i) => (
            <li key={p.id} className={`tv-rank-row${p.id === user?.id ? " is-me" : ""}`} style={{ "--i": i }}>
              <span className="tv-rank-pos">{p.position}</span>
              <Avatar name={p.name} avatar={p.avatar} />
              <span className="tv-rank-name">
                <PlayerName player={p} />
                <span className="tv-rank-meta">
                  {p.correct} aciertos · racha {p.bestStreak}
                  {p.avgMs ? ` · ${(p.avgMs / 1000).toFixed(1)} s` : ""}
                </span>
              </span>
              <span className="tv-rank-score">{p.score}</span>
            </li>
          ))}
        </ol>
      </section>

      {err && <p className="tv-lobby-error" role="alert">{err}</p>}

      <div className="tv-results-actions">
        {isHost ? (
          <>
            <button className={`tv-btn tv-btn--block tv-c-${color}`} onClick={restartGame} type="button">
              <Icon name="play" size={20} filled strokeWidth={1.5} />
              Volver al lobby
            </button>
            <button
              className="tv-btn tv-c-neutral"
              onClick={() => setGame(null).catch((e) => setErr(e.message || "No se pudo volver a la sala"))}
              type="button"
            >
              <Icon name="home" size={18} />
              Elegir otro juego
            </button>
          </>
        ) : (
          <p className="tv-party-status">
            <span className="tv-pulse" aria-hidden="true" />
            Esperando a que el anfitrión decida qué jugar…
          </p>
        )}
        <button
          type="button"
          className="tv-link-btn"
          onClick={() => {
            leaveRoom();
            nav("/");
          }}
        >
          <Icon name="logout" size={18} />
          Salir de la sala
        </button>
      </div>
    </div>
  );
}
