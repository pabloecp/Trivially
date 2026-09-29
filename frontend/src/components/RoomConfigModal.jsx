import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api.js";

const ROUND_OPTIONS = [5, 10, 15, 20, 25];

const YEAR_PRESETS = [
  { label: "Todos los años", from: null, to: null },
  { label: "2024–2026", from: 2024, to: 2026 },
  { label: "2020–2023", from: 2020, to: 2023 },
  { label: "2016–2019", from: 2016, to: 2019 },
];

export default function RoomConfigModal({ isOpen, onClose, currentConfig, catalog, onSave }) {
  if (!isOpen) return null;

  const allGenreIds = useMemo(() => (catalog?.genres || []).map((g) => g.id), [catalog]);
  const allArtistIds = useMemo(() => (catalog?.artists || []).map((a) => a.id), [catalog]);

  const [rounds, setRounds] = useState(() => {
    const r = currentConfig?.rounds || 5;
    return ROUND_OPTIONS.includes(r) ? r : 5;
  });

  const [selectedGenres, setSelectedGenres] = useState(() => {
    if (currentConfig?.genreIds && currentConfig.genreIds.length > 0) {
      return currentConfig.genreIds;
    }
    return allGenreIds.length ? allGenreIds : ["reggaeton", "urbano", "trap", "pop-latino", "pop"];
  });

  const [selectedArtists, setSelectedArtists] = useState(() => {
    if (currentConfig?.artistIds && currentConfig.artistIds.length > 0) {
      return currentConfig.artistIds;
    }
    return allArtistIds.length ? allArtistIds : ["bad-bunny", "mora", "rauw-alejandro"];
  });

  const [selectedYearPreset, setSelectedYearPreset] = useState(() => {
    const from = currentConfig?.yearFrom;
    const to = currentConfig?.yearTo;
    if (!from && !to) return 0;
    const found = YEAR_PRESETS.findIndex((p) => p.from === from && p.to === to);
    return found >= 0 ? found : 0;
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Helpers: Toggle, Select All, Deselect All
  function toggleGenre(id) {
    if (selectedGenres.includes(id)) {
      setSelectedGenres(selectedGenres.filter((x) => x !== id));
    } else {
      setSelectedGenres([...selectedGenres, id]);
    }
  }

  function selectAllGenres() {
    setSelectedGenres([...allGenreIds]);
  }

  function deselectAllGenres() {
    setSelectedGenres([]);
  }

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

  const yearPreset = YEAR_PRESETS[selectedYearPreset] || YEAR_PRESETS[0];

  const candidateConfig = useMemo(() => {
    const cats = [];
    if (selectedArtists.length) cats.push("artist");
    if (selectedGenres.length) cats.push("genre");
    if (yearPreset.from || yearPreset.to) cats.push("year");

    return {
      rounds: Number(rounds),
      enabledCategories: cats,
      artistIds: selectedArtists,
      genreIds: selectedGenres,
      albumIds: currentConfig?.albumIds || [],
      playlistIds: currentConfig?.playlistIds || [],
      yearFrom: yearPreset.from,
      yearTo: yearPreset.to,
    };
  }, [rounds, selectedArtists, selectedGenres, yearPreset, currentConfig]);

  // Live query preview count
  useEffect(() => {
    if (!catalog) return;
    api("/api/catalog/preview", { method: "POST", body: candidateConfig })
      .then((data) => setPreview(data))
      .catch(() => {});
  }, [candidateConfig, catalog]);

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

  const availableCount = preview?.matchingCount ?? preview?.count ?? (catalog?.songs?.length || 31);
  const isAllGenres = selectedGenres.length === allGenreIds.length;
  const isAllArtists = selectedArtists.length === allArtistIds.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          borderRadius: 20,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Save Button Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, margin: 0, color: "var(--text)" }}>⚙️ Ajustes de la Partida</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              Modifica las opciones de las rondas para toda la sala
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="btn primary sm"
              onClick={handleSave}
              disabled={saving || availableCount < rounds}
              style={{ fontWeight: 700 }}
            >
              {saving ? "Guardando..." : "Guardar Ajustes"}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={onClose}
              style={{ fontSize: 18, width: 34, height: 34, padding: 0 }}
            >
              ✕
            </button>
          </div>
        </div>

        {err && (
          <div className="card" style={{ padding: 12, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
            <p className="error" style={{ margin: 0, fontSize: 13 }}>{err}</p>
          </div>
        )}

        {/* Live Filter Summary Badge */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="chip" style={{ fontSize: 12, background: "var(--brand-subtle)", color: "var(--brand)", fontWeight: 700 }}>
              🎤 {isAllArtists ? "Todos los artistas" : `${selectedArtists.length} artistas`}
            </span>
            <span className="chip" style={{ fontSize: 12, background: "var(--brand-subtle)", color: "var(--brand)", fontWeight: 700 }}>
              🎵 {isAllGenres ? "Todos los géneros" : `${selectedGenres.length} géneros`}
            </span>
            <span className="chip" style={{ fontSize: 12, background: "var(--brand-subtle)", color: "var(--brand)", fontWeight: 700 }}>
              📅 {yearPreset.label}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <strong style={{ fontSize: 18, color: availableCount >= rounds ? "var(--brand)" : "var(--bad)" }}>
              {availableCount}
            </strong>
            <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              canciones disponibles
            </span>
          </div>
        </div>

        {availableCount < rounds && (
          <p className="error" style={{ margin: 0, fontSize: 13 }}>
            Se necesitan al menos {rounds} canciones en el catálogo. Selecciona más artistas o géneros.
          </p>
        )}

        <form onSubmit={handleSave} className="grid" style={{ gap: 20 }}>
          {/* =========================================
              AJUSTES PRINCIPALES
             ========================================= */}

          {/* 1. Rounds (5, 10, 15, 20, 25) */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
              Número de Rondas: <span style={{ color: "var(--brand)" }}>{rounds}</span>
            </label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {ROUND_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRounds(n)}
                  className={`chip interactive ${rounds === n ? "active" : ""}`}
                  style={{
                    padding: "8px 16px",
                    fontWeight: rounds === n ? 800 : 600,
                  }}
                >
                  {n} rondas
                </button>
              ))}
            </div>
          </div>

          {/* 2. Artistas (All selected by default, with Select/Deselect All) */}
          {catalog?.artists?.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                  Artistas
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={selectAllArtists}
                    style={{ fontSize: 12, padding: "3px 8px" }}
                  >
                    Seleccionar todos
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={deselectAllArtists}
                    style={{ fontSize: 12, padding: "3px 8px" }}
                  >
                    Deseleccionar todos
                  </button>
                </div>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {catalog.artists.map((a) => {
                  const active = selectedArtists.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`chip interactive ${active ? "active" : ""}`}
                      onClick={() => toggleArtist(a.id)}
                      style={{ fontSize: 13, padding: "8px 14px" }}
                    >
                      {active ? "✓ " : "+ "}
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================
              AJUSTES AVANZADOS (Colapsable)
             ========================================= */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                fontWeight: 700,
                color: "var(--text-secondary)",
              }}
            >
              <span>⚙️ Ajustes Avanzados (Géneros y Años)</span>
              <span style={{ fontSize: 12 }}>{showAdvanced ? "▲ Ocultar" : "▼ Mostrar"}</span>
            </button>

            {showAdvanced && (
              <div className="grid" style={{ gap: 16, marginTop: 14, padding: "16px", background: "var(--bg-elevated)", borderRadius: 12 }}>
                {/* Géneros Musicales en Ajustes Avanzados */}
                {catalog?.genres?.length > 0 && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                        Géneros Musicales
                      </label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={selectAllGenres}
                          style={{ fontSize: 11, padding: "2px 6px" }}
                        >
                          Seleccionar todos
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={deselectAllGenres}
                          style={{ fontSize: 11, padding: "2px 6px" }}
                        >
                          Deseleccionar todos
                        </button>
                      </div>
                    </div>

                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {catalog.genres.map((g) => {
                        const active = selectedGenres.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            className={`chip interactive ${active ? "active" : ""}`}
                            onClick={() => toggleGenre(g.id)}
                            style={{ fontSize: 13 }}
                          >
                            {active ? "✓ " : "+ "}
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rango de Años — Solo botones */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
                    Rango de Años de Lanzamiento
                  </label>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {YEAR_PRESETS.map((preset, idx) => (
                      <button
                        key={preset.label}
                        type="button"
                        className={`chip interactive ${selectedYearPreset === idx ? "active" : ""}`}
                        onClick={() => setSelectedYearPreset(idx)}
                        style={{ fontSize: 13 }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="row" style={{ justifyContent: "flex-end", gap: 12, marginTop: 6 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={saving || availableCount < rounds}
              style={{ fontWeight: 700 }}
            >
              {saving ? "Guardando..." : "Guardar Ajustes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
