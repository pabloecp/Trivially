import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { AVATAR_COLORS, useApp } from "../lib/store.jsx";
import TvShell from "../components/home/TvShell.jsx";
import Avatar from "../components/home/Avatar.jsx";
import CountUp from "../components/home/CountUp.jsx";
import GoogleIcon from "../components/home/GoogleIcon.jsx";
import SpotifyIcon from "../components/home/SpotifyIcon.jsx";
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
  const { user: currentUser, updateUsername, updateAvatar, linkGoogle, connectSpotify, unlinkSpotify, linkingStatus, logout } =
    useApp();
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  // "Activo" on Spotify: the first tap turns it into "Desconectar", the second one disconnects.
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  useEffect(() => {
    if (!confirmUnlink) return undefined;
    const t = setTimeout(() => setConfirmUnlink(false), 3000);
    return () => clearTimeout(t);
  }, [confirmUnlink]);
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();

  // If userId is present in URL and differs from currentUser.id, we view a public profile
  const isOtherUser = Boolean(userId && userId !== currentUser?.id);

  const [profileData, setProfileData] = useState(null);
  const [loadingUser, setLoadingUser] = useState(isOtherUser);
  const [stats, setStats] = useState(null);
  // Your own stats come in a second request after the screen is already up; until then show a placeholder, not zeros.
  const [statsLoading, setStatsLoading] = useState(!isOtherUser);

  const [newUserName, setNewUserName] = useState("");
  // The color picked but not saved yet (a color from AVATAR_COLORS or "google"); null while nothing is pending.
  // Picking only previews it here: nothing goes to the server (or to the other players) until "Guardar".
  const [draftAvatar, setDraftAvatar] = useState(null);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Load user data
  useEffect(() => {
    let alive = true;
    if (isOtherUser) {
      setStatsLoading(false);
      setLoadingUser(true);
      setNotFound(false);
      api(`/api/users/${encodeURIComponent(userId)}`)
        .then((d) => {
          if (!alive) return;
          setProfileData(d.user);
          setStats(d.user?.stats || null);
          setLoadingUser(false);
        })
        .catch(() => {
          if (!alive) return;
          setNotFound(true);
          setLoadingUser(false);
        });
    } else if (currentUser?.id) {
      setProfileData(currentUser);
      setStats(null);
      setStatsLoading(true);
      api(`/api/users/${currentUser.id}`)
        .then((d) => {
          if (!alive) return;
          setStats(d.user?.stats || null);
          if (d.user) setProfileData(d.user);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setStatsLoading(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [userId, currentUser?.id, isOtherUser]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  function onPickColor(color) {
    if (saving) return;
    if (color === "google" && !googlePhoto) {
      setMsg("");
      setErr(
        isGuest
          ? "Para poner tu foto tienes que iniciar sesión con Google."
          : "Para poner tu foto tienes que vincular tu cuenta de Google."
      );
      return;
    }
    setErr("");
    setDraftAvatar(color);
  }

  // One button saves whatever was edited: the name, the color, or both.
  async function onSaveProfile(e) {
    e?.preventDefault();
    if (!canSave || saving) return;
    const withName = nameChanged;
    const withColor = colorChanged;
    setSaving(true);
    setErr("");
    try {
      if (withName) {
        await updateUsername(newUserName.trim());
        setNewUserName("");
      }
      if (withColor) {
        await updateAvatar(draftAvatar);
        setDraftAvatar(null);
      }
      setMsg(
        withName && withColor
          ? "Perfil actualizado."
          : withName
            ? "Nombre de usuario actualizado."
            : "Color actualizado."
      );
    } catch (e) {
      // What was already saved is cleared above; the rest stays so it can be saved again.
      setErr(e.message);
    } finally {
      setSaving(false);
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

  if (!isOtherUser && !currentUser) {
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
  // Older Google accounts have no googlePhoto yet; their photo is still the avatar itself.
  const googlePhoto =
    activeUser?.googlePhoto || (hasGoogle && activeUser?.avatar?.startsWith("http") ? activeUser.avatar : null);
  const canLinkGoogle = !isOtherUser && !isGuest && !hasGoogle;
  // What the avatar shows right now: the saved one, or the one picked and not saved yet.
  const pickedAvatar = draftAvatar === "google" ? googlePhoto : draftAvatar;
  const shownAvatar = pickedAvatar || activeUser?.avatar;
  const colorChanged = Boolean(pickedAvatar) && pickedAvatar !== activeUser?.avatar;
  const nameChanged = Boolean(newUserName.trim()) && newUserName.trim() !== activeUser?.name;
  const canSave = nameChanged || colorChanged;
  const roleTag = ROLE_TAGS[activeUser?.role];
  const googleNotice = searchParams.get("google");
  const hasSpotify = Boolean(activeUser?.spotify || activeUser?.spotifyLinked);
  // Only owners (the ones with the tag) see the Spotify button for now.
  const canSpotify = !isOtherUser && activeUser?.role === "owner";
  const spotifyNotice = searchParams.get("spotify");

  async function onSpotifyActive() {
    if (!confirmUnlink) {
      setConfirmUnlink(true);
      return;
    }
    setConfirmUnlink(false);
    setErr("");
    setSpotifyBusy(true);
    try {
      await unlinkSpotify();
      setMsg("Spotify desconectado de tu perfil.");
    } catch (e) {
      setErr(e.message || "No se pudo desconectar Spotify");
    } finally {
      setSpotifyBusy(false);
    }
  }

  async function onConnectSpotify() {
    setErr("");
    setSpotifyBusy(true);
    try {
      await connectSpotify();
    } catch (e) {
      setErr(e.message || "No se pudo conectar con Spotify");
      setSpotifyBusy(false);
    }
  }


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
      {spotifyNotice === "linked" && hasSpotify && <Notice tone="ok" icon="check">Spotify conectado a tu perfil.</Notice>}
      {spotifyNotice === "error" && (
        <Notice tone="bad" icon="lock">
          {searchParams.get("msg") || "No se pudo conectar con Spotify. Intenta de nuevo."}
        </Notice>
      )}
      {msg && <Notice tone="ok" icon="check">{msg}</Notice>}
      {err && <Notice tone="bad" icon="lock">{err}</Notice>}

      <section className="tv-card tv-profile-hero">
        <span className={`tv-profile-avatar${saving && colorChanged ? " is-saving" : ""}`}>
          <Avatar name={activeUser?.name} avatar={shownAvatar} className="tv-avatar--xl" />
        </span>
        <div className="tv-profile-who">
          <p className="tv-party-kicker">{isOtherUser ? "Perfil de jugador" : "Tu perfil"}</p>
          <h1 className="tv-page-title">{activeUser?.name || "Jugador"}</h1>
          <div className="tv-tags">
            {roleTag && (
              <span className={`tv-tag tv-tag--${activeUser.role}`}>
                <Icon name={roleTag.icon} size={13} filled className={activeUser.role === "owner" ? "tv-tag-sparkle" : ""} />
                {roleTag.label}
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
            {hasSpotify && (
              <span className="tv-tag tv-tag--ok">
                <SpotifyIcon size={13} color="#000" waves="#2bd94f" />
                Spotify
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
              {statsLoading && !isGuest ? "Cargando…" : "En vivo"}
            </span>
          </div>
          {isGuest ? (
            <p className="tv-hint">Los invitados no guardan estadísticas.</p>
          ) : (
            <div className="tv-stat-grid" aria-busy={statsLoading}>
              {STATS.map((s, i) => (
                <div key={s.key} className={`tv-stat tv-stat--pop tv-c-${s.color}`} style={{ "--i": i }}>
                  <span className="tv-stat-dot" aria-hidden="true" />
                  <span className="tv-stat-label">{s.label}</span>
                  <span className="tv-stat-value">
                    {statsLoading ? (
                      <span className="tv-skeleton" aria-hidden="true" />
                    ) : stats ? (
                      <CountUp value={stats[s.key] || 0} />
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {!isOtherUser && (
          <section className="tv-card" aria-labelledby="tv-account-title">
            <div className="tv-card-head">
              <h2 id="tv-account-title" className="tv-card-title">Tu cuenta</h2>
              <button
                type="button"
                className="tv-btn tv-btn--sm tv-c-pink"
                onClick={onSaveProfile}
                disabled={!canSave || saving}
                aria-busy={saving}
              >
                {saving && <span className="tv-spinner" aria-hidden="true" />}
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>

            <form onSubmit={onSaveProfile} className="tv-form">
              <label className="tv-form-row">
                <span className="tv-label">Nombre de usuario</span>
                <input
                  className="tv-field tv-field--sm"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder={activeUser?.name || "Tu nuevo nombre"}
                  maxLength={24}
                  disabled={saving}
                />
              </label>
            </form>

            <div className="tv-form-row">
              <span className="tv-label">Color de tu avatar</span>
              <div className="tv-swatches" role="group" aria-label="Color de tu avatar">
                {AVATAR_COLORS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    className="tv-swatch"
                    style={{ background: c }}
                    aria-pressed={shownAvatar === c}
                    aria-label={`Color ${i + 1}`}
                    disabled={saving}
                    onClick={() => onPickColor(c)}
                  />
                ))}
                <button
                  type="button"
                  className={`tv-swatch tv-swatch--photo${googlePhoto ? "" : " is-locked"}`}
                  aria-pressed={Boolean(googlePhoto) && shownAvatar === googlePhoto}
                  aria-label={googlePhoto ? "Usar tu foto de Google" : "Foto de perfil (requiere Google)"}
                  title={googlePhoto ? "Usar tu foto de Google" : "Inicia sesión con Google para usar tu foto"}
                  disabled={saving}
                  onClick={() => onPickColor("google")}
                >
                  {googlePhoto ? (
                    <img src={googlePhoto} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <Icon name="user" size={18} strokeWidth={2.4} />
                  )}
                </button>
              </div>
              {!googlePhoto && (
                <span className="tv-hint">
                  {isGuest ? "Inicia sesión con Google" : "Vincula Google"} para poner tu foto de perfil.
                </span>
              )}
            </div>

            {isGuest && (
              <div className="tv-row-card">
                <Icon name="user" size={26} />
                <div className="tv-row-card-text">
                  <strong>Estás como invitado</strong>
                  <span>Crea una cuenta o inicia sesión para guardar tus puntos.</span>
                </div>
              </div>
            )}

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
            {canSpotify && (
              <div className="tv-row-card">
                <SpotifyIcon size={26} />
                <div className="tv-row-card-text">
                  <strong>{hasSpotify ? "Spotify conectado" : "Conecta Spotify"}</strong>
                  <span>
                    {hasSpotify
                      ? activeUser.spotify?.displayName || "Tu cuenta de Spotify"
                      : "Vincula tu cuenta de Spotify a tu perfil."}
                  </span>
                </div>
                {hasSpotify ? (
                  <button
                    type="button"
                    className={`tv-tag tv-tag--ok tv-tag-btn${confirmUnlink ? " is-confirm" : ""}`}
                    onClick={onSpotifyActive}
                    disabled={spotifyBusy}
                    aria-label={confirmUnlink ? "Toca otra vez para desconectar Spotify" : "Spotify activo. Toca para desconectarlo"}
                  >
                    {spotifyBusy ? "Desconectando…" : confirmUnlink ? "Desconectar" : "Activo"}
                  </button>
                ) : (
                  <button type="button" className="tv-btn tv-btn--sm tv-btn--spotify" onClick={onConnectSpotify} disabled={spotifyBusy}>
                    {spotifyBusy ? "Abriendo…" : "Conectar"}
                  </button>
                )}
              </div>
            )}

            {isGuest ? (
              // A guest has nothing to sign out of: they sign in or create the account instead.
              <div className="tv-account-foot tv-account-foot--guest">
                <Link to="/login?mode=login&returnTo=/profile" className="tv-btn tv-btn--sm tv-c-neutral">
                  Iniciar sesión
                </Link>
                <Link to="/login?returnTo=/profile" className="tv-btn tv-btn--sm tv-c-pink">
                  Crear cuenta
                </Link>
              </div>
            ) : (
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
            )}
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
