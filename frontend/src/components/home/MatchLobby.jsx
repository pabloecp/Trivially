import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { exitPath } from "./TvTopbar.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import ModeStage from "./ModeStage.jsx";
import { MATCH_KINDS, gamesText, sizeName } from "./matchInfo.js";
import "../../styles/match.css";
import "../../styles/lobby.css";

// The room screen of a public match while it waits for players (RoomManager.findMatch), in the very frame of
// /jugar/casual (PlayPage): the same big card in the kind's colour, its button now "Cancelar búsqueda", and in place of
// its "Ajustes" the search: a seat per player it needs, filled as they arrive, and once it's full a short count before
// it starts by itself. Nobody picks anything here. Going from one to the other doesn't change screen (Home's "seam").
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

  const leaveButton = (className) => (
    <button type="button" className={className} data-sound="back" onClick={leave}>
      <Icon name="close" size={20} strokeWidth={3} />
      {full ? "Salir" : "Cancelar búsqueda"}
    </button>
  );

  return (
    <div className={`tv-room-row tv-play-row tv-ml tv-c-${kind.color}${full ? " is-full" : ""}`}>
      <ModeStage mode={{ name: kind.name, icon: kind.icon, color: kind.color, steps: kind.steps || [] }}>
        {leaveButton("tv-mstage-start tv-play-start")}
      </ModeStage>

      <section className="tv-settings-card tv-ml-panel" aria-labelledby="tv-ml-title">
        {/* What's going on and how full it is, on one line: "Buscando jugadores 1/5", then "¡Sala completa! 3". */}
        <div className="tv-settings-head tv-ml-headline">
          <h2 id="tv-ml-title" className="tv-settings-title" aria-live="polite">
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

        <div className="tv-play-settings tv-ml-body">
          {/* The kind's icon floating gently while it searches; once full it turns into a tick. */}
          <span key={full ? "full" : "wait"} className={`tv-badge tv-c-${kind.color} tv-ml-core`} aria-hidden="true">
            <Icon name={full ? "check" : kind.icon} size={44} filled={!full} strokeWidth={full ? 3 : 1.6} />
          </span>
          <p className="tv-mono-label tv-ml-kicker">
            {sizeName(info.versus || info.size)} · {gamesText(info.rounds)} · {info.rounds} rondas
          </p>
          <ul className="tv-ml-seats" aria-label="Jugadores">
            {seats.map((p, i) => (
              <li key={p ? p.id : `empty${i}`} className={`tv-ml-seat${p ? " is-taken" : ""}${p?.id === user?.id ? " is-me" : ""}`} style={{ "--i": i }}>
                {p ? (
                  <>
                    <Avatar name={p.name} avatar={p.avatar} />
                    <span className="tv-ml-name">{p.id === user?.id ? "Tú" : p.name}</span>
                  </>
                ) : (
                  <span className="tv-ml-empty" role="img" aria-label="Lugar libre">
                    <Icon name="user" size={22} strokeWidth={2.2} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="tv-play-cta">{leaveButton("tv-btn tv-btn--block tv-lobby-go tv-c-neutral")}</div>
    </div>
  );
}
