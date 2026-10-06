import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import TvShell from "../components/home/TvShell.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import GoogleIcon from "../components/home/GoogleIcon.jsx";
import Icon from "../components/home/Icon.jsx";
import Segmented from "../components/home/Segmented.jsx";

// In-app browsers (Instagram, WhatsApp, Facebook, TikTok...) are blocked by Google for sign-in.
const IN_APP_BROWSER = typeof navigator !== "undefined" && /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(navigator.userAgent);

const MODES = [
  { value: "register", label: "Crear cuenta" },
  { value: "login", label: "Iniciar sesión" },
];

function Field({ label, ...props }) {
  return (
    <label className="tv-form-row">
      <span className="tv-label">{label}</span>
      <input className="tv-field tv-field--sm" {...props} />
    </label>
  );
}

function LoginScreen() {
  const { registerAccount, loginAccount, loginWithGoogle } = useApp();
  const [params] = useSearchParams();
  // "/login?mode=login" opens on the sign-in tab (the profile's "Iniciar sesión" button).
  const [accountMode, setAccountMode] = useState(params.get("mode") === "login" ? "login" : "register");
  const [accName, setAccName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const nav = useNavigate();
  const returnTo = params.get("returnTo") || "/";

  function switchMode(mode) {
    setAccountMode(mode);
    setMsg("");
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
      await registerAccount({ name: accName.trim(), email: email.trim(), password });
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
    <div className="tv-auth">
      <header className="tv-auth-head">
        <AppIcon />
        <h1 className="tv-page-title">Entra a Trivially</h1>
        <p className="tv-page-sub">Guarda tus puntos, rachas y récords en todas tus partidas.</p>
      </header>

      {params.get("google") === "error" && (
        <p className="tv-notice tv-notice--bad" role="alert">
          <Icon name="lock" size={18} strokeWidth={2.6} />
          Error al conectar con Google: {params.get("msg") || "intenta nuevamente"}
        </p>
      )}
      {params.get("google") === "success" && (
        <p className="tv-notice tv-notice--ok" role="status">
          <Icon name="check" size={18} strokeWidth={2.8} />
          Sesión con Google iniciada
        </p>
      )}

      {IN_APP_BROWSER && (
        <p className="tv-notice tv-notice--brand" role="status">
          <Icon name="link" size={18} strokeWidth={2.6} />
          Google no permite iniciar sesión desde este navegador. Abre la página en Safari o Chrome (menú ⋯ → Abrir en el navegador).
        </p>
      )}

      <section className="tv-card tv-auth-card">
        <button type="button" className="tv-btn tv-btn--block tv-btn--google" onClick={() => loginWithGoogle(returnTo)}>
          <GoogleIcon size={22} />
          Continuar con Google
        </button>

        <div className="tv-divider"><span>o con tu correo</span></div>

        <Segmented options={MODES} value={accountMode} onChange={switchMode} label="Tipo de acceso" />

        {accountMode === "login" ? (
          <form key="login" onSubmit={onAccountLogin} className="tv-form">
            <Field
              label="Correo o nombre de usuario"
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="username"
              required
              autoFocus
            />
            <Field
              label="Contraseña"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Tu contraseña"
              autoComplete="current-password"
              required
            />
            {msg && <p className="tv-lobby-error" role="alert">{msg}</p>}
            <button className="tv-btn tv-btn--block tv-c-pink" type="submit" disabled={loading || !loginIdentifier.trim() || !loginPassword}>
              {loading ? "Entrando…" : "Iniciar sesión"}
            </button>
          </form>
        ) : (
          <form key="register" onSubmit={onAccountRegister} className="tv-form">
            <Field
              label="Nombre de usuario"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder="Cómo te verán los demás"
              maxLength={24}
              autoComplete="nickname"
              required
            />
            <Field
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
              required
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 2 caracteres"
              autoComplete="new-password"
              required
            />
            {msg && <p className="tv-lobby-error" role="alert">{msg}</p>}
            <button className="tv-btn tv-btn--block tv-c-pink" type="submit" disabled={loading || !accName.trim() || !email.trim() || !password}>
              {loading ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export default function Login() {
  return (
    <TvShell>
      <LoginScreen />
    </TvShell>
  );
}
