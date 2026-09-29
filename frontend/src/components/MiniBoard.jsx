export default function MiniBoard({ players, currentUserId }) {
  const ranked = [...(players || [])].sort((a, b) => b.score - a.score);

  const getPosBadge = (index) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Marcador en vivo</h3>
        <span className="chip" style={{ fontSize: 11, padding: "2px 8px" }}>
          {players.length} {players.length === 1 ? "jugador" : "jugadores"}
        </span>
      </div>

      <div className="grid" style={{ gap: 8 }}>
        {ranked.map((p, i) => {
          const isMe = p.id === currentUserId;
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                background: isMe ? "var(--brand-subtle)" : "var(--bg-subtle)",
                border: isMe ? "1px solid var(--brand)" : "1px solid var(--border-subtle)",
              }}
            >
              <span
                style={{
                  width: 22,
                  fontSize: i < 3 ? 15 : 12,
                  fontWeight: 800,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {getPosBadge(i)}
              </span>

              <div
                className="avatar"
                style={{
                  background: p.avatar || "var(--brand)",
                  width: 30,
                  height: 30,
                  fontSize: 12,
                  border: "none",
                }}
              >
                {(p.name || "?").slice(0, 1).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: isMe ? 800 : 600,
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--text)",
                  }}
                >
                  {p.name} {isMe && "(Tú)"}
                </div>
                {p.streak > 1 && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#EA580C" }}>
                    🔥 {p.streak} STREAK
                  </div>
                )}
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, fontFamily: "'Outfit', sans-serif", color: "var(--brand)" }}>
                  {p.score}
                </div>
                <div style={{ fontSize: 10 }}>
                  {p.answered ? (
                    <span className="ok" style={{ fontWeight: 700 }}>Listo</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>⏱️ ...</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
