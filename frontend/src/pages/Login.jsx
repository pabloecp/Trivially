import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AVATAR_COLORS, useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";

export default function Login() {
  const { user, saveGuest, registerAccount, loginAccount, loginWithGoogle } = useApp();
  const [tab, setTab] = useState("guest"); // default to guest
  const [accountMode, setAccountMode] = useState("login");
  const [guestName, setGuestName] = useState(user?.name || "");
  const [accName, setAccName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [avatar, setAvatar] = useState(user?.avatar || AVATAR_COLORS[0]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [params] = useSearchParams();
  const nav = useNavigate();

  async function onGuestSubmit(e) {
    e.preventDefault();
    if (!guestName.trim()) return;
    setLoading(true);
    setMsg("");
    try {
      await saveGuest(guestName.trim(), avatar);
      nav("/play");
    } catch (err) {
      setMsg(err.message);
      setLoading(false);
    }
  }

  async function onQuickGuest() {
    setLoading(true);
    setMsg("");
    try {
      const defaultName = guestName.trim() || `Jugador${Math.floor(100 + Math.random() * 900)}`;
      await saveGuest(defaultName, avatar);
      nav("/play");
    } catch (err) {
      setMsg(err.message);
      setLoading(false);
    }
  }

  async function onAccountRegister(e) {
    e.preventDefault();
    if (!accName.trim() || !email.trim() || !password) return;
    if (password.length < 2) {
      setMsg("La contraseña debe tener al menos 2 caracteres");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      await registerAccount({
        name: accName.trim(),
        email: email.trim(),
        password,
      });
      nav("/profile?new=1");
    } catch (err) {
      setMsg(err.message);
      setLoading(false);
    }
  }

  async function onAccountLogin(e) {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) return;
    setLoading(true);
    setMsg("");
    try {
      await loginAccount(loginIdentifier.trim(), loginPassword);
      nav("/play");
    } catch (err) {
      setMsg(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="grid page-compact" style={{ margin: "24px auto", gap: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <YoavllySymbol size={52} />
        </div>
        <div className="kicker">Identidad de Jugador</div>
        <h1 style={{ fontSize: 32, margin: "4px 0 8px" }}>Bienvenido a YOAVLLY</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Entra como invitado, crea tu cuenta, o inicia con Google.
        </p>
      </div>

      {/* Status Messages from OAuth */}
      {params.get("google") === "error" && (
        <div className="card" style={{ borderColor: "var(--bad)", background: "var(--bad-subtle)", padding: 14 }}>
          <p className="error" style={{ margin: 0, textAlign: "center", fontSize: 14 }}>
            Error al conectar con Google: {params.get("msg") || "Intenta nuevamente"}
          </p>
        </div>
      )}

      {params.get("google") === "success" && (
        <div className="card" style={{ borderColor: "var(--ok)", background: "var(--ok-subtle)", padding: 14 }}>
          <p className="ok" style={{ margin: 0, textAlign: "center", fontWeight: 700, fontSize: 14 }}>
            Sesión con Google iniciada con éxito
          </p>
        </div>
      )}

      {/* Guest alert if already playing as guest */}
      {user?.isGuest && (
        <div className="card" style={{ padding: 16, background: "var(--brand-subtle)", borderColor: "var(--brand)" }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <div
              className="avatar"
              style={{ background: user.avatar || "var(--brand)", width: 40, height: 40, fontSize: 16 }}
            >
              {(user.name || "U").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 14, display: "block", color: "var(--text)" }}>
                Jugando actualmente como "{user.name}"
              </strong>
              <span className="muted" style={{ fontSize: 12 }}>
                Inicia sesión o crea tu cuenta para guardar permanentemente tus estadísticas.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Google OAuth Button */}
      <div className="card" style={{ padding: 18, textAlign: "center" }}>
        <button
          type="button"
          onClick={() => loginWithGoogle("/play")}
          className="btn lg"
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
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.12)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.06)")}
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
            margin: "18px 0 4px",
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ padding: "0 12px" }}>o con cuenta / invitado</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
      </div>

      {/* Tabs: Invitado vs Cuenta */}
      <div className="tab-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          type="button"
          className={`tab-btn ${tab === "guest" ? "active" : ""}`}
          onClick={() => { setTab("guest"); setMsg(""); }}
          style={{ padding: "12px", borderRadius: "var(--radius-sm)", fontWeight: 700, cursor: "pointer" }}
        >
          ⚡ Modo Invitado (Rápido)
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "account" ? "active" : ""}`}
          onClick={() => { setTab("account"); setMsg(""); }}
          style={{ padding: "12px", borderRadius: "var(--radius-sm)", fontWeight: 700, cursor: "pointer" }}
        >
          👤 Cuenta Permanente
        </button>
      </div>

      {/* Tab 1: Modo Invitado */}
      {tab === "guest" && (
        <form onSubmit={onGuestSubmit} className="card grid" style={{ gap: 20, padding: 28 }}>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Juega al instante</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Sin contraseña ni correo. Tus estadísticas se guardan en tu navegador y podrás asociarlas a una cuenta más tarde.
            </p>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>
              Tu Nombre o Apodo
            </label>
            <input
              className="field"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Ej: YoavllyPlayer"
              maxLength={24}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>
              Elige tu Color de Avatar
            </label>
            <div className="row" style={{ gap: 10 }}>
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatar(c)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: c,
                    border: avatar === c ? "3px solid #FFFFFF" : "2px solid transparent",
                    boxShadow: avatar === c ? "0 0 0 2px var(--brand)" : "none",
                    cursor: "pointer",
                    transition: "transform 0.1s ease",
                    transform: avatar === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {msg && <p className="error" style={{ margin: 0 }}>{msg}</p>}

          <div className="grid" style={{ gap: 10 }}>
            <button className="btn primary lg" type="submit" disabled={loading || !guestName.trim()}>
              {loading ? "Entrando..." : "Jugar como Invitado →"}
            </button>

            <button
              type="button"
              className="btn ghost sm"
              onClick={onQuickGuest}
              disabled={loading}
              style={{ color: "var(--text-muted)" }}
            >
              🎲 Asignar nombre aleatorio y entrar directo
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Cuenta Permanente */}
      {tab === "account" && (
        <div className="card grid" style={{ gap: 20, padding: 28 }}>
          <div className="tab-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, background: "var(--bg-subtle)", padding: 4, borderRadius: "var(--radius-sm)" }}>
            <button
              type="button"
              className={`tab-btn ${accountMode === "login" ? "active" : ""}`}
              onClick={() => { setAccountMode("login"); setMsg(""); }}
              style={{ padding: "8px", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              className={`tab-btn ${accountMode === "register" ? "active" : ""}`}
              onClick={() => { setAccountMode("register"); setMsg(""); }}
              style={{ padding: "8px", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Crear Cuenta
            </button>
          </div>

          {accountMode === "login" ? (
            <form onSubmit={onAccountLogin} className="grid" style={{ gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, margin: "0 0 4px" }}>Iniciar Sesión en YOAVLLY</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Introduce tu correo o nombre de usuario registrado.
                </p>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Correo o Nombre de usuario
                </label>
                <input
                  className="field"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="tu@correo.com o tu usuario"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Contraseña
                </label>
                <input
                  className="field"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                />
              </div>

              {msg && <p className="error" style={{ margin: 0 }}>{msg}</p>}

              <button className="btn primary lg" type="submit" disabled={loading || !loginIdentifier.trim() || !loginPassword}>
                {loading ? "Iniciando sesión..." : "Iniciar Sesión →"}
              </button>
            </form>
          ) : (
            <form onSubmit={onAccountRegister} className="grid" style={{ gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, margin: "0 0 4px" }}>Crear Cuenta YOAVLLY</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Elige tu nombre y contraseña. Podrás cambiar tu nombre libremente en tu perfil en cualquier momento.
                </p>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Nombre de usuario
                </label>
                <input
                  className="field"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Ej: YoavllyMaster"
                  maxLength={24}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Correo electrónico
                </label>
                <input
                  className="field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Contraseña
                </label>
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 2 caracteres"
                  required
                />
              </div>

              {msg && <p className="error" style={{ margin: 0 }}>{msg}</p>}

              <button className="btn primary lg" type="submit" disabled={loading || !accName.trim() || !email.trim() || !password}>
                {loading ? "Creando cuenta..." : "Crear Cuenta YOAVLLY →"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
