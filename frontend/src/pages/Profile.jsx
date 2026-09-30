import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { useApp } from "../lib/store.jsx";
import TvShell from "../components/home/TvShell.jsx";
import Avatar from "../components/home/Avatar.jsx";
import CountUp from "../components/home/CountUp.jsx";
import GoogleIcon from "../components/home/GoogleIcon.jsx";
import Icon from "../components/home/Icon.jsx";

const STATS = [
  { key: "totalScore", label: "Puntuación total", color: "pink" },
  { key: "bestScore", label: "Mejor partida", color: "violet" },
  { key: "wins", label: "Victorias", color: "amber" },
  { key: "gamesPlayed", label: "Partidas jugadas", color: "sky" },
  { key: "correctAnswers", label: "Aciertos", color: "green" },
  { key: "bestStreak", label: "Mejor racha", color: "purple" },
];

// Badge shown on the profile for staff roles (plain users get none).
const ROLE_TAGS = {
  owner: { label: "Owner", icon: "star" },
  admin: { label: "Admin", icon: "crown" },
  moderator: { label: "Moderador", icon: "check" },
};

function Notice({ tone, icon, children }) {
  return (
    <p className={`tv-notice tv-notice--${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={icon} size={18} strokeWidth={2.6} filled={icon === "star"} />
      {children}
    </p>
  );
}

function ProfileScreen() {
  const { user: currentUser, updateUsername, linkGoogle, linkingStatus, logout } = useApp();
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();

  // If userId is present in URL and differs from currentUser.id, we view a public profile
  const isOtherUser = Boolean(userId && userId !== currentUser?.id);

  const [profileData, setProfileData] = useState(null);
  const [loadingUser, setLoadingUser] = useState(isOtherUser);
  const [stats, setStats] = useState(null);

  const [newUserName, setNewUserName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Load user data
  useEffect(() => {
    if (isOtherUser) {
      setLoadingUser(true);
      setNotFound(false);
      api(`/api/users/${encodeURIComponent(userId)}`)
        .then((d) => {
          setProfileData(d.user);
          setStats(d.user?.stats || null);
          setLoadingUser(false);
        })
        .catch(() => {
          setNotFound(true);
          setLoadingUser(false);
        });
    } else if (currentUser?.id) {
      setProfileData(currentUser);
      api(`/api/users/${currentUser.id}`)
        .then((d) => {
          setStats(d.user?.stats || null);
          if (d.user) setProfileData(d.user);
        })
        .catch(() => {});
    }
  }, [userId, currentUser?.id, isOtherUser]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  async function onUpdateUsername(e) {
    e.preventDefault();
    const clean = newUserName.trim();
    if (!clean) return;
    setSavingName(true);
    setErr("");
    try {
      await updateUsername(clean);
      setMsg("Nombre de usuario actualizado.");
      setNewUserName("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingName(false);
    }
  }

  if (loadingUser) {
    return (
      <div className="tv-card tv-lobby-guest">
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          Cargando perfil…
        </p>
      </div>
    );
  }

  if (!isOtherUser && (!currentUser || currentUser.isGuest)) {
    return <Navigate to="/login?returnTo=/profile" replace />;
  }

  if (isOtherUser && notFound) {
    return (
      <div className="tv-card tv-lobby-guest">
        <h1 className="tv-lobby-title">Perfil no encontrado</h1>
        <p className="tv-lobby-sub">Este jugador no existe o borró su cuenta.</p>
        <Link to="/" className="tv-btn tv-btn--block tv-c-pink">
          <Icon name="home" size={18} />
          Volver al inicio
        </Link>
      </div>
    );
  }

  const activeUser = isOtherUser ? profileData : currentUser;
  const isGuest = Boolean(activeUser?.isGuest);
  const hasGoogle = Boolean(activeUser?.googleId || activeUser?.googleLinked || (!isOtherUser && linkingStatus?.googleLinked));
  const canLinkGoogle = !isOtherUser && !isGuest && !hasGoogle;
  const roleTag = ROLE_TAGS[activeUser?.role];
  const googleNotice = searchParams.get("google");

  return (
    <div className="tv-page">
      {searchParams.get("new") === "1" && (
        <Notice tone="brand" icon="star">¡Tu cuenta está lista! Puedes cambiar tu nombre cuando quieras.</Notice>
      )}
      {(googleNotice === "success" || googleNotice === "link_success") && (
        <Notice tone="ok" icon="check">Google conectado. Tu foto de perfil se sincronizó.</Notice>
      )}
      {googleNotice === "link_error" && (
        <Notice tone="bad" icon="lock">
          {searchParams.get("msg") || "No se pudo conectar con Google. Intenta de nuevo."}
        </Notice>
      )}
      {msg && <Notice tone="ok" icon="check">{msg}</Notice>}
      {err && <Notice tone="bad" icon="lock">{err}</Notice>}

      <section className="tv-card tv-profile-hero">
        <span className="tv-profile-avatar">
          <Avatar name={activeUser?.name} avatar={activeUser?.avatar} className="tv-avatar--xl" />
        </span>
        <div className="tv-profile-who">
          <p className="tv-party-kicker">{isOtherUser ? "Perfil de jugador" : "Tu perfil"}</p>
          <h1 className="tv-page-title">{activeUser?.name || "Jugador"}</h1>
          <div className="tv-tags">
            {roleTag && (
              <span className={`tv-tag tv-tag--${activeUser.role}`}>
                <Icon name={roleTag.icon} size={13} filled className={activeUser.role === "owner" ? "tv-tag-sparkle" : ""} />
                {roleTag.label}
                {activeUser.role === "owner" && (
                  <>
                    <Icon name="sparkle" size={13} filled strokeWidth={0} className="tv-tag-glint tv-tag-glint--1" />
                    <Icon name="sparkle" size={10} filled strokeWidth={0} className="tv-tag-glint tv-tag-glint--2" />
                    <Icon name="sparkle" size={9} filled strokeWidth={0} className="tv-tag-glint tv-tag-glint--3" />
                  </>
                )}
              </span>
            )}
            {isGuest ? (
              <span className="tv-tag">Invitado</span>
            ) : (
              <span className="tv-tag tv-tag--ok">
                <Icon name="verified" size={15} strokeWidth={2.4} className="tv-tag-verified" />
                Registrado
              </span>
            )}
            {hasGoogle && (
              <span className="tv-tag">
                <GoogleIcon size={13} />
                Google
              </span>
            )}
          </div>
        </div>
      </section>

      <div className={`tv-profile-grid${isOtherUser ? " is-single" : ""}`}>
        <section className="tv-card" aria-labelledby="tv-stats-title">
          <div className="tv-card-head">
            <h2 id="tv-stats-title" className="tv-card-title">Estadísticas</h2>
            <span className="tv-live">
              <span className="tv-pulse" aria-hidden="true" />
              En vivo
            </span>
          </div>
          {isGuest ? (
            <p className="tv-hint">Los invitados no guardan estadísticas.</p>
          ) : (
            <div className="tv-stat-grid">
              {STATS.map((s, i) => (
                <div key={s.key} className={`tv-stat tv-stat--pop tv-c-${s.color}`} style={{ "--i": i }}>
                  <span className="tv-stat-dot" aria-hidden="true" />
                  <span className="tv-stat-label">{s.label}</span>
                  <span className="tv-stat-value">
                    <CountUp value={stats?.[s.key] || 0} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {!isOtherUser && (
          <section className="tv-card" aria-labelledby="tv-account-title">
            <h2 id="tv-account-title" className="tv-card-title">Tu cuenta</h2>

            <form onSubmit={onUpdateUsername} className="tv-form">
              <label className="tv-form-row">
                <span className="tv-label">Nombre de usuario</span>
                <span className="tv-inline">
                  <input
                    className="tv-field tv-field--sm"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder={activeUser?.name || "Tu nuevo nombre"}
                    maxLength={24}
                  />
                  <button className="tv-btn tv-c-pink" type="submit" disabled={savingName || !newUserName.trim()}>
                    {savingName ? "…" : "Guardar"}
                  </button>
                </span>
              </label>
            </form>

            {canLinkGoogle && (
              <div className="tv-row-card">
                <GoogleIcon size={26} />
                <div className="tv-row-card-text">
                  <strong>Vincula Google</strong>
                  <span>Usa tu foto de Google y entra con un clic.</span>
                </div>
                <button type="button" className="tv-btn tv-btn--sm tv-btn--google" onClick={() => linkGoogle("/profile")}>
                  Vincular
                </button>
              </div>
            )}
            {hasGoogle && (
              <div className="tv-row-card">
                <GoogleIcon size={26} />
                <div className="tv-row-card-text">
                  <strong>Google vinculado</strong>
                  <span>Foto de perfil sincronizada</span>
                </div>
                <span className="tv-tag tv-tag--ok">Activo</span>
              </div>
            )}

            <div className="tv-account-foot">
              {activeUser?.email && (
                <span className="tv-email" title={activeUser.email}>{activeUser.email}</span>
              )}
              <button
                type="button"
                className="tv-link-btn tv-link-btn--danger"
                onClick={() => {
                  logout();
                  nav("/login");
                }}
              >
                <Icon name="logout" size={18} />
                Cerrar sesión
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function Profile() {
  return (
    <TvShell>
      <ProfileScreen />
    </TvShell>
  );
}
