import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RoomConfigModal from "../../components/RoomConfigModal.jsx";
import TvShell from "../../components/home/TvShell.jsx";
import NoteCatcher from "../../components/home/NoteCatcher.jsx";
import Avatar from "../../components/home/Avatar.jsx";
import Icon from "../../components/home/Icon.jsx";
import PlayerName from "../../components/home/PlayerName.jsx";
import { useApp } from "../../lib/store.jsx";
import { api } from "../../lib/api.js";

const ARTIST_NAME_MAP = {
  "bad-bunny": "Bad Bunny",
  "mora": "Mora",
  "rauw-alejandro": "Rauw Alejandro",
  "travis-scott": "Travis Scott",
  "drake": "Drake",
  "jvke": "JVKE",
};

function playerTag(player, { isMe, isHost }) {
  if (!player.connected) return "Reconectando…";
  if (isHost && isMe) return "Anfitrión · tú";
  if (isHost) return "Anfitrión";
  if (isMe) return "Tú";
  return "En la sala";
}

export default function Lobby() {
  const { code } = useParams();
  const {
    user,
    room,
    catalog,
    refreshCatalog,
    joinRoom,
    saveGuest,
    startGame,
    leaveRoom,
    setGame,
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

  useEffect(() => {
    refreshCatalog?.();
  }, [refreshCatalog]);

  // Join room if not joined yet. Moving to the game screen is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (user?.name && (!room || room.code !== code)) {
      joinRoom(code).catch(() => nav("/"));
    }
  }, [code, user?.name]);

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
      <TvShell mode="musica">
        <form className="tv-card tv-lobby-guest" onSubmit={onEnterGuest}>
          <h1 className="tv-lobby-title">¿Cómo quieres aparecer?</h1>
          <p className="tv-lobby-sub">
            Escribe tu nombre para unirte a la sala <strong>{code}</strong>. Lo recordaremos para futuras partidas.
          </p>
          <input
            className="tv-field"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={20}
            autoFocus
            required
          />
          {guestErr && <p className="tv-lobby-error">{guestErr}</p>}
          <button className="tv-btn tv-btn--block tv-c-green" type="submit" disabled={!guestName.trim()}>
            Entrar a la sala
          </button>
        </form>
      </TvShell>
    );
  }

  if (!room) {
    return (
      <TvShell mode="musica">
        <div className="tv-card tv-lobby-guest">
          <p className="tv-party-status">
            <span className="tv-pulse" aria-hidden="true" />
            Conectando a la sala {code}…
          </p>
        </div>
      </TvShell>
    );
  }

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const connectedPlayers = room.players.filter((p) => p.connected);
  const canStart = connectedPlayers.length >= 1;

  // Selected artists labels
  const totalArtistCount = Math.max(catalog?.artists?.length || 0, Object.keys(ARTIST_NAME_MAP).length);
  const selectedArtistIds = room.config?.artistIds || [];
  const isAllArtists = selectedArtistIds.length >= totalArtistCount;

  const selectedArtistNames = selectedArtistIds
    .map((aid) => catalog?.artists?.find((a) => a.id === aid)?.name || ARTIST_NAME_MAP[aid] || aid)
    .join(", ");

  async function copyLink() {
    const link = `${window.location.origin}/sala/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard can be blocked; the code is on screen anyway.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function onStartGame() {
    setStartErr("");
    try {
      await startGame();
    } catch (e) {
      setStartErr(e.message);
    }
  }

  async function onBackToHub() {
    setStartErr("");
    try {
      await setGame(null);
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
      setPermissionMsg(err.message || "Error al modificar privilegios");
      setTimeout(() => setPermissionMsg(""), 3500);
    }
  }

  return (
    <TvShell mode="musica">
      <div className="tv-lobby">
        <section className="tv-card tv-lobby-head">
          <div>
            <p className="tv-party-kicker">Adivina la canción · Sala de espera</p>
            <p className="tv-party-code">{room.code}</p>
          </div>
          <button type="button" className="tv-btn tv-c-violet" onClick={copyLink}>
            <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.8} />
            {copied ? "¡Copiado!" : "Invitar"}
          </button>
        </section>

        <div className="tv-lobby-grid">
          <div className="tv-lobby-col">
            <section className="tv-card" aria-label="Jugadores en la sala">
              <div className="tv-card-head">
                <h2 className="tv-card-title">Jugadores</h2>
                <span className="tv-count">{connectedPlayers.length}</span>
              </div>

              {isHost && connectedPlayers.length > 1 && (
                <p className="tv-hint">Como anfitrión puedes dar permisos para que otros cambien los ajustes.</p>
              )}

              <ul className="tv-lobby-players">
                {room.players.map((p, i) => {
                  const isMe = p.id === user?.id;
                  const isHostPlayer = p.id === room.hostId;
                  return (
                    <li
                      key={p.id}
                      className={`tv-player tv-player--row${isMe ? " is-me" : ""}${p.connected ? "" : " is-away"}`}
                      style={{ "--i": i }}
                    >
                      <span className="tv-player-avatar">
                        <Avatar name={p.name} avatar={p.avatar} />
                        {isHostPlayer && <Icon name="crown" size={18} strokeWidth={2} filled className="tv-player-crown" />}
                      </span>
                      <span className="tv-player-text">
                        <PlayerName player={p} className="tv-player-name" />
                        <span className="tv-player-tag">
                          {playerTag(p, { isMe, isHost: isHostPlayer })}
                          {!isHostPlayer && p.canEditConfig && " · ajustes"}
                        </span>
                      </span>
                      {isHost && !isHostPlayer && (
                        <button
                          type="button"
                          className={`tv-mini-btn${p.canEditConfig ? " is-on" : ""}`}
                          onClick={() => handleTogglePermission(p.id)}
                          title={p.canEditConfig ? "Quitar permisos para modificar ajustes" : "Dar permisos para modificar los ajustes"}
                        >
                          {p.canEditConfig ? "Quitar permisos" : "Dar permisos"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <NoteCatcher />
          </div>

          <section className="tv-card" aria-label="Resumen de la partida">
            <div className="tv-card-head">
              <h2 className="tv-card-title">La partida</h2>
              {canEditConfig && (
                <button type="button" className="tv-btn tv-btn--sm tv-c-neutral" onClick={() => setShowConfigModal(true)}>
                  <Icon name="star" size={16} />
                  Ajustes
                </button>
              )}
            </div>

            <div className="tv-stats">
              <div className="tv-stat">
                <span className="tv-stat-label">Rondas</span>
                <span className="tv-stat-value">{room.config?.rounds || 5}</span>
              </div>
              <div className="tv-stat">
                <span className="tv-stat-label">Tiempo por ronda</span>
                <span className="tv-stat-value">{Math.round((room.config?.roundMs || 15000) / 1000)} s</span>
              </div>
              <div className="tv-stat tv-stat--wide">
                <span className="tv-stat-label">Artistas</span>
                <span className="tv-stat-value tv-stat-value--sm">
                  {isAllArtists ? "Todos los artistas" : selectedArtistNames || "Ninguno"}
                </span>
              </div>
              <div className="tv-stat tv-stat--wide">
                <span className="tv-stat-label">Anfitrión</span>
                <span className="tv-stat-value tv-stat-value--sm">{room.hostName || "Host"}</span>
              </div>
            </div>

            {startErr && <p className="tv-lobby-error">{startErr}</p>}

            {isHost ? (
              <div className="tv-lobby-actions">
                <button className="tv-btn tv-btn--block tv-c-green" onClick={onStartGame} disabled={!canStart} type="button">
                  <Icon name="play" size={20} filled strokeWidth={1.5} />
                  Comenzar partida
                </button>
                <button
                  className="tv-btn tv-c-neutral"
                  onClick={onBackToHub}
                  type="button"
                  title="Lleva a todos los jugadores al inicio para elegir otro juego"
                >
                  <Icon name="home" size={18} />
                  Volver todos al inicio
                </button>
              </div>
            ) : (
              <p className="tv-party-status">
                <span className="tv-pulse" aria-hidden="true" />
                Esperando a que {room.hostName || "el anfitrión"} comience la partida…
              </p>
            )}

            <button
              type="button"
              className="tv-link-btn tv-party-leave"
              onClick={() => {
                leaveRoom();
                nav("/");
              }}
            >
              <Icon name="logout" size={18} />
              Salir de la sala
            </button>
          </section>
        </div>
      </div>

      <div className="tv-toast-region" role="status" aria-live="polite">
        {permissionMsg && (
          <div key={permissionMsg} className="tv-toast">
            <Icon name="check" size={16} strokeWidth={2.8} />
            {permissionMsg}
          </div>
        )}
      </div>

      {/* Settings Modal for Host and Users with Edit Config Privileges */}
      <RoomConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        currentConfig={room.config}
        catalog={catalog}
        onSave={updateConfig}
      />
    </TvShell>
  );
}
