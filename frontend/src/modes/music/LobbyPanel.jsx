import { useEffect, useState } from "react";
import MusicSettings from "./MusicSettings.jsx";
import Avatar from "../../components/home/Avatar.jsx";
import Icon from "../../components/home/Icon.jsx";
import SpotifyIcon from "../../components/home/SpotifyIcon.jsx";
import { useApp } from "../../lib/store.jsx";

// The music mode's waiting room, shown inside the room screen on Home once the host picks this game:
// the match settings (playlists, rounds, time) for whoever may change them, and the start button.
export default function LobbyPanel({ room, onToast }) {
  const { user, catalog, refreshCatalog, startGame, updateConfig, toggleConfigPermission } = useApp();
  const [startErr, setStartErr] = useState("");

  useEffect(() => {
    refreshCatalog?.();
  }, [refreshCatalog]);

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const connected = room.players.filter((p) => p.connected);
  // A match needs a different song for every round (the server checks it too; older servers don't send songsReady).
  const songsReady = room.songsReady;
  const roundsSet = room.config?.rounds || 10;
  const enoughSongs = songsReady == null || songsReady >= roundsSet;
  const canStart = connected.length > 0 && enoughSongs;
  const others = room.players.filter((p) => p.id !== room.hostId);

  const playlists = catalog?.playlists || [];
  const chosenIds = room.config?.playlistIds || [];
  const chosen = playlists.filter((p) => chosenIds.includes(p.id));
  const custom = (room.customPlaylists || []).filter((p) => chosenIds.includes(p.id));
  const playlistNames = [
    ...(chosen.length || custom.length ? chosen : playlists.filter((p) => p.isDefault)).map((p) => p.name.split(" · ").pop()),
    ...custom.map((p) => p.name),
  ].join(", ");
  // Spotify songs still being looked up: the match can start already, the rest join as they are found.
  const loading = custom.filter((p) => p.loading);
  const loadingReady = loading.reduce((n, p) => n + p.ready, 0);
  const loadingTotal = loading.reduce((n, p) => n + p.total, 0);
  const loadingChecked = loading.reduce((n, p) => n + (p.checked ?? p.total), 0);
  // Every song was looked at once: what's left is the second search for the ones not found.
  const retrying = loadingChecked >= loadingTotal ? loading.reduce((n, p) => n + (p.retrying || 0), 0) : 0;
  const rounds = room.config?.rounds || 10;
  const seconds = Math.round((room.config?.roundMs || 15000) / 1000);
  // Each round: 3 s countdown + the guessing time + 7 s showing the answer.
  const minutes = Math.max(1, Math.round((rounds * (3 + seconds + 7)) / 60));

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
    <div className={`tv-lobby-grid${canEditConfig ? " has-settings" : ""}`}>
      {canEditConfig && (
        <MusicSettings room={room} catalog={catalog} updateConfig={updateConfig} onToast={onToast}>
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
        </MusicSettings>
      )}

      <section className="tv-card tv-match" aria-label="Resumen de la partida">
        <h2 className="tv-card-title">Resumen de la partida</h2>

        <div className="tv-match-preview">
          <div className="tv-eq tv-eq--sm" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} style={{ "--i": i }} />
            ))}
          </div>
          <p className="tv-match-title">
            <strong>{rounds}</strong> rondas
          </p>
          <div className="tv-match-chips">
            <span className="tv-match-chip">
              <Icon name="bolt" size={14} strokeWidth={2.6} />
              {seconds} s cada una
            </span>
            <span className="tv-match-chip">
              <Icon name="music" size={14} strokeWidth={2.6} />
              {playlistNames || "Cargando…"}
            </span>
            <span className="tv-match-chip">≈ {minutes} min</span>
          </div>
          <div className="tv-match-players">
            <span className="tv-avatar-stack" aria-hidden="true">
              {connected.slice(0, 5).map((p) => (
                <Avatar key={p.id} name={p.name} avatar={p.avatar} />
              ))}
            </span>
            {connected.length === 1 ? "1 jugador en la sala" : `${connected.length} jugadores en la sala`}
          </div>
        </div>

        {loading.length > 0 && (
          <p className="tv-playlist-total tv-spotify-loading" aria-live="polite">
            <SpotifyIcon size={18} />
            <span>
              {retrying > 0 ? (
                <>
                  <strong>{loadingReady} de {loadingTotal}</strong> listas. Buscando otra vez {retrying}{" "}
                  {retrying === 1 ? "canción que no se encontró" : "canciones que no se encontraron"}.
                </>
              ) : (
                <>
                  Cargando canciones de Spotify: <strong>{loadingReady} listas</strong>, {loadingChecked} de {loadingTotal}{" "}
                  revisadas.
                </>
              )}
              {room.itunesSlow && " iTunes nos está haciendo esperar, sigue buscando."}
            </span>
          </p>
        )}

        {!enoughSongs && (
          <p className="tv-playlist-total is-short" role="status">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Hay <strong>{songsReady} {songsReady === 1 ? "canción lista" : "canciones listas"}</strong> para {roundsSet} rondas.{" "}
              {loading.length > 0 ? "Espera a que carguen más o baja las rondas." : "Baja las rondas o elige más playlists."}
            </span>
          </p>
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

    </div>
  );
}
