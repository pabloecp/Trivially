import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import TvShell from "../components/home/TvShell.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import GoogleIcon from "../components/home/GoogleIcon.jsx";
import Icon from "../components/home/Icon.jsx";
import Segmented from "../components/home/Segmented.jsx";
import UsernameField, { useUsernameCheck } from "../components/home/UsernameField.jsx";
import { USERNAME_MIN } from "../lib/username.js";
import { withSound } from "../lib/sounds.js";
import { useT } from "../lib/i18n.js";

import { translate as tr } from "../lib/i18n.js";
// In-app browsers (Instagram, WhatsApp, Facebook, TikTok...) are blocked by Google for sign-in.
const IN_APP_BROWSER = typeof navigator !== "undefined" && /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(navigator.userAgent);

const MODES = [
  { value: "register", get label() { return tr("Crear cuenta"); } },
  { value: "login", get label() { return tr("Iniciar sesión"); } },
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
  const t = useT();
  const { registerAccount, loginAccount, loginWithGoogle } = useApp();
  const [params] = useSearchParams();
  // "/login?mode=login" opens on the sign-in tab (the profile's "Iniciar sesión" button).
  const [accountMode, setAccountMode] = useState(params.get("mode") === "login" ? "login" : "register");
  const [accName, setAccName] = useState("");
  const [handle, setHandle] = useState("");
  const handleCheck = useUsernameCheck(handle);
  const handleOk = handle.length >= USERNAME_MIN && handleCheck.state !== "bad";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const nav = useNavigate();
  // Where to go after logging in: only a page of this site ("/…"), never another address ("//x.com", "/\x.com"),
  // like safePath on the server.
  const returnTo = safeReturnTo(params.get("returnTo"));

  function switchMode(mode) {
    setAccountMode(mode);
    setMsg("");
  }

  async function onAccountRegister(e) {
    e.preventDefault();
    if (!accName.trim() || !handleOk || !email.trim() || !password) return;
    if (password.length < 2) {
      setMsg(t("La contraseña debe tener al menos 2 caracteres"));
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      await withSound(() => registerAccount({ name: accName.trim(), username: handle, email: email.trim(), password }));
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
      await withSound(() => loginAccount(loginIdentifier.trim(), loginPassword));
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
        <h1 className="tv-page-title">{t("Entra a Trivially")}</h1>
        <p className="tv-page-sub">{t("Guarda tus puntos, rachas y récords en todas tus partidas.")}</p>
      </header>

      {params.get("google") === "error" && (
        <p className="tv-notice tv-notice--bad" role="alert">
          <Icon name="lock" size={18} strokeWidth={2.6} />
          {t("Error al conectar con Google:")} {params.get("msg") || t("intenta nuevamente")}
        </p>
      )}
      {params.get("google") === "success" && (
        <p className="tv-notice tv-notice--ok" role="status">
          <Icon name="check" size={18} strokeWidth={2.8} />
          {t("Sesión con Google iniciada")}
        </p>
      )}

      {IN_APP_BROWSER && (
        <p className="tv-notice tv-notice--brand" role="status">
          <Icon name="link" size={18} strokeWidth={2.6} />
          {t("Google no permite iniciar sesión desde este navegador. Abre la página en Safari o Chrome (menú ⋯ → Abrir en el navegador).")}
        </p>
      )}

      <section className="tv-card tv-auth-card">
        <button type="button" className="tv-btn tv-btn--block tv-btn--google" onClick={() => loginWithGoogle(returnTo)}>
          <GoogleIcon size={22} />
          {tr("Continuar con Google")}
        </button>

        <div className="tv-divider"><span>{tr("o con tu correo")}</span></div>

        <Segmented options={MODES.map((m) => ({ ...m, label: t(m.label) }))} value={accountMode} onChange={switchMode} label={t("Tipo de acceso")} />

        {accountMode === "login" ? (
          <form key="login" onSubmit={onAccountLogin} className="tv-form">
            <Field
              label={t("Correo o @usuario")}
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              placeholder={t("tu@correo.com")}
              autoComplete="username"
              required
              autoFocus
            />
            <Field
              label={t("Contraseña")}
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder={t("Tu contraseña")}
              autoComplete="current-password"
              required
            />
            {msg && <p className="tv-lobby-error" role="alert">{msg}</p>}
            <button className="tv-btn tv-btn--block tv-c-pink" type="submit" data-sound="none" disabled={loading || !loginIdentifier.trim() || !loginPassword}>
              {loading ? t("Entrando…") : t("Iniciar sesión")}
            </button>
            <Link to="/restablecer" className="tv-auth-forgot">
              {t("¿Olvidaste tu contraseña?")}
            </Link>
          </form>
        ) : (
          <form key="register" onSubmit={onAccountRegister} className="tv-form">
            <Field
              label={t("Tu nombre")}
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder={t("Cómo te verán en las partidas")}
              maxLength={24}
              autoComplete="nickname"
              required
            />
            <UsernameField value={handle} onChange={setHandle} check={handleCheck} required />
            <Field
              label={t("Correo electrónico")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("tu@correo.com")}
              autoComplete="email"
              required
            />
            <Field
              label={t("Contraseña")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Mínimo 2 caracteres")}
              autoComplete="new-password"
              required
            />
            {msg && <p className="tv-lobby-error" role="alert">{msg}</p>}
            <button className="tv-btn tv-btn--block tv-c-pink" type="submit" data-sound="none" disabled={loading || !accName.trim() || !handleOk || !email.trim() || !password}>
              {loading ? t("Creando cuenta…") : t("Crear cuenta")}
            </button>
          </form>
        )}
      </section>

      <p className="tv-legal-note">
        {t("Al entrar aceptas los")} <Link to="/terminos">{t("Términos de uso")}</Link> {t("y el")} <Link to="/privacidad">{t("Aviso de privacidad")}</Link>.
      </p>
    </div>
  );
}

function safeReturnTo(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

export default function Login() {
  return (
    <TvShell>
      <LoginScreen />
    </TvShell>
  );
}
