import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { AuthPromptModal } from "../components/AuthPromptModal.jsx";
import AlbumShowcase from "../components/AlbumShowcase.jsx";

export default function ModeSelect() {
  const { user, createRoom, joinRoom } = useApp();
  const [code, setCode] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // "create" | "join"
  const nav = useNavigate();

  async function handleCreateRoom() {
    if (!user?.name) {
      setPendingAction("create");
      setAuthModalOpen(true);
      return;
    }
    setCreating(true);
    try {
      const state = await createRoom("multi");
      nav(`/lobby/${state.code}`);
    } catch (err) {
      setJoinErr(err.message || "Error al crear la sala");
      setCreating(false);
    }
  }

  async function handleJoinSubmit(e) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;
    if (!user?.name) {
      setPendingAction("join");
      setAuthModalOpen(true);
      return;
    }
    setJoining(true);
    setJoinErr("");
    try {
      await joinRoom(cleanCode);
      nav(`/lobby/${cleanCode}`);
    } catch (err) {
      setJoinErr(err.message || "No se pudo unir a la sala");
      setJoining(false);
    }
  }

  return (
    <div className="grid page-container" style={{ maxWidth: 1080, margin: "24px auto", gap: 28 }}>
      {/* Intro Header */}
      <div style={{ textAlign: "center", maxWidth: 780, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 900,
            margin: "0 0 14px",
            letterSpacing: "-0.025em",
            lineHeight: 1.25,
            color: "var(--text)",
          }}
        >
          Reconoce la canción antes de que se acabe el tiempo
        </h1>
        <p
          className="muted"
          style={{
            margin: "0 auto",
            fontSize: 16,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          Identifica canciones en segundos, escribe el título con nuestro buscador predictivo inteligente y compite en salas multijugador sincronizadas o invita a tus amigos a tu sala en tiempo real.
        </p>
      </div>

      {joinErr && (
        <div className="card" style={{ padding: 14, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
          <p className="error" style={{ margin: 0, fontSize: 14, textAlign: "center" }}>{joinErr}</p>
        </div>
      )}

      {/* Main Grid: Action Card + Album Showcase */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        {/* Left Column: Crear Sala & Unirse */}
        <div
          className="card"
          style={{
            padding: 32,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 26,
            boxShadow: "var(--shadow-lg)",
            borderRadius: 20,
          }}
        >
          {/* 1. Crear Sala */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "var(--brand)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                boxShadow: "0 8px 24px rgba(123, 115, 246, 0.35)",
              }}
            >
              ⚡
            </div>

            <div>
              <h2 style={{ fontSize: 22, margin: "0 0 6px" }}>Crear una Nueva Sala</h2>
              <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                Genera tu sala privada al instante. Podrás iniciar la ronda solo o compartir el enlace con amigos.
              </p>
            </div>

            <button
              type="button"
              className="btn primary lg"
              onClick={handleCreateRoom}
              disabled={creating}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "16px 24px",
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {creating ? "Creando sala..." : "⚡ Crear Sala Ahora"}
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              o si ya tienes un código
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* 2. Unirse con Código */}
          <div>
            <form onSubmit={handleJoinSubmit} className="grid" style={{ gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                Unirse a una sala existente
              </label>
              <div className="row" style={{ gap: 10 }}>
                <input
                  className="field"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Código (ej. XO4K9M)"
                  maxLength={8}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                />
                <button
                  type="submit"
                  className="btn secondary"
                  disabled={joining || !code.trim()}
                  style={{ padding: "0 22px", whiteSpace: "nowrap", fontWeight: 700 }}
                >
                  {joining ? "Entrando..." : "Unirse →"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Álbumes en Rotación (AlbumShowcase) */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <AlbumShowcase />
        </div>
      </div>

      {/* Auth Prompt Modal if user is not logged in */}
      <AuthPromptModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setAuthModalOpen(false);
          if (pendingAction === "create") {
            handleCreateRoom();
          } else if (pendingAction === "join" && code.trim()) {
            nav(`/lobby/${code.trim().toUpperCase()}`);
          }
        }}
        returnTo="/play"
        title="Elige tu nombre para jugar"
      />
    </div>
  );
}
