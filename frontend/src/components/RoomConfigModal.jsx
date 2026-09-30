import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api.js";
import Icon from "./home/Icon.jsx";

const ROUND_OPTIONS = [5, 10, 15, 20, 25];
const TIME_OPTIONS = [15, 20, 25, 30];

const DEFAULT_CATALOG_ARTISTS = [
  { id: "bad-bunny", name: "Bad Bunny", image: "/artists/bad-bunny.jpg" },
  { id: "mora", name: "Mora", image: "/artists/mora.jpg" },
  { id: "rauw-alejandro", name: "Rauw Alejandro", image: "/artists/rauw-alejandro.jpg" },
  { id: "travis-scott", name: "Travis Scott", image: "/artists/travis-scott.jpg" },
  { id: "drake", name: "Drake", image: "/artists/drake.jpg" },
  { id: "jvke", name: "JVKE", image: "/artists/jvke.jpg" },
];

export default function RoomConfigModal({ isOpen, onClose, currentConfig, catalog, onSave }) {
  const [activeCatalog, setActiveCatalog] = useState(catalog);

  useEffect(() => {
    if (catalog) setActiveCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    if (isOpen) {
      api("/api/catalog").then((data) => {
        if (data?.artists) setActiveCatalog(data);
      }).catch(() => {});
    }
  }, [isOpen]);

  const artistsList = useMemo(() => {
    const list = activeCatalog?.artists || catalog?.artists || [];
    const map = new Map(DEFAULT_CATALOG_ARTISTS.map((a) => [a.id, a]));
    for (const a of list) {
      map.set(a.id, { ...map.get(a.id), ...a });
    }
    return Array.from(map.values());
  }, [activeCatalog, catalog]);

  const allArtistIds = useMemo(() => artistsList.map((a) => a.id), [artistsList]);

  const [rounds, setRounds] = useState(() => {
    const r = currentConfig?.rounds || 5;
    return ROUND_OPTIONS.includes(r) ? r : 5;
  });

  const [roundSeconds, setRoundSeconds] = useState(() => {
    const ms = currentConfig?.roundMs || 15000;
    const s = Math.round(ms / 1000);
    return TIME_OPTIONS.includes(s) ? s : 15;
  });

  const [selectedArtists, setSelectedArtists] = useState(() => {
    if (currentConfig?.artistIds && currentConfig.artistIds.length > 0) {
      return currentConfig.artistIds;
    }
    return ["bad-bunny", "mora", "rauw-alejandro", "travis-scott", "drake", "jvke"];
  });

  useEffect(() => {
    if (isOpen) {
      if (currentConfig?.artistIds && currentConfig.artistIds.length > 0) {
        setSelectedArtists(currentConfig.artistIds);
      }
      if (currentConfig?.rounds) {
        setRounds(currentConfig.rounds);
      }
      if (currentConfig?.roundMs) {
        setRoundSeconds(Math.round(currentConfig.roundMs / 1000));
      }
    }
  }, [isOpen]);

  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function toggleArtist(id) {
    if (selectedArtists.includes(id)) {
      setSelectedArtists(selectedArtists.filter((x) => x !== id));
    } else {
      setSelectedArtists([...selectedArtists, id]);
    }
  }

  function selectAllArtists() {
    setSelectedArtists([...allArtistIds]);
  }

  function deselectAllArtists() {
    setSelectedArtists([]);
  }

  const candidateConfig = useMemo(() => {
    return {
      rounds: Number(rounds),
      roundMs: Number(roundSeconds) * 1000,
      enabledCategories: ["artist"],
      artistIds: selectedArtists,
      genreIds: [],
      albumIds: [],
      playlistIds: [],
      yearFrom: null,
      yearTo: null,
    };
  }, [rounds, roundSeconds, selectedArtists]);

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

  const availableCount = selectedArtists.length === 0
    ? 0
    : (preview?.matchingCount ?? preview?.count ?? (selectedArtists.length * 50));
  const isAllArtists = selectedArtists.length === allArtistIds.length;

  // Close with Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const notEnough = availableCount < rounds;

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
            Artistas · <span className="tv-accent">{availableCount} canciones</span>
          </legend>
          <div className="tv-picks">
            {artistsList.map((a, i) => {
              const active = selectedArtists.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className="tv-pick tv-pick--artist"
                  aria-pressed={active}
                  onClick={() => toggleArtist(a.id)}
                  style={{ "--i": i }}
                >
                  {a.image && <img src={a.image} alt="" loading="lazy" />}
                  {a.name}
                </button>
              );
            })}
          </div>
          <div className="tv-picks-tools">
            <button type="button" className="tv-link-btn" onClick={selectAllArtists} disabled={isAllArtists}>Todos</button>
            <button type="button" className="tv-link-btn" onClick={deselectAllArtists} disabled={selectedArtists.length === 0}>Ninguno</button>
          </div>
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
            Se necesitan al menos {rounds} canciones. Elige más artistas o menos rondas.
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
