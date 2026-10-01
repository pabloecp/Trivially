import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api.js";
import Icon from "./home/Icon.jsx";

const ROUND_OPTIONS = [5, 10, 15, 20, 25];
const TIME_OPTIONS = [15, 20, 25, 30];

export default function RoomConfigModal({ isOpen, onClose, currentConfig, catalog, onSave }) {
  const [activeCatalog, setActiveCatalog] = useState(catalog);

  useEffect(() => {
    if (catalog) setActiveCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    if (isOpen) {
      api("/api/catalog").then((data) => {
        if (data?.playlists) setActiveCatalog(data);
      }).catch(() => {});
    }
  }, [isOpen]);

  const playlists = activeCatalog?.playlists || [];
  const defaultPlaylistIds = useMemo(() => {
    const def = playlists.find((p) => p.isDefault) || playlists[0];
    return def ? [def.id] : [];
  }, [playlists]);

  const [rounds, setRounds] = useState(() => {
    const r = currentConfig?.rounds || 5;
    return ROUND_OPTIONS.includes(r) ? r : 5;
  });

  const [roundSeconds, setRoundSeconds] = useState(() => {
    const ms = currentConfig?.roundMs || 15000;
    const s = Math.round(ms / 1000);
    return TIME_OPTIONS.includes(s) ? s : 15;
  });

  const [selectedPlaylists, setSelectedPlaylists] = useState(() => currentConfig?.playlistIds || []);

  useEffect(() => {
    if (isOpen) {
      setSelectedPlaylists(currentConfig?.playlistIds?.length ? currentConfig.playlistIds : defaultPlaylistIds);
      if (currentConfig?.rounds) {
        setRounds(currentConfig.rounds);
      }
      if (currentConfig?.roundMs) {
        setRoundSeconds(Math.round(currentConfig.roundMs / 1000));
      }
    }
  }, [isOpen]);

  // Until the catalog arrives there is nothing selected; fall back to the default playlist then.
  useEffect(() => {
    if (isOpen && !selectedPlaylists.length && defaultPlaylistIds.length) setSelectedPlaylists(defaultPlaylistIds);
  }, [isOpen, defaultPlaylistIds]);

  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // At least one playlist stays selected.
  function togglePlaylist(id) {
    if (selectedPlaylists.includes(id)) {
      if (selectedPlaylists.length > 1) setSelectedPlaylists(selectedPlaylists.filter((x) => x !== id));
    } else {
      setSelectedPlaylists([...selectedPlaylists, id]);
    }
  }

  const candidateConfig = useMemo(() => {
    return {
      rounds: Number(rounds),
      roundMs: Number(roundSeconds) * 1000,
      playlistIds: selectedPlaylists,
    };
  }, [rounds, roundSeconds, selectedPlaylists]);

  // Live query preview count
  useEffect(() => {
    if (!isOpen) return;
    api("/api/catalog/preview", { method: "POST", body: candidateConfig })
      .then((data) => setPreview(data))
      .catch(() => {});
  }, [candidateConfig, isOpen]);

  async function handleSave(e) {
    if (e) e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      await onSave(candidateConfig);
      onClose();
    } catch (err) {
      setErr(err.message || "Error al actualizar los ajustes");
    } finally {
      setSaving(false);
    }
  }

  const availableCount = preview?.count ?? 0;

  // Close with Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const notEnough = Boolean(preview) && availableCount < rounds;

  return (
    <div className="tv-modal-root">
      <div className="tv-modal-backdrop" onClick={onClose} />
      <form
        className="tv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-config-title"
        onSubmit={handleSave}
      >
        <div className="tv-card-head">
          <div>
            <h2 id="tv-config-title" className="tv-card-title">Ajustes de la partida</h2>
            <p className="tv-hint">Se aplican a toda la sala.</p>
          </div>
          <button type="button" className="tv-icon-btn tv-icon-btn--sm" onClick={onClose} aria-label="Cerrar ajustes">
            <Icon name="close" size={20} strokeWidth={2.8} />
          </button>
        </div>

        <fieldset className="tv-fieldset">
          <legend className="tv-label">
            Playlists · <span className="tv-accent">{availableCount} canciones</span>
          </legend>
          <div className="tv-picks">
            {playlists.map((p, i) => {
              const active = selectedPlaylists.includes(p.id);
              // "Most Streamed Songs on Spotify · Español" shows as "Español" on its chip; the full name is the tooltip.
              const label = p.name.split(" · ").pop();
              return (
                <button
                  key={p.id}
                  type="button"
                  className="tv-pick tv-pick--playlist"
                  aria-pressed={active}
                  aria-label={`${p.name}, ${p.trackCount} canciones`}
                  title={p.name}
                  onClick={() => togglePlaylist(p.id)}
                  style={{ "--i": i }}
                >
                  <span className="tv-pick-art">
                    <Icon name={p.id === "top-global" ? "globe" : "music"} size={18} strokeWidth={2.4} />
                  </span>
                  {label}
                  <span className="tv-pick-count">{p.trackCount}</span>
                </button>
              );
            })}
          </div>
          <div className="tv-picks-tools">
            <button type="button" className="tv-link-btn" onClick={() => setSelectedPlaylists(playlists.map((p) => p.id))} disabled={selectedPlaylists.length === playlists.length}>
              Todas
            </button>
            <button type="button" className="tv-link-btn" onClick={() => setSelectedPlaylists(defaultPlaylistIds)} disabled={selectedPlaylists.length === 1 && selectedPlaylists[0] === defaultPlaylistIds[0]}>
              Por defecto
            </button>
          </div>
          <p key={`${selectedPlaylists.length}-${availableCount}`} className="tv-playlist-total" aria-live="polite">
            <Icon name="music" size={16} strokeWidth={2.6} />
            {selectedPlaylists.length === 1 ? "1 playlist" : `${selectedPlaylists.length} playlists`} ·{" "}
            <strong>{preview ? `${availableCount} canciones` : "contando…"}</strong>
          </p>
          <p className="tv-hint">Elige todas las que quieras; sus canciones se mezclan en la partida.</p>
        </fieldset>

        <fieldset className="tv-fieldset">
          <legend className="tv-label">Rondas</legend>
          <div className="tv-picks">
            {ROUND_OPTIONS.map((n) => (
              <button key={n} type="button" className="tv-pick" aria-pressed={rounds === n} onClick={() => setRounds(n)}>
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="tv-fieldset">
          <legend className="tv-label">Segundos por ronda</legend>
          <div className="tv-picks">
            {TIME_OPTIONS.map((sec) => (
              <button key={sec} type="button" className="tv-pick" aria-pressed={roundSeconds === sec} onClick={() => setRoundSeconds(sec)}>
                {sec} s
              </button>
            ))}
          </div>
        </fieldset>

        {notEnough && (
          <p className="tv-lobby-error" role="alert">
            Se necesitan al menos {rounds} canciones. Elige más playlists o menos rondas.
          </p>
        )}
        {err && <p className="tv-lobby-error" role="alert">{err}</p>}

        <button type="submit" className="tv-btn tv-btn--block tv-c-green" disabled={saving || notEnough}>
          {saving ? "Guardando…" : "Guardar ajustes"}
        </button>
      </form>
    </div>
  );
}
