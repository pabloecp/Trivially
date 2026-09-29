import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";
import { AuthPromptModal } from "../components/AuthPromptModal.jsx";

const ROUND_OPTIONS = [5, 10, 15, 20, 25];

const YEAR_PRESETS = [
  { label: "Todos los años", from: null, to: null },
  { label: "2024–2026", from: 2024, to: 2026 },
  { label: "2020–2023", from: 2020, to: 2023 },
  { label: "2016–2019", from: 2016, to: 2019 },
];

export default function Setup() {
  const { user, catalog, createRoom } = useApp();
  const [params] = useSearchParams();
  const mode = params.get("mode") || "multi";
  const nav = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const allGenreIds = useMemo(() => (catalog?.genres || []).map((g) => g.id), [catalog]);
  const allArtistIds = useMemo(() => (catalog?.artists || []).map((a) => a.id), [catalog]);

  // Filter states: Default to ALL genres and ALL artists
  const [selectedArtists, setSelectedArtists] = useState(() =>
    allArtistIds.length ? allArtistIds : ["bad-bunny", "mora", "rauw-alejandro"]
  );
  const [selectedGenres, setSelectedGenres] = useState(() =>
    allGenreIds.length ? allGenreIds : ["reggaeton", "urbano", "trap", "pop-latino", "pop"]
  );
  const [selectedYearPreset, setSelectedYearPreset] = useState(0);
  const [rounds, setRounds] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Update defaults when catalog loads
  useEffect(() => {
    if (allGenreIds.length && (!selectedGenres.length || selectedGenres.length === 1)) {
      setSelectedGenres(allGenreIds);
    }
    if (allArtistIds.length && (!selectedArtists.length || selectedArtists.length < 3)) {
      setSelectedArtists(allArtistIds);
    }
  }, [allGenreIds, allArtistIds]);

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
      albumIds: [],
      playlistIds: [],
      yearFrom: yearPreset.from,
      yearTo: yearPreset.to,
    };
  }, [rounds, selectedArtists, selectedGenres, yearPreset]);

  // Live query preview count
  useEffect(() => {
    if (!catalog) return;
    api("/api/catalog/preview", { method: "POST", body: candidateConfig })
      .then((data) => setPreview(data))
      .catch(() => {});
  }, [candidateConfig, catalog]);

  async function launch() {
    if (!user?.name) {
      setShowAuthModal(true);
      return;
    }
    await launchRoom();
  }

  async function launchRoom() {
    setLoading(true);
    setErr("");
    try {
      const state = await createRoom("multi", candidateConfig);
      nav(`/lobby/${state.code}`);
    } catch (error) {
      setErr(error.message || "Error al crear la sala");
      setLoading(false);
    }
  }

  const availableCount = preview?.matchingCount ?? preview?.count ?? (catalog?.songs?.length || 31);
  const isAllGenres = selectedGenres.length === allGenreIds.length;
  const isAllArtists = selectedArtists.length === allArtistIds.length;

  if (!catalog) {
    return (
      <div className="card" style={{ maxWidth: 460, margin: "60px auto", textAlign: "center" }}>
        <p className="muted">Cargando catálogo musical...</p>
      </div>
    );
  }

  return (
    <div className="grid page-container" style={{ maxWidth: 760, margin: "16px auto", gap: 20 }}>
      {/* Top Header with Quick Action */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div className="kicker">
            <YoavllySymbol size={16} /> Configuración de Partida
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 28, letterSpacing: "-0.02em" }}>
            Ajustes de la Sala
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link to="/play" className="btn ghost sm">
            ← Cancelar
          </Link>
          <button
            type="button"
            className="btn primary"
            onClick={launch}
            disabled={loading || availableCount < rounds}
            style={{ fontWeight: 800, padding: "10px 22px" }}
          >
            {loading ? "Creando sala..." : "⚡ Crear Sala"}
          </button>
        </div>
      </div>

      {err && (
        <div className="card" style={{ padding: 12, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
          <p className="error" style={{ margin: 0, fontSize: 13 }}>{err}</p>
        </div>
      )}

      {/* Clean Live Filter Summary Banner */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 22, color: availableCount >= rounds ? "var(--brand)" : "var(--bad)" }}>
            {availableCount}
          </strong>
          <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
            canciones disponibles
          </span>
        </div>
      </div>

      {availableCount < rounds && (
        <p className="error" style={{ margin: 0, fontSize: 13 }}>
          Se necesitan al menos {rounds} canciones en el catálogo. Selecciona más artistas o géneros.
        </p>
      )}

      {/* Main Settings Card */}
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24, borderRadius: 18 }}>
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
        {catalog.artists?.length > 0 && (
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
              padding: "10px 12px",
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
              {catalog.genres?.length > 0 && (
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

        {/* Bottom Action Bar */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Link to="/play" className="btn secondary">
            Cancelar
          </Link>
          <button
            type="button"
            className="btn primary lg"
            onClick={launch}
            disabled={loading || availableCount < rounds}
            style={{ fontWeight: 800, minWidth: 220 }}
          >
            {loading ? "Creando sala..." : "⚡ Crear Sala Ahora →"}
          </button>
        </div>
      </div>

      <AuthPromptModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          launchRoom();
        }}
        returnTo={`/play/setup?mode=${mode}`}
        title="Antes de crear la sala"
      />
    </div>
  );
}
