import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api.js";

export default function RoomConfigModal({ isOpen, onClose, currentConfig, catalog, onSave }) {
  if (!isOpen) return null;

  const [rounds, setRounds] = useState(currentConfig?.rounds || 5);
  const [selectedGenres, setSelectedGenres] = useState(
    currentConfig?.genreIds && currentConfig.genreIds.length ? currentConfig.genreIds : ["reggaeton"]
  );
  const [selectedArtists, setSelectedArtists] = useState(
    currentConfig?.artistIds && currentConfig.artistIds.length
      ? currentConfig.artistIds
      : ["bad-bunny", "mora", "rauw-alejandro"]
  );
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function toggle(list, item) {
    if (list.includes(item)) {
      if (list.length === 1) return list; // Keep at least one
      return list.filter((x) => x !== item);
    }
    return [...list, item];
  }

  const enabledCategories = useMemo(() => {
    const cats = [];
    if (selectedArtists.length) cats.push("artist");
    if (selectedGenres.length) cats.push("genre");
    return cats;
  }, [selectedArtists, selectedGenres]);

  const candidateConfig = useMemo(
    () => ({
      rounds: Number(rounds),
      enabledCategories,
      artistIds: selectedArtists,
      genreIds: selectedGenres,
      albumIds: currentConfig?.albumIds || [],
      playlistIds: currentConfig?.playlistIds || [],
      yearFrom: currentConfig?.yearFrom || null,
      yearTo: currentConfig?.yearTo || null,
    }),
    [rounds, enabledCategories, selectedArtists, selectedGenres, currentConfig]
  );

  // Fetch song preview count
  useEffect(() => {
    if (!catalog) return;
    api("/api/catalog/preview", { method: "POST", body: candidateConfig })
      .then(setPreview)
      .catch(() => {});
  }, [candidateConfig, catalog]);

  async function handleSave(e) {
    e.preventDefault();
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

  const availableCount = preview?.matchingCount ?? 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(5px)",
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
          padding: 28,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          borderRadius: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 22, margin: 0, color: "var(--text)" }}>⚙️ Ajustes de la Partida</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Modifica las opciones de las rondas para toda la sala
            </p>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={onClose}
            style={{ fontSize: 18, width: 36, height: 36, padding: 0 }}
          >
            ✕
          </button>
        </div>

        {err && (
          <div className="card" style={{ padding: 12, borderColor: "var(--bad)", background: "var(--bad-subtle)", marginBottom: 16 }}>
            <p className="error" style={{ margin: 0, fontSize: 13 }}>{err}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="grid" style={{ gap: 20 }}>
          {/* Rounds */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8, color: "var(--text)" }}>
              Número de Rondas: <span style={{ color: "var(--brand)" }}>{rounds}</span>
            </label>
            <div className="row" style={{ gap: 8 }}>
              {[3, 5, 7, 10, 15].map((n) => (
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

          {/* Genres */}
          {catalog?.genres?.length > 0 && (
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 6, color: "var(--text)" }}>
                Géneros Musicales
              </label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {catalog.genres.map((g) => {
                  const active = selectedGenres.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={`chip interactive ${active ? "active" : ""}`}
                      onClick={() => setSelectedGenres(toggle(selectedGenres, g.id))}
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

          {/* Artists */}
          {catalog?.artists?.length > 0 && (
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 6, color: "var(--text)" }}>
                Artistas
              </label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {catalog.artists.map((a) => {
                  const active = selectedArtists.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`chip interactive ${active ? "active" : ""}`}
                      onClick={() => setSelectedArtists(toggle(selectedArtists, a.id))}
                      style={{ fontSize: 13 }}
                    >
                      {active ? "✓ " : "+ "}
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Match preview badge */}
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: availableCount >= rounds ? "var(--ok-subtle)" : "var(--bad-subtle)",
              border: `1px solid ${availableCount >= rounds ? "var(--ok-border)" : "var(--bad-border)"}`,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ color: "var(--text)" }}>
              Canciones disponibles con estos filtros:
            </span>
            <strong style={{ color: availableCount >= rounds ? "var(--ok)" : "var(--bad)", fontSize: 14 }}>
              {availableCount} canciones
            </strong>
          </div>

          {availableCount < rounds && (
            <p className="error" style={{ margin: 0, fontSize: 12 }}>
              Se necesitan al menos {rounds} canciones en el catálogo. Selecciona más artistas o géneros.
            </p>
          )}

          {/* Actions */}
          <div className="row" style={{ justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
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
            >
              {saving ? "Guardando..." : "Guardar Ajustes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
