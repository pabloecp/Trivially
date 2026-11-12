import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import TvShell from "../components/home/TvShell.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import Icon from "../components/home/Icon.jsx";

// "¿Olvidaste tu contraseña?" (/restablecer). Without a token: the account's email, to get a link. With the token of
// that link (/restablecer?token=…): the new password, which also signs the account in. The server answers the same
// whether the email has an account or not, so this page does too.

function Field({ label, ...props }) {
  return (
    <label className="tv-form-row">
      <span className="tv-label">{label}</span>
      <input className="tv-field tv-field--sm" {...props} />
    </label>
  );
}

function AskLink() {
  const { forgotPassword } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setMsg(err.message || "No se pudo mandar el correo");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <section className="tv-card tv-auth-card">
        <p className="tv-notice tv-notice--ok" role="status">
          <Icon name="check" size={18} strokeWidth={2.8} />
          Si hay una cuenta con {email.trim()}, te llegará un correo con un enlace para elegir una contraseña nueva. Sirve durante 30 minutos.
        </p>
        <p className="tv-page-sub">¿No llega? Revisa la carpeta de spam o vuelve a pedirlo en unos minutos.</p>
        <Link to="/login?mode=login" className="tv-btn tv-btn--neutral tv-btn--block">
          Volver a iniciar sesión
        </Link>
      </section>
    );
  }

  return (
    <section className="tv-card tv-auth-card">
      <form onSubmit={submit} className="tv-form">
        <Field
          label="Correo de tu cuenta"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          autoComplete="email"
          required
          autoFocus
        />
        {msg && <p className="tv-lobby-error" role="alert">{msg}</p>}
        <button className="tv-btn tv-btn--block tv-c-pink" type="submit" disabled={loading || !email.includes("@")}>
          {loading ? "Mandando…" : "Mandarme el enlace"}
        </button>
        <Link to="/login?mode=login" className="tv-auth-forgot">
          Ya me acordé
        </Link>
      </form>
    </section>
  );
}

function NewPassword({ token }) {
  const { checkResetToken, resetPassword } = useApp();
  const nav = useNavigate();
  const [valid, setValid] = useState(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkResetToken(token)
      .then(setValid)
      .catch(() => setValid(false));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (password !== again) return setMsg("Las dos contraseñas no son iguales");
    setLoading(true);
    setMsg("");
    try {
      await resetPassword(token, password);
      nav("/", { replace: true });
    } catch (err) {
      setMsg(err.message || "No se pudo cambiar la contraseña");
      setLoading(false);
    }
  }

  if (valid === null) return <p className="tv-page-sub">Revisando el enlace…</p>;
  if (!valid) {
    return (
      <section className="tv-card tv-auth-card">
        <p className="tv-notice tv-notice--bad" role="alert">
          <Icon name="lock" size={18} strokeWidth={2.6} />
          Este enlace ya no sirve: se usó o pasaron más de 30 minutos.
        </p>
        <Link to="/restablecer" className="tv-btn tv-btn--primary tv-btn--block">
          Pedir otro enlace
        </Link>
      </section>
    );
  }

  return (
    <section className="tv-card tv-auth-card">
      <form onSubmit={submit} className="tv-form">
        <Field
          label="Contraseña nueva"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 2 caracteres"
          autoComplete="new-password"
          required
          autoFocus
        />
        <Field
          label="Repítela"
          type="password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          placeholder="La misma otra vez"
          autoComplete="new-password"
          required
        />
        {msg && <p className="tv-lobby-error" role="alert">{msg}</p>}
        <button className="tv-btn tv-btn--block tv-c-pink" type="submit" disabled={loading || password.length < 2 || !again}>
          {loading ? "Guardando…" : "Guardar y entrar"}
        </button>
      </form>
    </section>
  );
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return (
    <TvShell>
      <div className="tv-auth">
        <header className="tv-auth-head">
          <AppIcon />
          <h1 className="tv-page-title">{token ? "Elige una contraseña nueva" : "¿Olvidaste tu contraseña?"}</h1>
          {!token && <p className="tv-page-sub">Te mandamos un enlace a tu correo para elegir una nueva.</p>}
        </header>
        {token ? <NewPassword token={token} /> : <AskLink />}
      </div>
    </TvShell>
  );
}
