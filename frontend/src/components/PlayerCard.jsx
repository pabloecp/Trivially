import UserAvatar from "./UserAvatar.jsx";

export default function PlayerCard({
  player,
  hostId,
  isMe,
  isCurrentUserHost = false,
  isLobby = false,
  onTogglePermission,
}) {
  const isHost = player.id === hostId;
  const statusLabel = {
    conectado: "Conectado",
    listo: "Conectado",
    jugando: "En juego",
    respondió: "Respondió",
    desconectado: "Desconectado",
  }[player.status] || player.status;

  const statusColor = {
    conectado: "var(--ok)",
    listo: "var(--ok)",
    respondió: "var(--brand)",
    jugando: "var(--brand)",
    desconectado: "var(--text-muted)",
  }[player.status] || "var(--text-secondary)";

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderColor: isMe ? "var(--brand)" : "var(--border)",
        background: isMe ? "var(--bg-surface-hover)" : "var(--bg-surface)",
        boxShadow: isMe ? "0 4px 16px var(--brand-subtle)" : "var(--shadow-sm)",
      }}
    >
      <UserAvatar
        avatar={player.avatar}
        name={player.name}
        size={44}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ fontSize: 15, color: "var(--text)" }}>{player.name}</strong>
          {isMe && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: "var(--brand)",
                color: "#FFFFFF",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              TÚ
            </span>
          )}
          {isHost && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: "var(--brand-subtle)",
                color: "var(--brand)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              HOST
            </span>
          )}
          {!isHost && player.canEditConfig && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: "var(--ok-subtle)",
                color: "var(--ok)",
                border: "1px solid var(--ok-border)",
                padding: "2px 6px",
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
              title="Este usuario tiene permisos para modificar los settings de la partida"
            >
              ⚙️ Ajustes
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: statusColor, fontWeight: 600 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: statusColor,
              }}
            />
            {statusLabel}
          </div>

          {/* Host control to grant/revoke settings permissions to other players */}
          {isCurrentUserHost && !isHost && isLobby && (
            <button
              type="button"
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePermission?.(player.id);
              }}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                lineHeight: "1.4",
                background: player.canEditConfig ? "var(--bad-subtle)" : "var(--brand-subtle)",
                color: player.canEditConfig ? "var(--bad)" : "var(--brand)",
                border: `1px solid ${player.canEditConfig ? "var(--bad-border)" : "var(--brand-subtle-hover)"}`,
                borderRadius: 6,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
              title={
                player.canEditConfig
                  ? "Quitar permisos para modificar ajustes"
                  : "Dar privilegios para modificar los ajustes de la partida"
              }
            >
              {player.canEditConfig ? "✕ Quitar permisos" : "+ Dar permisos de ajustes"}
            </button>
          )}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "'Outfit', sans-serif", color: "var(--brand)" }}>
          {player.score || 0}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>pts</div>
      </div>
    </div>
  );
}
