import { useEffect } from "react";
import MusicSettings from "./MusicSettings.jsx";
import Icon from "../../components/home/Icon.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import SpotifyIcon from "../../components/home/SpotifyIcon.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";

// The music mode's waiting room, shown inside the room screen on Home once the host picks this game: the mode's big
// card (how it's played and the start button) and the match settings (playlists, rounds, time) beside it.
// Everyone sees the settings; players without permission see them locked.
export default function LobbyPanel({ room, onToast }) {
  const { user, catalog, refreshCatalog, updateConfig } = useApp();

  useEffect(() => {
    refreshCatalog?.();
  }, [refreshCatalog]);

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const mode = findMode("musica");
  const songsReady = room.songsReady;
  const roundsSet = room.config?.rounds || 5;
  const enoughSongs = mode.ready(room);

  const chosenIds = room.config?.playlistIds || [];
  const custom = (room.customPlaylists || []).filter((p) => chosenIds.includes(p.id));
  // Spotify songs still being looked up: the match can start already, the rest join as they are found.
  const loading = custom.filter((p) => p.loading);
  // Finished, but some songs aren't on iTunes (they can't come up in the match).
  const incomplete = custom.filter((p) => !p.loading && p.ready < p.total);
  const loadingReady = loading.reduce((n, p) => n + p.ready, 0);
  const loadingTotal = loading.reduce((n, p) => n + p.total, 0);
  const loadingChecked = loading.reduce((n, p) => n + (p.checked ?? p.total), 0);
  // Every song was looked at once: what's left is the second search for the ones not found.
  const retrying = loadingChecked >= loadingTotal ? loading.reduce((n, p) => n + (p.retrying || 0), 0) : 0;

  return (
    <>
      <ModeStage
        room={room}
        mode={mode}
        extra={
          <span className="tv-eq tv-eq--stage" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} style={{ "--i": i }} />
            ))}
          </span>
        }
      >
        <ModeStart room={room} />
      </ModeStage>

      <SettingsPanel room={room} readOnly={!canEditConfig}>
        <MusicSettings room={room} catalog={catalog} updateConfig={updateConfig} onToast={onToast} readOnly={!canEditConfig}>
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

          {incomplete.map((p) => (
            <p key={p.id} className="tv-playlist-total" role="status">
              <SpotifyIcon size={18} />
              <span>
                {p.total - p.ready} de {p.total} canciones de <strong>{p.name}</strong> no están en iTunes, así que no
                pueden salir en la partida.
              </span>
            </p>
          ))}

          {!enoughSongs && (
            <p className="tv-playlist-total is-short" role="status">
              <Icon name="lock" size={16} strokeWidth={2.6} />
              {room.config?.playlistIds?.length === 0 ? (
                <span>Elige al menos una playlist para empezar.</span>
              ) : (
                <span>
                  Hay <strong>{songsReady} {songsReady === 1 ? "canción lista" : "canciones listas"}</strong> para {roundsSet} rondas.{" "}
                  {loading.length > 0 ? "Espera a que carguen más o baja las rondas." : "Baja las rondas o elige más playlists."}
                </span>
              )}
            </p>
          )}
        </MusicSettings>
      </SettingsPanel>
    </>
  );
}
