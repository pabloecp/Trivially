import { useState } from "react";
import { Link } from "react-router-dom";
import { AVATAR_COLORS, useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "./YoavllySymbol.jsx";

export function AuthPromptModal({ isOpen, onClose, onSuccess, returnTo = "/play", title = "¿Cómo deseas jugar?" }) {
  const { saveGuest, loginWithGoogle } = useApp();
  const [tab, setTab] = useState("guest"); // Default is always guest
  const [guestName, setGuestName] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (!isOpen) return null;

  async function onGuestSubmit(e) {
    e.preventDefault();
    const clean = guestName.trim();
    if (!clean) return;
    setLoading(true);
    setErr("");
    try {
      const user = await saveGuest(clean, avatarColor);
      setLoading(false);
      if (onSuccess) onSuccess(user);
    } catch (error) {
      setErr(error.message || "Error al guardar el invitado");
      setLoading(false);
    }
  }

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
          maxWidth: 460,
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

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <YoavllySymbol size={40} />
          </div>
          <h2 style={{ fontSize: 22, margin: "0 0 6px" }}>{title}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Elige si prefieres entrar al instante como invitado o iniciar sesión para guardar tus partidas.
          </p>
        </div>

        {/* Tab switcher: Guest is default */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            background: "var(--surface-subtle, rgba(0,0,0,0.05))",
            padding: 4,
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            className={`tab-btn ${tab === "guest" ? "active" : ""}`}
            onClick={() => setTab("guest")}
            style={{
              padding: "8px 12px",
              border: "none",
              background: tab === "guest" ? "var(--bg-surface, #fff)" : "transparent",
              color: tab === "guest" ? "var(--text, #111)" : "var(--text-muted)",
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: tab === "guest" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            }}
          >
            ⚡ Invitado Rápido
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "login" ? "active" : ""}`}
            onClick={() => setTab("login")}
            style={{
              padding: "8px 12px",
              border: "none",
              background: tab === "login" ? "var(--bg-surface, #fff)" : "transparent",
              color: tab === "login" ? "var(--text, #111)" : "var(--text-muted)",
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: tab === "login" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            }}
          >
            👤 Iniciar Sesión
          </button>
        </div>

        {/* Guest Form */}
        {tab === "guest" && (
          <form onSubmit={onGuestSubmit} className="grid" style={{ gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Tu Nombre o Apodo
              </label>
              <input
                className="field"
                placeholder="Ej: YoavllyMaster"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={20}
                autoFocus
                required
              />
            </div>

            {err && <p className="error" style={{ margin: 0, fontSize: 13 }}>{err}</p>}

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 8, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Color de Avatar
              </label>
              <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      backgroundColor: c,
                      border: avatarColor === c ? "3px solid var(--text, #111)" : "2px solid transparent",
                      cursor: "pointer",
                      transform: avatarColor === c ? "scale(1.15)" : "scale(1)",
                      transition: "transform 0.1s ease",
                    }}
                  />
                ))}
              </div>
            </div>

            <button className="btn primary lg" type="submit" disabled={loading || !guestName.trim()} style={{ marginTop: 4 }}>
              {loading ? "Entrando..." : "Entrar como Invitado →"}
            </button>

            <p className="muted" style={{ margin: 0, fontSize: 12, textAlign: "center" }}>
              Podrás vincular tu cuenta de correo o Google más tarde desde tu Perfil para no perder tus puntos.
            </p>
          </form>
        )}

        {/* Login Tab */}
        {tab === "login" && (
          <div className="grid" style={{ gap: 12 }}>
            <button
              type="button"
              className="btn secondary lg"
              onClick={() => loginWithGoogle(returnTo)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                fontWeight: 600,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Continuar con Google
            </button>

            <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

            <Link
              to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
              className="btn ghost sm"
              style={{ textAlign: "center", display: "block" }}
            >
              Iniciar con Correo o Registrarse →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
