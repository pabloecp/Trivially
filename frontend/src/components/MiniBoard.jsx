import Avatar from "./home/Avatar.jsx";
import Icon from "./home/Icon.jsx";

// Live scoreboard shown next to the game. The score re-mounts on change so it pops.
export default function MiniBoard({ players, currentUserId }) {
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
                  {p.name}
                  {isMe && <span className="tv-muted"> · tú</span>}
                </span>
                {p.streak > 1 && <span className="tv-board-streak">Racha {p.streak}</span>}
              </span>
              <span className="tv-board-right">
                <span key={p.score} className="tv-board-score">{p.score}</span>
                {p.answered ? (
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
