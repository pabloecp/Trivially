import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PlayerCard from "../components/PlayerCard.jsx";
import RoomConfigModal from "../components/RoomConfigModal.jsx";
import { useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";

export default function Lobby() {
  const { code } = useParams();
  const {
    user,
    room,
    catalog,
    joinRoom,
    saveGuest,
    setReady,
    startGame,
    leaveRoom,
    updateConfig,
    toggleConfigPermission,
  } = useApp();
  const nav = useNavigate();

  const [copied, setCopied] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestErr, setGuestErr] = useState("");
  const [startErr, setStartErr] = useState("");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [permissionMsg, setPermissionMsg] = useState("");

  // Join room if not joined yet
  useEffect(() => {
    if (user?.name && (!room || room.code !== code)) {
      joinRoom(code).catch(() => nav("/play"));
    }
  }, [code, user?.name]);

  // Navigate to game when game starts
  useEffect(() => {
    if (room && room.phase !== "lobby" && room.phase !== "finished") {
      nav(`/game/${room.code}`);
    }
  }, [room?.phase]);

  // If user does not have a saved name yet, show prompt
  if (!user?.name) {
    async function onEnterGuest(e) {
      e.preventDefault();
      if (!guestName.trim()) return;
      try {
        await saveGuest(guestName.trim());
        await joinRoom(code);
      } catch (err) {
        setGuestErr(err.message);
      }
    }

    return (
      <div className="grid page-compact" style={{ margin: "40px auto" }}>
        <div className="card grid" style={{ padding: 36, textAlign: "center", gap: 20 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <YoavllySymbol size={48} />
          </div>

          <div>
            <h2 style={{ fontSize: 24, margin: "0 0 8px" }}>¿Cómo quieres aparecer en la partida?</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Introduce tu nombre para unirte a la sala {code}. Lo recordaremos para futuras partidas.
            </p>
          </div>

          <form onSubmit={onEnterGuest} className="grid" style={{ gap: 14 }}>
            <input
              className="field"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Pablo"
              maxLength={20}
              autoFocus
              style={{ textAlign: "center", fontSize: 18, fontWeight: 700 }}
              required
            />

            {guestErr && <p className="error" style={{ margin: 0 }}>{guestErr}</p>}

            <button className="btn primary lg" type="submit" disabled={!guestName.trim()}>
              Entrar a la Sala →
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="card" style={{ maxWidth: 460, margin: "60px auto", textAlign: "center" }}>
        <p className="muted">Conectando a la sala {code}...</p>
      </div>
    );
  }

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const isReady = me?.status === "listo";
  const connectedPlayers = room.players.filter((p) => p.connected);
  const canStart = connectedPlayers.length >= 1;

  // Selected genres & artists labels
  const selectedGenreNames = (room.config?.genreIds || [])
    .map((gid) => catalog?.genres?.find((g) => g.id === gid)?.name || gid)
    .join(", ");
  const selectedArtistNames = (room.config?.artistIds || [])
    .map((aid) => catalog?.artists?.find((a) => a.id === aid)?.name || aid)
    .join(", ");

  async function copyLink() {
    const link = `${window.location.origin}/lobby/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  async function onStartGame() {
    setStartErr("");
    try {
      await startGame();
    } catch (e) {
      setStartErr(e.message);
    }
  }

  async function handleTogglePermission(targetId) {
    try {
      const res = await toggleConfigPermission(targetId);
      const targetPlayer = room.players.find((p) => p.id === targetId);
      const name = targetPlayer?.name || "Jugador";
      setPermissionMsg(
        res?.granted
          ? `Privilegios de configuración otorgados a ${name}`
          : `Privilegios revocados a ${name}`
      );
      setTimeout(() => setPermissionMsg(""), 3500);
    } catch (err) {
      alert(err.message || "Error al modificar privilegios");
    }
  }

  return (
    <div className="grid page-medium" style={{ gap: 24 }}>
      {/* Toast Notification for Permission Changes */}
      {permissionMsg && (
        <div
          className="card"
          style={{
            padding: "10px 16px",
            background: "rgba(16, 185, 129, 0.12)",
            borderColor: "rgba(16, 185, 129, 0.3)",
            color: "#059669",
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>✓</span>
          <span>{permissionMsg}</span>
        </div>
      )}

      {/* Lobby Header with Room Code */}
      <div className="card" style={{ padding: 28, borderColor: "var(--brand)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="kicker">
              <YoavllySymbol size={14} /> Sala Multijugador en Vivo
            </div>
            <h1 style={{ margin: "4px 0 0", fontSize: 32 }}>Lobby de Espera</h1>
          </div>

          {/* Room Code Badge */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
              Código de Sala
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 900,
                fontFamily: "'Outfit', monospace",
                color: "var(--brand)",
                letterSpacing: "0.15em",
                margin: "2px 0 6px",
              }}
            >
              {room.code}
            </div>
            <button className="btn secondary sm" onClick={copyLink} type="button">
              {copied ? "¡Enlace copiado!" : "Copiar enlace de invitación"}
            </button>
          </div>
        </div>
      </div>

      {/* Players List and Controls */}
      <div className="grid grid-2" style={{ gap: 24, alignItems: "start" }}>
        {/* Connected Players */}
        <div className="card" style={{ padding: 24 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Jugadores en la sala</h3>
            <span className="chip" style={{ fontSize: 12 }}>
              {connectedPlayers.length} {connectedPlayers.length === 1 ? "jugador" : "jugadores"}
            </span>
          </div>

          {isHost && connectedPlayers.length > 1 && (
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 12 }}>
              💡 Como Host, puedes darle privilegios a cualquier jugador para que modifique los ajustes de la partida.
            </p>
          )}

          <div className="grid" style={{ gap: 10 }}>
            {room.players.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                hostId={room.hostId}
                isMe={p.id === user?.id}
                isCurrentUserHost={isHost}
                isLobby={room.phase === "lobby"}
                onTogglePermission={handleTogglePermission}
              />
            ))}
          </div>
        </div>

        {/* Room Config & Actions */}
        <div className="card grid" style={{ padding: 24, gap: 18 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Resumen de la Partida</h3>
            {canEditConfig && (
              <button
                type="button"
                className="btn secondary sm"
                onClick={() => setShowConfigModal(true)}
                style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700 }}
              >
                ⚙️ Modificar Ajustes
              </button>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              background: "var(--bg-elevated)",
              padding: 16,
              borderRadius: 14,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Rondas</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>🎯 {room.config?.rounds || 5} rondas</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Tiempo por ronda</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>⏱️ 15 segundos</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Artistas</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                🎤 {(room.config?.artistIds || []).length >= (catalog?.artists?.length || 3) ? "Todos los artistas" : selectedArtistNames || "Todos"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Géneros</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                🎵 {(room.config?.genreIds || []).length >= (catalog?.genres?.length || 5) ? "Todos los géneros" : selectedGenreNames || "Todos"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Anfitrión</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)" }}>👑 {room.hostName || "Host"}</span>
            </div>
          </div>

          {room.coHosts?.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--ok)", fontWeight: 600 }}>
              ✓ Con privilegios de ajustes:{" "}
              {room.coHosts
                .map((cid) => room.players.find((p) => p.id === cid)?.name || cid)
                .join(", ")}
            </div>
          )}

          {startErr && (
            <div className="card" style={{ padding: 12, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
              <p className="error" style={{ margin: 0, fontSize: 13 }}>{startErr}</p>
            </div>
          )}

          {isHost ? (
            <div className="grid" style={{ gap: 10 }}>
              <button
                className="btn primary lg"
                onClick={onStartGame}
                disabled={!canStart}
                type="button"
              >
                {connectedPlayers.length === 1
                  ? "Comenzar Ronda Solo →"
                  : `Comenzar Partida (${connectedPlayers.length} jugadores) →`}
              </button>
            </div>
          ) : (
            <div className="grid" style={{ gap: 10 }}>
              <button
                className={`btn ${isReady ? "primary" : "secondary"} lg`}
                onClick={() => setReady(!isReady)}
                type="button"
              >
                {isReady ? "¡Estás Listo!" : "Marcar como Listo"}
              </button>
              <p className="muted" style={{ margin: 0, fontSize: 12, textAlign: "center" }}>
                Esperando a que el Host inicie la partida...
              </p>
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, textAlign: "center" }}>
            <button
              className="btn ghost sm"
              onClick={() => {
                leaveRoom();
                nav("/play");
              }}
              type="button"
            >
              Salir de la sala
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal for Host and Users with Edit Config Privileges */}
      <RoomConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        currentConfig={room.config}
        catalog={catalog}
        onSave={updateConfig}
      />
    </div>
  );
}
