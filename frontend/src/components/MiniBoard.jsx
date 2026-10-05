import { useState } from "react";
import Avatar from "./home/Avatar.jsx";
import Icon from "./home/Icon.jsx";
import PlayerMenu from "./home/PlayerMenu.jsx";

function BoardAnswer({ answer }) {
  if (!answer || answer.skipped || !answer.text) {
    return <span className="tv-board-answer">{answer?.skipped ? "Saltó la canción" : "Sin respuesta"}</span>;
  }
  return (
    <span className={`tv-board-answer ${answer.correct ? "is-right" : "is-wrong"}`} title={answer.text}>
      <Icon name={answer.correct ? "check" : "close"} size={12} strokeWidth={3.2} />
      <span className="tv-board-answer-text">{answer.text}</span>
    </span>
  );
}

// Live scoreboard shown next to the game. The score re-mounts on change so it pops. Tapping a player opens the
// same menu as in the room card (profile, and the host's settings permission).
export default function MiniBoard({ players, currentUserId, hostId, phase, onToast }) {
  const [menuFor, setMenuFor] = useState(null);
  // The server sends everyone's answer only once the round is over (reveal / finished).
  const showAnswers = phase === "reveal" || phase === "finished";
  const ranked = [...(players || [])].sort((a, b) => b.score - a.score);

  return (
    <section className="tv-card tv-board" aria-labelledby="tv-board-title">
      <div className="tv-card-head">
        <h2 id="tv-board-title" className="tv-card-title">Marcador</h2>
        <span className="tv-count">{ranked.length}</span>
      </div>

      <ol className="tv-board-list">
        {ranked.map((p, i) => {
          const isMe = p.id === currentUserId;
          return (
            <li
              key={p.id}
              className={`tv-board-row${isMe ? " is-me" : ""}${i < 3 ? ` is-top is-top-${i + 1}` : ""}${menuFor === p.id ? " is-open" : ""}`}
              style={{ "--i": i }}
            >
              <button
                type="button"
                className="tv-board-btn"
                aria-haspopup="menu"
                aria-expanded={menuFor === p.id}
                onClick={() => setMenuFor((cur) => (cur === p.id ? null : p.id))}
              >
                <span className="tv-board-pos">{i + 1}</span>
                <Avatar name={p.name} avatar={p.avatar} />
                <span className="tv-board-name">
                  <span className="tv-board-line">
                    {p.name}
                    {isMe && <span className="tv-muted"> · tú</span>}
                  </span>
                  {showAnswers ? (
                    <BoardAnswer answer={p.lastAnswer} />
                  ) : (
                    p.streak > 1 && <span className="tv-board-streak">Racha {p.streak}</span>
                  )}
                </span>
                <span className="tv-board-right">
                  <span key={p.score} className="tv-board-score">{p.score}</span>
                  {showAnswers ? null : p.answered ? (
                    <span className="tv-board-state is-done">
                      <Icon name="check" size={12} strokeWidth={3.2} />
                      Listo
                    </span>
                  ) : (
                    <span className="tv-board-state">Pensando…</span>
                  )}
                </span>
              </button>
              {menuFor === p.id && (
                <PlayerMenu
                  player={p}
                  isMe={isMe}
                  canManage={hostId === currentUserId && !isMe}
                  onClose={() => setMenuFor(null)}
                  onToast={onToast}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
