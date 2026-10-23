import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { exitPath } from "./TvTopbar.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import MatchGames from "./MatchGames.jsx";
import { MATCH_KINDS, gamesText, sizeName } from "./matchInfo.js";
import "../../styles/match.css";

// The room screen of a public match while it waits for players (RoomManager.findMatch): a seat per player it needs,
// filled as they arrive, and once it's full a short count before it starts by itself. Nobody picks anything here.
export default function MatchLobby({ room }) {
  const { user, leaveRoom } = useApp();
  const nav = useNavigate();
  const info = room.matchmaking;
  const kind = MATCH_KINDS[info.kind] || MATCH_KINDS.casual;
  const players = room.players.filter((p) => p.connected);
  const seats = Array.from({ length: Math.max(info.size, players.length) }, (_, i) => players[i] || null);
  const full = Boolean(info.startsAt);

  // Once full: the seconds until it starts.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!full) return undefined;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [full]);
  const startsIn = full ? Math.max(1, Math.ceil((info.startsAt - (now + (room.clockOffset || 0))) / 1000)) : null;

  function leave() {
    leaveRoom();
    nav(exitPath(room), { replace: true });
  }

  return (
    <section className={`tv-mcard tv-ml tv-c-${kind.color}${full ? " is-full" : ""}`} aria-labelledby="tv-ml-title">
      {/* On wide screens two columns: the search (icon, title, seats and the way out) and, beside it, the games. */}
      <div className="tv-ml-main">
      {/* The kind's icon floating gently while it searches; once full it turns into a tick. */}
      <span key={full ? "full" : "wait"} className={`tv-badge tv-c-${kind.color} tv-ml-core`} aria-hidden="true">
        <Icon name={full ? "check" : kind.icon} size={30} filled={!full} strokeWidth={full ? 3 : 1.6} />
      </span>
      <p className="tv-mono-label tv-ml-kicker">
        {kind.name} · {sizeName(info.versus || info.size)} · {gamesText(info.gameCount)}
      </p>
      {/* What's going on and how full it is, on one line: "Buscando jugadores 1/5", then "¡Sala completa! 3". */}
      <div className="tv-ml-headline">
        <h2 id="tv-ml-title" className="tv-ml-title" aria-live="polite">
          {full ? "¡Sala completa!" : "Buscando jugadores"}
        </h2>
        {full ? (
          <span key={startsIn} className="tv-ml-pill is-count" aria-label={`Empieza en ${startsIn}`}>
            {startsIn}
          </span>
        ) : (
          <span className="tv-ml-pill" aria-label={`${players.length} de ${info.size} jugadores`}>
            {players.length}/{info.size}
          </span>
        )}
      </div>

      <ul className="tv-ml-seats" aria-label="Jugadores">
        {seats.map((p, i) => (
          <li key={p ? p.id : `empty${i}`} className={`tv-ml-seat${p ? " is-taken" : ""}${p?.id === user?.id ? " is-me" : ""}`} style={{ "--i": i }}>
            {p ? (
              <>
                <Avatar name={p.name} avatar={p.avatar} />
                <span className="tv-ml-name">{p.id === user?.id ? "Tú" : p.name}</span>
              </>
            ) : (
              <>
                <span className="tv-ml-empty" role="img" aria-label="Lugar libre">
                  <Icon name="user" size={22} strokeWidth={2.2} />
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <button type="button" className="tv-btn tv-c-neutral tv-ml-leave" data-sound="back" onClick={leave}>
        <Icon name="close" size={18} strokeWidth={3} />
        {full ? "Salir" : "Cancelar búsqueda"}
      </button>
      </div>

      {/* The games the roulette will pick from, with how each one is played (the roulette itself spins at the start). */}
      <div className="tv-ml-games">
        <p className="tv-mono-label">Juegos</p>
        <MatchGames kind={info.kind} compact />
      </div>
    </section>
  );
}
