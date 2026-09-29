import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";
import { AuthPromptModal } from "../components/AuthPromptModal.jsx";

export default function ModeSelect() {
  const { user } = useApp();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [targetPath, setTargetPath] = useState("/play/setup?mode=solo");
  const nav = useNavigate();

  function handleSelectMode(path) {
    if (user?.name) {
      nav(path);
    } else {
      setTargetPath(path);
      setAuthModalOpen(true);
    }
  }

  return (
    <div className="grid page-container" style={{ gap: 32 }}>
      {/* Header — always visible to everyone */}
      <div>
        <div className="kicker">
          <YoavllySymbol size={16} /> {user?.name ? `Hola, ${user.name}` : "YOAVLLY Game Modes"}
        </div>
        <h1>Selecciona un modo de juego</h1>
        <p className="muted">
          Elige si quieres practicar en solitario o retar a tus amigos en una partida sincronizada en tiempo real.
        </p>
      </div>

      <div className="grid grid-2" style={{ gap: 24 }}>
        {/* Solo Mode */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelectMode("/play/setup?mode=solo")}
          onKeyDown={(e) => e.key === "Enter" && handleSelectMode("/play/setup?mode=solo")}
          className="card interactive"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 32,
            gap: 20,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "var(--brand-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 24 }}>🎧</span>
            </div>
            <div className="kicker">Individual</div>
            <h2 style={{ fontSize: 24, margin: "4px 0 10px" }}>Solo</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              Juega a tu propio ritmo. Pon a prueba tus reflejos, mejora tus rachas de aciertos y entrena con filtros personalizados.
            </p>
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="btn ghost sm">Configurar y Jugar →</span>
            <span className="chip">1 Jugador</span>
          </div>
        </div>

        {/* Multiplayer Mode */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelectMode("/play/setup?mode=multi")}
          onKeyDown={(e) => e.key === "Enter" && handleSelectMode("/play/setup?mode=multi")}
          className="card interactive"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 32,
            gap: 20,
            border: "1.5px solid var(--brand)",
            background: "linear-gradient(180deg, var(--brand-tint) 0%, var(--bg-surface) 100%)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "var(--brand)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                boxShadow: "0 4px 12px rgba(123, 115, 246, 0.3)",
              }}
            >
              <span style={{ fontSize: 22 }}>⚡</span>
            </div>
            <div className="kicker">Multijugador en Vivo</div>
            <h2 style={{ fontSize: 24, margin: "4px 0 10px" }}>Multiplayer</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              Crea una sala privada con código XO, compártelo con tus amigos y compitan con reloj y audios sincronizados.
            </p>
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="btn primary sm">Crear Sala Nueva →</span>
            <span className="chip active">En Vivo</span>
          </div>
        </div>
      </div>

      {/* Or Join with Code */}
      <div className="card" style={{ padding: "20px 28px" }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <strong style={{ fontSize: 16, display: "block" }}>¿Tienes un código de sala?</strong>
            <span className="muted" style={{ fontSize: 14 }}>
              Si un amigo ya creó una sala (ej. XO4K9M), únete directamente con su código.
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleSelectMode("/play/join")}
            className="btn ghost sm"
          >
            Unirse con código →
          </button>
        </div>
      </div>

      {/* Auth Prompt Modal (Guest by default) */}
      <AuthPromptModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setAuthModalOpen(false);
          nav(targetPath);
        }}
        returnTo={targetPath}
        title="Antes de crear la sala"
      />
    </div>
  );
}
