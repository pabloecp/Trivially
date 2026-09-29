import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";
import { AuthPromptModal } from "../components/AuthPromptModal.jsx";

export default function Setup() {
  const { user, catalog, createRoom, startGame } = useApp();
  const [params] = useSearchParams();
  const mode = params.get("mode") || "solo";
  const nav = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Filter states
  const [selectedArtists, setSelectedArtists] = useState(["bad-bunny", "mora", "rauw-alejandro"]);
  const [selectedGenres, setSelectedGenres] = useState(["reggaeton"]);
  const [selectedAlbums, setSelectedAlbums] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState([]);
  const [yearMode, setYearMode] = useState("all"); // "all" | "preset" | "custom"
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [rounds, setRounds] = useState(5);

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  function toggle(list, item) {
    if (list.includes(item)) {
      if (list.length === 1) return list; // Keep at least one
      return list.filter((x) => x !== item);
    }
    return [...list, item];
  }

  // Active categories derivation
  const enabledCategories = useMemo(() => {
    const cats = [];
    if (selectedArtists.length) cats.push("artist");
    if (selectedGenres.length) cats.push("genre");
    if (selectedAlbums.length) cats.push("album");
    if (selectedPlaylists.length) cats.push("playlist");
    if (yearMode !== "all" && (yearFrom || yearTo)) cats.push("year");
    return cats;
  }, [selectedArtists, selectedGenres, selectedAlbums, selectedPlaylists, yearMode, yearFrom, yearTo]);

  const filters = useMemo(
    () => ({
      rounds: Number(rounds),
      enabledCategories,
      artistIds: selectedArtists,
      genreIds: selectedGenres,
      albumIds: selectedAlbums,
      playlistIds: selectedPlaylists,
      yearFrom: yearMode !== "all" && yearFrom ? Number(yearFrom) : null,
      yearTo: yearMode !== "all" && yearTo ? Number(yearTo) : null,
    }),
    [rounds, enabledCategories, selectedArtists, selectedGenres, selectedAlbums, selectedPlaylists, yearMode, yearFrom, yearTo]
  );

  // Live query preview count
  useEffect(() => {
    if (!catalog) return;
    api("/api/catalog/preview", { method: "POST", body: filters })
      .then(setPreview)
      .catch(() => {});
  }, [filters.rounds, filters.artistIds, filters.genreIds, filters.albumIds, filters.yearFrom, filters.yearTo, catalog]);

  // Build human-readable active filters string
  const activeFiltersLabel = useMemo(() => {
    const parts = [];
    if (selectedGenres.length) {
      const gNames = selectedGenres.map((g) => catalog?.genres?.find((x) => x.id === g)?.name || g);
      parts.push(gNames.join(", "));
    }
    if (selectedArtists.length) {
      const aNames = selectedArtists.map((a) => catalog?.artists?.find((x) => x.id === a)?.name || a);
      parts.push(aNames.join(", "));
    }
    if (yearMode !== "all" && (yearFrom || yearTo)) {
      parts.push(`${yearFrom || "Inicio"}–${yearTo || "Presente"}`);
    } else {
      parts.push("Todos los años");
    }
    if (selectedAlbums.length) {
      parts.push(`${selectedAlbums.length} álbum(es)`);
    }
    return parts.join(" + ");
  }, [selectedGenres, selectedArtists, yearMode, yearFrom, yearTo, selectedAlbums, catalog]);

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
      const state = await createRoom(mode, filters);
      if (mode === "solo") {
        await startGame();
        nav(`/game/${state.code}`);
      } else {
        nav(`/lobby/${state.code}`);
      }
    } catch (error) {
      setErr(error.message);
      setLoading(false);
    }
  }

  if (!catalog) {
    return (
      <div className="card" style={{ maxWidth: 460, margin: "60px auto", textAlign: "center" }}>
        <p className="muted">Cargando catálogo musical...</p>
      </div>
    );
  }

  return (
    <div className="grid page-container" style={{ gap: 28 }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="kicker">
            <YoavllySymbol size={16} /> Configuración de Partida
          </div>
          <h1 style={{ margin: 0 }}>
            {mode === "solo" ? "Partida Individual" : "Crear Sala Multiplayer"}
          </h1>
        </div>

        <Link to="/play" className="btn ghost sm">
          ← Cambiar Modo
        </Link>
      </div>

      {/* Live Matching Songs Banner */}
      <div
        className="card"
        style={{
          background: "linear-gradient(90deg, var(--bg-surface) 0%, var(--brand-subtle) 100%)",
          borderColor: "var(--brand)",
          padding: "18px 24px",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--brand)", letterSpacing: "0.06em", display: "block", marginBottom: 2 }}>
              Filtros activos combinados
            </span>
            <strong style={{ fontSize: 16, color: "var(--text)" }}>
              {activeFiltersLabel || "Todos los filtros activos"}
            </strong>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Outfit', sans-serif", color: "var(--brand)" }}>
              {preview?.count != null ? preview.count : "..."}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, display: "block" }}>
              canciones disponibles
            </span>
          </div>
        </div>
      </div>

      {/* 1. Artists Filter */}
      <div className="card" style={{ padding: 24 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0 }}>Artistas</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              Haz clic para incluir o excluir artistas del catálogo
            </span>
          </div>
          <span className="chip" style={{ fontSize: 12 }}>
            {selectedArtists.length} seleccionados
          </span>
        </div>

        <div className="grid grid-3" style={{ gap: 12 }}>
          {catalog.artists.map((artist) => {
            const isSelected = selectedArtists.includes(artist.id);
            return (
              <div
                key={artist.id}
                onClick={() => setSelectedArtists(toggle(selectedArtists, artist.id))}
                className="artist-card"
                style={{
                  cursor: "pointer",
                  borderColor: isSelected ? "var(--brand)" : "var(--border)",
                  background: isSelected ? "var(--brand-subtle)" : "var(--bg-surface)",
                  boxShadow: isSelected ? "0 4px 14px rgba(123, 115, 246, 0.12)" : "var(--shadow-sm)",
                }}
              >
                <img
                  src={artist.image}
                  alt={artist.name}
                  className="artist-photo"
                  style={{ width: 52, height: 52 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 15, display: "block", color: "var(--text)" }}>
                    {artist.name}
                  </strong>
                  <span style={{ fontSize: 12, color: isSelected ? "var(--brand)" : "var(--text-muted)", fontWeight: 700 }}>
                    {isSelected ? "Incluido" : "+ Añadir"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Genres & Years Filter */}
      <div className="grid grid-2" style={{ gap: 20 }}>
        {/* Genres */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Géneros</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Combina géneros musicales del catálogo:
          </p>
          <div className="row" style={{ gap: 8 }}>
            {catalog.genres.map((g) => {
              const active = selectedGenres.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`chip interactive ${active ? "active" : ""}`}
                  onClick={() => setSelectedGenres(toggle(selectedGenres, g.id))}
                >
                  {active ? "" : "+ "}
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Years Range */}
        <div className="card" style={{ padding: 24 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ fontSize: 18, margin: 0 }}>Rango de Años</h3>
            <span className="chip" style={{ fontSize: 11 }}>
              {yearMode === "all" ? "Sin restricción de año" : `${yearFrom || "Inicio"}–${yearTo || "Presente"}`}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Periodo de lanzamiento de las canciones:
          </p>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className={`chip interactive ${yearMode === "all" ? "active" : ""}`}
              onClick={() => {
                setYearMode("all");
                setYearFrom("");
                setYearTo("");
              }}
            >
              Todos los años (por defecto)
            </button>
            <button
              type="button"
              className={`chip interactive ${yearMode !== "all" && yearFrom === 2020 && yearTo === 2026 ? "active" : ""}`}
              onClick={() => {
                setYearMode("preset");
                setYearFrom(2020);
                setYearTo(2026);
              }}
            >
              2020–2026
            </button>
            <button
              type="button"
              className={`chip interactive ${yearMode !== "all" && yearFrom === 2022 && yearTo === 2025 ? "active" : ""}`}
              onClick={() => {
                setYearMode("preset");
                setYearFrom(2022);
                setYearTo(2025);
              }}
            >
              2022–2025
            </button>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>Desde (Año)</label>
              <input
                className="field"
                type="number"
                min="2016"
                max="2026"
                placeholder="Ej. 2018"
                value={yearFrom}
                onChange={(e) => {
                  setYearMode("custom");
                  setYearFrom(e.target.value);
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>Hasta (Año)</label>
              <input
                className="field"
                type="number"
                min="2016"
                max="2026"
                placeholder="Ej. 2026"
                value={yearTo}
                onChange={(e) => {
                  setYearMode("custom");
                  setYearTo(e.target.value);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Rounds and Launch */}
      <div className="card" style={{ padding: 24 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0 }}>Número de rondas</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              ¿Cuántas canciones durará la partida?
            </span>
          </div>

          <div className="row" style={{ gap: 8 }}>
            {[3, 5, 7, 10].map((num) => (
              <button
                key={num}
                type="button"
                className={`btn ${rounds === num ? "primary" : "ghost"} sm`}
                onClick={() => setRounds(num)}
              >
                {num} rondas
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div className="card" style={{ marginBottom: 16, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
            <p className="error" style={{ margin: 0 }}>{err}</p>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: 12 }}>
          <button
            className="btn primary lg"
            onClick={launch}
            disabled={loading || (preview?.count || 0) < 1}
            style={{ width: "100%", maxWidth: 360 }}
          >
            {loading
              ? "Iniciando..."
              : mode === "solo"
              ? `Jugar Partida (${rounds} rondas) →`
              : "Crear Sala Multiplayer →"}
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
