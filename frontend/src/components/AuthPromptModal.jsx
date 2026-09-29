import { Link } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "./YoavllySymbol.jsx";

export function AuthPromptModal({ isOpen, onClose, returnTo = "/play", title = "Inicia Sesión para Jugar" }) {
  const { loginWithGoogle } = useApp();

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(10, 10, 20, 0.65)",
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
          maxWidth: 440,
          padding: 32,
          position: "relative",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          animation: "scaleUp 0.15s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            background: "none",
            border: "none",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <YoavllySymbol size={44} />
          </div>
          <h2 style={{ fontSize: 22, margin: "0 0 6px" }}>{title}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Inicia sesión para crear una sala o competir con tus amigos.
          </p>
        </div>

        <div className="grid" style={{ gap: 14 }}>
          {/* Google Button */}
          <button
            type="button"
            className="btn lg"
            onClick={() => loginWithGoogle(returnTo)}
            style={{
              width: "100%",
              background: "#FFFFFF",
              color: "#1F2937",
              border: "1.5px solid #E5E7EB",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            Continuar con Google
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              margin: "6px 0",
              color: "var(--text-muted)",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ padding: "0 10px" }}>o con tu correo</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* Email / Password Link */}
          <Link
            to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="btn secondary lg"
            style={{ textAlign: "center", fontWeight: 700 }}
          >
            ✉️ Iniciar con Correo o Registrarse
          </Link>
        </div>
      </div>
    </div>
  );
}
