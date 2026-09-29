import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";

export default function Login() {
  const { registerAccount, loginAccount, loginWithGoogle } = useApp();
  const [accountMode, setAccountMode] = useState("register"); // "register" | "login"
  const [accName, setAccName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [params] = useSearchParams();
  const nav = useNavigate();
  const returnTo = params.get("returnTo") || "/play";

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
      nav(returnTo);
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
      nav(returnTo);
    } catch (err) {
      setMsg(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="grid page-compact" style={{ margin: "32px auto", gap: 24, maxWidth: 440 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <YoavllySymbol size={52} />
        </div>
        <div className="kicker">Identidad de Jugador</div>
        <h1 style={{ fontSize: 32, margin: "4px 0 8px" }}>Bienvenido a YOAVLLY</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Inicia sesión con Google o ingresa con tu correo.
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

      {/* Google OAuth Option */}
      <div className="card" style={{ padding: 20, textAlign: "center" }}>
        <button
          type="button"
          onClick={() => loginWithGoogle(returnTo)}
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
            margin: "20px 0 6px",
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ padding: "0 12px" }}>o con tu correo</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
      </div>

      {/* Email / Password Card */}
      <div className="card grid" style={{ gap: 20, padding: 28 }}>
        <div className="tab-group">
          <button
            type="button"
            className={`tab-btn ${accountMode === "register" ? "active" : ""}`}
            onClick={() => { setAccountMode("register"); setMsg(""); }}
          >
            Crear Cuenta
          </button>
          <button
            type="button"
            className={`tab-btn ${accountMode === "login" ? "active" : ""}`}
            onClick={() => { setAccountMode("login"); setMsg(""); }}
          >
            Iniciar Sesión
          </button>
        </div>

        {accountMode === "login" ? (
          <form onSubmit={onAccountLogin} className="grid" style={{ gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, margin: "0 0 4px" }}>Iniciar Sesión con Correo</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Introduce tu correo o nombre de usuario y tu contraseña.
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
              {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
            </button>
          </form>
        ) : (
          <form onSubmit={onAccountRegister} className="grid" style={{ gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, margin: "0 0 4px" }}>Crear Cuenta con Correo</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Crea tu cuenta para guardar tus puntos, rachas y récords.
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
              {loading ? "Creando cuenta..." : "Crear Cuenta YOAVLLY"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
