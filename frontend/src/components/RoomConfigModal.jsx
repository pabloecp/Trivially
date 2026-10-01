import { useState, useEffect, useMemo, useRef } from "react";
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
  // The selection is filled in once per opening (the room's playlists, or the default one), never again while the
  // player is tapping, so an empty selection stays empty.
  const filled = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      filled.current = false;
      return;
    }
    if (currentConfig?.rounds) setRounds(currentConfig.rounds);
    if (currentConfig?.roundMs) setRoundSeconds(Math.round(currentConfig.roundMs / 1000));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || filled.current || !playlists.length) return;
    filled.current = true;
    const known = currentConfig?.playlistIds?.filter((id) => playlists.some((p) => p.id === id)) || [];
    setSelectedPlaylists(known.length ? known : defaultPlaylistIds);
  }, [isOpen, playlists, defaultPlaylistIds]);

  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function togglePlaylist(id) {
    setSelectedPlaylists((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  const candidateConfig = useMemo(() => {
    return {
      rounds: Number(rounds),
      roundMs: Number(roundSeconds) * 1000,
      playlistIds: selectedPlaylists,
    };
  }, [rounds, roundSeconds, selectedPlaylists]);

  // How many different songs the chosen playlists add up to (they overlap, so the server counts them). Only the
  // answer to the latest selection is kept.
  const previewReq = useRef(0);
  useEffect(() => {
    if (!isOpen || !selectedPlaylists.length) return;
    const req = ++previewReq.current;
    api("/api/catalog/preview", { method: "POST", body: { playlistIds: selectedPlaylists } })
      .then((data) => req === previewReq.current && setPreview(data))
      .catch(() => {});
  }, [selectedPlaylists, isOpen]);

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

  const availableCount = selectedPlaylists.length ? preview?.count ?? 0 : 0;

  // Close with Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const counting = selectedPlaylists.length > 0 && !preview;
  const notEnough = !counting && availableCount < rounds;

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
            Playlists
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
                    <Icon name="music" size={18} strokeWidth={2.4} />
                  </span>
                  {label}
                  <span className="tv-pick-count">{p.trackCount}</span>
                </button>
              );
            })}
          </div>
          <p className={`tv-playlist-total${notEnough ? " is-short" : ""}`} aria-live="polite">
            <Icon name={notEnough ? "lock" : "music"} size={16} strokeWidth={2.6} />
            {notEnough ? (
              <span>
                Necesitas al menos <strong>{rounds} canciones</strong>
                {selectedPlaylists.length ? ` (tienes ${availableCount})` : ""}
              </span>
            ) : (
              <span>
                {selectedPlaylists.length === 1 ? "1 playlist" : `${selectedPlaylists.length} playlists`} ·{" "}
                <strong>{counting ? "contando…" : `${availableCount} canciones`}</strong>
              </span>
            )}
          </p>
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

        {err && <p className="tv-lobby-error" role="alert">{err}</p>}

        <button type="submit" className="tv-btn tv-btn--block tv-c-green" disabled={saving || notEnough || counting}>
          {saving ? "Guardando…" : "Guardar ajustes"}
        </button>
      </form>
    </div>
  );
}
