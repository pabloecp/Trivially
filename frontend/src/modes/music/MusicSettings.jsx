import { useEffect, useState } from "react";
import Icon from "../../components/home/Icon.jsx";
import OptionRow, { rangeOptions } from "../../components/home/OptionRow.jsx";
import SpotifyIcon from "../../components/home/SpotifyIcon.jsx";
import { playlistLabel } from "./playlistLabel.js";
import { useApp } from "../../lib/store.jsx";

// Rounds and seconds go in steps of 5. The server keeps the same limits (roomManager.updateConfig).
const ROUNDS = { min: 5, max: 25, step: 5 };
const SECONDS = { min: 15, max: 35, step: 5 };

function configKey(config) {
  return JSON.stringify([config?.playlistIds || [], config?.rounds, config?.roundMs]);
}

// The match settings, in the settings panel. Every tap is saved straight away for the whole room; the local copy
// only keeps the tap visible until the server's new state arrives. `children` go at the bottom.
// With `readOnly` (players without permission to change them) everything shows but nothing can be tapped.
export default function MusicSettings({ room, catalog, updateConfig, onToast, children, readOnly = false }) {
  const { user, listSpotifyPlaylists, addSpotifyPlaylist, connectSpotify } = useApp();
  const playlists = catalog?.playlists || [];
  // Spotify playlists already added to the room.
  const custom = room.customPlaylists || [];
  // Among those who may change the settings (the host or a player with permission), owners get the Spotify button.
  // Without Spotify connected it asks to connect it; with it, it opens their playlists. Closed, only the chosen ones
  // show.
  const isOwnerEditor = !readOnly && user?.role === "owner";
  const spotifyLinked = Boolean(user?.spotify);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [askLink, setAskLink] = useState(false);
  const [spotifyLists, setSpotifyLists] = useState(null);
  const [spotifyBusy, setSpotifyBusy] = useState("");
  const defaultIds = playlists.filter((p) => p.isDefault).map((p) => p.id);
  const [draft, setDraft] = useState(room.config);

  // Another player with permission may change them too.
  useEffect(() => {
    setDraft(room.config);
  }, [configKey(room.config)]);

  const known = (draft?.playlistIds || []).filter((id) => playlists.some((p) => p.id === id) || custom.some((p) => p.id === id));
  // Every playlist unticked stays empty (the match then can't start); otherwise unknown ids fall back to the default.
  const selected = draft?.playlistIds?.length === 0 ? [] : known.length ? known : defaultIds;
  const hasCustom = selected.some((id) => id.startsWith("sp:"));
  const chosenCustom = custom.filter((p) => selected.includes(p.id));
  const rounds = draft?.rounds || 5;
  const seconds = Math.round((draft?.roundMs || 15000) / 1000);
  const songCount = playlists.filter((p) => selected.includes(p.id)).reduce((n, p) => n + p.trackCount, 0);

  async function onPlus() {
    if (!spotifyLinked) {
      setAskLink((v) => !v);
      return;
    }
    if (spotifyOpen) {
      setSpotifyOpen(false);
      return;
    }
    setSpotifyOpen(true);
    if (!spotifyLists) await showSpotifyPlaylists();
  }

  async function onConnectSpotify() {
    setSpotifyBusy("connect");
    try {
      await connectSpotify();
    } catch (err) {
      onToast?.(err.message || "No se pudo conectar con Spotify");
      setSpotifyBusy("");
    }
  }

  async function showSpotifyPlaylists() {
    setSpotifyBusy("list");
    try {
      setSpotifyLists(await listSpotifyPlaylists());
    } catch (err) {
      onToast?.(err.message || "No se pudieron leer tus playlists de Spotify");
    } finally {
      setSpotifyBusy("");
    }
  }

  async function addSpotify(id) {
    // Added before and then unselected: it only needs selecting again.
    if (custom.some((c) => c.id === `sp:${id}`)) return togglePlaylist(`sp:${id}`);
    setSpotifyBusy(id);
    try {
      await addSpotifyPlaylist(id);
    } catch (err) {
      onToast?.(err.message || "No se pudo añadir la playlist");
    } finally {
      setSpotifyBusy("");
    }
  }

  async function save(change) {
    if (readOnly) return;
    const next = { ...draft, ...change };
    setDraft(next);
    try {
      await updateConfig({ playlistIds: next.playlistIds ?? selected, rounds: next.rounds || rounds, roundMs: next.roundMs || seconds * 1000 });
    } catch (err) {
      setDraft(room.config);
      onToast?.(err.message || "No se pudieron guardar los ajustes");
    }
  }

  function togglePlaylist(id) {
    if (selected.includes(id)) {
      save({ playlistIds: selected.filter((x) => x !== id) });
    } else {
      save({ playlistIds: [...selected, id] });
    }
  }

  const listOptions = [
    // "Most Streamed Songs on Spotify · Español" shows as "Top 500 Español"; the full name is the tooltip.
    ...playlists.map((p) => ({ value: p.id, label: playlistLabel(p), title: p.name })),
    ...chosenCustom.map((p) => ({ value: p.id, label: p.name, title: `${p.ready} de ${p.total} canciones listas` })),
  ];

  return (
    <fieldset className="tv-settings" disabled={readOnly}>
      <OptionRow
        label="Canciones"
        multi
        wrap
        options={listOptions}
        value={selected}
        onChange={togglePlaylist}
        onSetAll={(playlistIds) => save({ playlistIds })}
      >
        {isOwnerEditor &&
          spotifyOpen &&
          (spotifyLists || [])
            .filter((p) => !selected.includes(`sp:${p.id}`))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="tv-optrow-btn is-spotify"
                aria-pressed={false}
                title={`${p.name} · ${p.total} canciones`}
                disabled={Boolean(spotifyBusy)}
                onClick={() => addSpotify(p.id)}
              >
                {spotifyBusy === p.id ? "Añadiendo…" : p.name}
              </button>
            ))}
        {isOwnerEditor && (
          <button
            type="button"
            className="tv-optrow-btn is-add"
            onClick={onPlus}
            disabled={spotifyBusy === "list"}
            aria-expanded={spotifyLinked ? spotifyOpen : askLink}
            aria-label={spotifyOpen ? "Ocultar tus playlists de Spotify" : "Añadir tus playlists de Spotify"}
            title="Tus playlists de Spotify"
          >
            {spotifyOpen ? <Icon name="close" size={16} strokeWidth={3} /> : <SpotifyIcon size={18} />}
            {spotifyBusy === "list" ? "Cargando…" : spotifyOpen ? "Ocultar" : "Spotify"}
          </button>
        )}
      </OptionRow>
      {isOwnerEditor && askLink && !spotifyLinked && (
        <div className="tv-spotify-ask">
          <SpotifyIcon size={26} />
          <span>Conecta tu Spotify para jugar con tus playlists.</span>
          <button
            type="button"
            className="tv-btn tv-btn--sm tv-btn--spotify"
            onClick={onConnectSpotify}
            disabled={spotifyBusy === "connect"}
          >
            {spotifyBusy === "connect" ? "Abriendo…" : "Conectar"}
          </button>
        </div>
      )}
      {isOwnerEditor && spotifyOpen && spotifyLists?.length === 0 && (
        <p className="tv-playlist-total">No encontramos playlists en tu Spotify.</p>
      )}
      {!hasCustom && selected.length > 0 && playlists.length > 0 && songCount < rounds && (
        <p className="tv-playlist-total is-short" role="alert">
          <Icon name="lock" size={16} strokeWidth={2.6} />
          <span>
            Necesitas al menos <strong>{rounds} canciones</strong> (tienes {songCount})
          </span>
        </p>
      )}

      <OptionRow label="Rondas" options={rangeOptions(ROUNDS)} value={rounds} onChange={(n) => save({ rounds: n })} />
      <OptionRow
        label="Segundos por ronda"
        options={rangeOptions(SECONDS)}
        value={seconds}
        onChange={(n) => save({ roundMs: n * 1000 })}
      />

      {children}
    </fieldset>
  );
}
