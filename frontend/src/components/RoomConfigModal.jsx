import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api.js";

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

  if (!isOpen) return null;

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
          maxWidth: 580,
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
        {/* Top Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 20, margin: 0, color: "var(--text)" }}>Ajustes de la Partida</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              Modifica las opciones de las rondas para toda la sala
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              aria-label="Cerrar"
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

        {availableCount < rounds && (
          <p className="error" style={{ margin: 0, fontSize: 13 }}>
            Se necesitan al menos {rounds} canciones en el catálogo. Selecciona más artistas.
          </p>
        )}

        <form onSubmit={handleSave} className="grid" style={{ gap: 20 }}>
          {/* =========================================
              AJUSTES PRINCIPALES
             ========================================= */}

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

          {/* 2. Rounds (5, 10, 15, 20, 25) */}
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

          {/* 3. Tiempo por Ronda */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
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
        </form>
      </div>
    </div>
  );
}
