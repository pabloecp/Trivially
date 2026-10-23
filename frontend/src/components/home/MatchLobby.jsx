import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { exitPath } from "./TvTopbar.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import ModeStage from "./ModeStage.jsx";
import { MATCH_KINDS, sizeName } from "./matchInfo.js";
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

  // How long it has been searching (from when this device started, kept through a reload), and once full the seconds
  // until it starts.
  const since = useSearchStart(room.code);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), full ? 200 : 500);
    return () => clearInterval(id);
  }, [full]);
  const startsIn = full ? Math.max(1, Math.ceil((info.startsAt - (now + (room.clockOffset || 0))) / 1000)) : null;
  const waited = Math.max(0, Math.floor((now - since) / 1000));
  const clock = `${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, "0")}`;

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
      <ModeStage
        mode={{ name: kind.name, icon: kind.icon, color: kind.color, steps: kind.steps || [] }}
        extra={
          <span className="tv-mstage-chip">
            <Icon name={(info.versus || info.size) === 2 ? "user" : "users"} size={18} strokeWidth={2.6} />
            {sizeName(info.versus || info.size)}
          </span>
        }
      >
        {leaveButton("tv-mstage-start tv-play-start")}
      </ModeStage>

      <section className="tv-settings-card tv-ml-panel" aria-labelledby="tv-ml-title">
        {/* What's going on and how full it is, on one line: "Buscando jugadores 1/5", then "¡Sala completa! 5/5". */}
        <div className="tv-settings-head tv-ml-headline">
          <h2 id="tv-ml-title" className="tv-settings-title" aria-live="polite">
            {full ? "¡Sala completa!" : "Buscando jugadores"}
          </h2>
          {/* How full it is; the seconds left once full are on the clock. */}
          <span key={players.length} className={`tv-ml-pill${full ? " is-count" : ""}`} aria-label={`${players.length} de ${info.size} jugadores`}>
            {players.length}/{info.size}
          </span>
        </div>

        <div className="tv-play-settings tv-ml-body">
          <div className="tv-ml-center" style={{ "--seats": seats.length }}>
            {/* The clock: how long it has been searching, then, once full, the seconds until it starts. Each new number
                slides in. The seats under it are framed like the logo (its five coloured slices), turning once full. */}
            <div className="tv-ml-clock" role="timer" aria-live="off">
              <span className="tv-ml-clock-label">{full ? "La partida empieza en" : "Buscando desde hace"}</span>
              <span key={full ? `s${startsIn}` : clock} className="tv-ml-clock-time">
                {full ? startsIn : clock}
              </span>
              <span className="tv-ml-clock-sub">{full ? "¡Preparados!" : "Te avisamos en cuanto esté completa"}</span>
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
                        <Icon name="user" size={24} strokeWidth={2.2} />
                      </span>
                      <span className="tv-ml-name is-waiting">Libre</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="tv-play-cta">{leaveButton("tv-btn tv-btn--block tv-lobby-go tv-c-neutral")}</div>
    </div>
  );
}

// When this device started searching in a room (sessionStorage, so a reload keeps counting from the same moment).
function useSearchStart(code) {
  const [since] = useState(() => {
    const key = `trivially_search_since_${code}`;
    try {
      const saved = Number(sessionStorage.getItem(key));
      if (saved > 0) return saved;
      const t = Date.now();
      sessionStorage.setItem(key, String(t));
      return t;
    } catch {
      return Date.now();
    }
  });
  return since;
}
