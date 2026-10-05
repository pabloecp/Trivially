import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useApp } from "../../lib/store.jsx";
import { TriviallySymbol } from "../../components/TriviallySymbol.jsx";
import { AuthPromptModal } from "../../components/AuthPromptModal.jsx";

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

export default function Setup() {
  const { user, catalog, refreshCatalog, createRoom, saveGuest } = useApp();
  const [params] = useSearchParams();
  const mode = params.get("mode") || "multi";
  const nav = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    refreshCatalog?.();
  }, [refreshCatalog]);

  const artistsList = useMemo(() => {
    const list = catalog?.artists || [];
    const map = new Map(DEFAULT_CATALOG_ARTISTS.map((a) => [a.id, a]));
    for (const a of list) {
      map.set(a.id, { ...map.get(a.id), ...a });
    }
    return Array.from(map.values());
  }, [catalog]);

  const allArtistIds = useMemo(() => artistsList.map((a) => a.id), [artistsList]);

  // Filter states: Default to ALL artists
  const [selectedArtists, setSelectedArtists] = useState(() => allArtistIds);
  const [rounds, setRounds] = useState(5);
  const [roundSeconds, setRoundSeconds] = useState(15);

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
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
    if (!catalog) return;
    api("/api/catalog/preview", { method: "POST", body: candidateConfig })
      .then((data) => setPreview(data))
      .catch(() => {});
  }, [candidateConfig, catalog]);

  async function launch() {
    await launchRoom();
  }

  async function launchRoom() {
    setLoading(true);
    setErr("");
    try {
      let currentUser = user;
      if (!currentUser?.name) {
        const autoName = `Jugador${Math.floor(100 + Math.random() * 900)}`;
        currentUser = await saveGuest(autoName);
      }
      const state = await createRoom("multi", candidateConfig, "musica", currentUser);
      nav(`/lobby/${state.code}`);
    } catch (error) {
      setErr(error.message || "Error al crear la sala");
      setLoading(false);
    }
  }

  const availableCount = selectedArtists.length === 0
    ? 0
    : (preview?.matchingCount ?? preview?.count ?? (selectedArtists.length * 50));
  const isAllArtists = selectedArtists.length === allArtistIds.length;

  if (!catalog) {
    return (
      <div className="card" style={{ maxWidth: 460, margin: "60px auto", textAlign: "center" }}>
        <p className="muted" style={{ margin: 0 }}>Cargando catálogo musical...</p>
      </div>
    );
  }

  return (
    <div className="grid page-container" style={{ maxWidth: 760, margin: "16px auto", gap: 20 }}>
      {/* Top Header with Quick Action */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div className="kicker">
            <TriviallySymbol size={16} /> Configuración de Partida
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 28, letterSpacing: "-0.02em" }}>
            Ajustes de la Sala
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link to="/play" className="btn ghost sm">
            Cancelar
          </Link>
          <button
            type="button"
            className="btn primary"
            onClick={launch}
            disabled={loading || availableCount < rounds}
            style={{ fontWeight: 800, padding: "10px 22px" }}
          >
            {loading ? "Creando sala..." : "Crear Sala"}
          </button>
        </div>
      </div>

      {err && (
        <div className="card" style={{ padding: 12, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
          <p className="error" style={{ margin: 0, fontSize: 13 }}>{err}</p>
        </div>
      )}

      {availableCount < rounds && (
        <p className="error" style={{ margin: 0, fontSize: 13 }}>
          Se necesitan al menos {rounds} canciones en el catálogo. Selecciona más artistas.
        </p>
      )}

      {/* Main Settings Card */}
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24, borderRadius: 18 }}>
        {/* 1. Artistas */}
        <div>
          <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
            Artistas: <span style={{ color: "var(--brand)" }}>{availableCount} canciones</span>
          </label>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {artistsList.map((a) => {
                const active = selectedArtists.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`chip interactive ${active ? "active" : ""}`}
                    onClick={() => toggleArtist(a.id)}
                    style={{
                      fontSize: 13,
                      padding: "6px 14px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      borderRadius: 9999,
                    }}
                  >
                    {a.image && (
                      <img
                        src={a.image}
                        alt={a.name}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                    <span>{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

        {/* 2. Número de Rondas (5, 10, 15, 20, 25) */}
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

        {/* 3. Tiempo por ronda */}
        <div>
          <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
            Tiempo por Ronda: <span style={{ color: "var(--brand)" }}>{roundSeconds} segundos</span>
          </label>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {TIME_OPTIONS.map((sec) => (
              <button
                key={sec}
                type="button"
                className={`chip interactive ${roundSeconds === sec ? "active" : ""}`}
                onClick={() => setRoundSeconds(sec)}
                style={{
                  fontSize: 13,
                  padding: "8px 14px",
                  fontWeight: roundSeconds === sec ? 800 : 600,
                }}
              >
                {sec} segundos
              </button>
            ))}
          </div>
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
            {loading ? "Creando sala..." : "Crear Sala"}
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
