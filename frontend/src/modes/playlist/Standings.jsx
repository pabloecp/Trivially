import Avatar from "../../components/home/Avatar.jsx";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import "../../styles/playlist.css";

export const winsText = (n) => `${n} ${n === 1 ? "juego" : "juegos"}`;

// The playlist's games in play order, each in its game's colour: the ones played with who won them, the one just
// played or on now ringed.
export function PlaylistProgress({ run }) {
  return (
    <ol className="tv-pl-progress" aria-label="Juegos de la playlist">
      {run.games.map((game, i) => {
        const mode = findMode(game);
        const played = run.played[i];
        const now = !run.finished && i === run.index;
        return (
          <li
            key={i}
            className={`tv-pl-step${played ? " is-played" : ""}${now ? " is-now" : ""}`}
            title={`${i + 1}. ${mode?.name || game}${played ? ` · ${played.winnerName ? `ganó ${played.winnerName}` : "sin ganador"}` : ""}`}
          >
            <span className={`tv-pl-step-badge tv-c-${mode?.color || "neutral"}`}>
              <Icon name={mode?.icon || "play"} size={18} strokeWidth={2.4} />
            </span>
            <span className="tv-pl-step-who">{played ? played.winnerName || "Empate" : now ? "Ahora" : i + 1}</span>
          </li>
        );
      })}
    </ol>
  );
}

// The playlist's tally: each player's games won and points across them, most wins first (the points break a tie).
// Whoever leads is crowned; at the end that's the playlist's winner (none when the first two have the same).
export function PlaylistStandings({ run }) {
  const { user } = useApp();
  const leader = run.standings[0];
  const second = run.standings[1];
  const crowned =
    leader && leader.wins > 0 && !(second && second.wins === leader.wins && second.points === leader.points) ? leader.id : null;

  return (
    <section className="tv-pl-table" aria-labelledby="tv-pl-table-title">
      <div className="tv-pl-table-head">
        <h3 id="tv-pl-table-title" className="tv-pl-table-title">
          {run.finished ? "Clasificación final" : "Clasificación de la playlist"}
        </h3>
        <span className="tv-pl-table-sub">Gana quien gane más juegos</span>
      </div>
      <ol className="tv-pl-table-list">
        {run.standings.map((p, i) => (
          <li key={p.id} className={`tv-pl-row${p.id === crowned ? " is-leader" : ""}${p.id === user?.id ? " is-me" : ""}`} style={{ "--i": i }}>
            <span className="tv-pl-row-pos">{i + 1}</span>
            <Avatar name={p.name} avatar={p.avatar} />
            <span className="tv-pl-row-name">{p.name}</span>
            {p.id === crowned && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-pl-row-crown" />}
            <span className="tv-pl-row-wins">
              {p.wins}
              <small>{p.wins === 1 ? "juego" : "juegos"}</small>
            </span>
            <span className="tv-pl-row-points">{p.points.toLocaleString("es-ES")} pts</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
