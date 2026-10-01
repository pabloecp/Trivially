import { useEffect, useState } from "react";
import RoomConfigModal from "../../components/RoomConfigModal.jsx";
import NoteCatcher from "../../components/home/NoteCatcher.jsx";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";

// The music mode's waiting room, shown inside the room screen on Home once the host picks this game:
// the match settings (playlists, rounds, time), the start button and a little game to pass the time.
export default function LobbyPanel({ room, onToast }) {
  const { user, catalog, refreshCatalog, startGame, updateConfig, toggleConfigPermission } = useApp();
  const [startErr, setStartErr] = useState("");
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    refreshCatalog?.();
  }, [refreshCatalog]);

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const canStart = room.players.some((p) => p.connected);
  const others = room.players.filter((p) => p.id !== room.hostId);

  const playlists = catalog?.playlists || [];
  const chosen = playlists.filter((p) => room.config?.playlistIds?.includes(p.id));
  const playlistNames = (chosen.length ? chosen : playlists.filter((p) => p.isDefault)).map((p) => p.name.split(" · ").pop()).join(", ");

  // The host decides who else may change the settings.
  async function togglePermission(player) {
    try {
      const res = await toggleConfigPermission(player.id);
      onToast?.(res?.granted ? `${player.name} ya puede cambiar los ajustes` : `${player.name} ya no puede cambiar los ajustes`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudieron cambiar los permisos");
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

  return (
    <div className="tv-lobby-grid">
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
            <span className="tv-stat-label">{chosen.length > 1 ? "Playlists" : "Playlist"}</span>
            <span className="tv-stat-value tv-stat-value--sm">{playlistNames || "Cargando…"}</span>
          </div>
        </div>

        {isHost && others.length > 0 && (
          <div className="tv-perm">
            <p className="tv-stat-label">Pueden cambiar los ajustes</p>
            <div className="tv-perm-list">
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`tv-perm-chip${p.canEditConfig ? " is-on" : ""}`}
                  aria-pressed={Boolean(p.canEditConfig)}
                  onClick={() => togglePermission(p)}
                >
                  <Icon name={p.canEditConfig ? "check" : "lock"} size={14} strokeWidth={3} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {startErr && <p className="tv-lobby-error">{startErr}</p>}

        {isHost ? (
          <button className="tv-btn tv-btn--block tv-c-green" onClick={onStartGame} disabled={!canStart} type="button">
            <Icon name="play" size={20} filled strokeWidth={1.5} />
            Comenzar partida
          </button>
        ) : (
          <p className="tv-party-status">
            <span className="tv-pulse" aria-hidden="true" />
            Esperando a que {room.hostName || "el anfitrión"} comience la partida…
          </p>
        )}
      </section>

      <NoteCatcher />

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
