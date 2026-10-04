import Avatar from "./home/Avatar.jsx";
import Icon from "./home/Icon.jsx";
import PlayerName from "./home/PlayerName.jsx";

function BoardAnswer({ answer }) {
  if (!answer || answer.skipped || !answer.text) {
    return <span className="tv-board-answer">{answer?.skipped ? "Se la saltó" : "Sin respuesta"}</span>;
  }
  return (
    <span className={`tv-board-answer ${answer.correct ? "is-right" : "is-wrong"}`} title={answer.text}>
      <Icon name={answer.correct ? "check" : "close"} size={12} strokeWidth={3.2} />
      <span className="tv-board-answer-text">{answer.text}</span>
    </span>
  );
}

// Live scoreboard shown next to the game. The score re-mounts on change so it pops.
export default function MiniBoard({ players, currentUserId, phase }) {
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
              className={`tv-board-row${isMe ? " is-me" : ""}${i < 3 ? ` is-top is-top-${i + 1}` : ""}`}
              style={{ "--i": i }}
            >
              <span className="tv-board-pos">{i + 1}</span>
              <Avatar name={p.name} avatar={p.avatar} />
              <span className="tv-board-name">
                <span className="tv-board-line">
                  <PlayerName player={p} />
                  {isMe && <span className="tv-muted"> · tú</span>}
                </span>
                {p.status === "mirando" ? (
                  // Geografía's tiebreak: the players who aren't tied only watch.
                  <span className="tv-board-answer">Mira el desempate</span>
                ) : showAnswers ? (
                  <BoardAnswer answer={p.lastAnswer} />
                ) : (
                  p.streak > 1 && <span className="tv-board-streak">Racha {p.streak}</span>
                )}
              </span>
              <span className="tv-board-right">
                <span key={p.score} className="tv-board-score">{p.score}</span>
                {showAnswers || p.status === "mirando" ? null : p.answered ? (
                  <span className="tv-board-state is-done">
                    <Icon name="check" size={12} strokeWidth={3.2} />
                    Listo
                  </span>
                ) : (
                  <span className="tv-board-state">Pensando…</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
