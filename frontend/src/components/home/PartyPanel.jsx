import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import PlayerMenu from "./PlayerMenu.jsx";
import { useInvite } from "./useInvite.js";

function playerTag(player, { isHost }) {
  if (!player.connected) return "Reconectando…";
  if (isHost) return "Anfitrión";
  if (player.canEditConfig) return "Puede editar ajustes";
  return "Conectado";
}

// During a match the line under each name says how their round is going. The server sends everyone's answer only
// once the round is over (reveal), and at the end each player's totals (results).
function MatchTag({ player, room }) {
  if (!player.connected) return <span className="tv-player-tag">Reconectando…</span>;
  if (room.phase === "finished") {
    const r = room.results?.find((x) => x.id === player.id);
    if (!r) return <span className="tv-player-tag">Sin resultados</span>;
    return (
      <span className="tv-player-tag">
        {r.correct} aciertos · racha {r.bestStreak}
        {r.avgMs ? ` · ${(r.avgMs / 1000).toFixed(1)} s` : ""}
        {r.tiebreakWinner ? " · ganó el desempate" : ""}
      </span>
    );
  }
  if (room.phase === "reveal") {
    const a = player.lastAnswer;
    if (!a || a.skipped || !a.text) return <span className="tv-player-tag">{a?.skipped ? "Saltó la canción" : "Sin respuesta"}</span>;
    return (
      <span className={`tv-player-tag tv-player-answer ${a.correct ? "is-right" : "is-wrong"}`} title={a.text}>
        <Icon name={a.correct ? "check" : "close"} size={12} strokeWidth={3.2} />
        <span>{a.text}</span>
      </span>
    );
  }
  if (player.answered) {
    return (
      <span className="tv-player-tag is-done">
        <Icon name="check" size={12} strokeWidth={3.2} />
        Listo
      </span>
    );
  }
  if (player.streak > 1) return <span className="tv-player-tag is-streak">Racha de {player.streak}</span>;
  return <span className="tv-player-tag">{room.phase === "playing" ? "Pensando…" : "Conectado"}</span>;
}

// The room's side column, on the room screen and during a match: the invite code, who's in and the way out.
// With `scores` (a match) the players are ranked by points, each with their score and how their round is going.
// `className` lets a game add its own (Geografía hides the column on phones, where it shows a strip instead).
export default function PartyPanel({ room, onToast, scores = false, className = "" }) {
  const { user, leaveRoom } = useApp();
  const nav = useNavigate();
  const [menuFor, setMenuFor] = useState(null);
  const { copied, copy: copyInvite } = useInvite(room.code, onToast);

  function leave() {
    leaveRoom();
    nav("/");
  }

  const alone = room.players.length === 1;
  const players = scores ? [...room.players].sort((a, b) => b.score - a.score) : room.players;

  return (
    <aside className={`tv-party${scores ? " is-scores" : ""} ${className}`.trim()} aria-label="Tu sala">
      <div className="tv-party-codebox">
        <p className="tv-mono-label">Código de sala</p>
        <p className="tv-party-code">{room.code}</p>
        <button type="button" className="tv-btn tv-c-violet tv-invite-btn tv-shine" onClick={copyInvite} aria-label="Invitar con enlace">
          <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.6} />
          {copied ? "¡Copiado!" : "Invitar"}
        </button>
      </div>

      <div className="tv-party-title">
        <h2>{scores ? "Marcador" : "En la sala"}</h2>
        <span>{alone ? "1 jugador" : `${room.players.length} jugadores`}</span>
      </div>

      <ul className="tv-party-players" aria-label={scores ? "Marcador" : "Jugadores en la sala"}>
        {players.map((p, i) => {
          const isMe = p.id === user?.id;
          const isHostPlayer = p.id === room.hostId;
          return (
            <li
              key={p.id}
              className={`tv-player${isMe ? " is-me" : ""}${p.connected ? "" : " is-away"}${menuFor === p.id ? " is-open" : ""}${
                scores && i < 3 ? ` is-top-${i + 1}` : ""
              }`}
              style={{ "--i": i }}
            >
              <button
                type="button"
                className="tv-player-btn"
                aria-haspopup="menu"
                aria-expanded={menuFor === p.id}
                onClick={() => setMenuFor((cur) => (cur === p.id ? null : p.id))}
              >
                {scores && <span className="tv-player-pos">{i + 1}</span>}
                <Avatar name={p.name} avatar={p.avatar} />
                <span className="tv-player-text">
                  <span className="tv-player-name">{isMe ? `${p.name} · tú` : p.name}</span>
                  {scores ? (
                    <MatchTag player={p} room={room} />
                  ) : (
                    <span className={`tv-player-tag${isHostPlayer ? " is-host" : ""}`}>{playerTag(p, { isHost: isHostPlayer })}</span>
                  )}
                </span>
                {isHostPlayer && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-player-crown" />}
                {scores && (
                  <span key={p.score} className="tv-player-score">
                    {p.score}
                  </span>
                )}
              </button>
              {menuFor === p.id && (
                <PlayerMenu
                  player={p}
                  isMe={isMe}
                  canManage={room.hostId === user?.id && !isMe}
                  onClose={() => setMenuFor(null)}
                  onToast={onToast}
                />
              )}
            </li>
          );
        })}
        {alone && !scores && (
          <li className="tv-player-waiting">
            <span className="tv-player-waiting-ring" aria-hidden="true" />
            Esperando amigos
          </li>
        )}
      </ul>

      <button type="button" className="tv-leave-btn" onClick={leave}>
        <Icon name="logout" size={18} strokeWidth={2.4} />
        Salir de la sala
      </button>
    </aside>
  );
}
