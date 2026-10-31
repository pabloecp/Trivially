import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import UsernameField, { useUsernameCheck } from "../components/home/UsernameField.jsx";
import { USERNAME_MIN } from "../lib/username.js";
import { useApp } from "../lib/store.jsx";
import TvShell from "../components/home/TvShell.jsx";
import Avatar from "../components/home/Avatar.jsx";
import Blob from "../components/home/Blob.jsx";
import CountUp from "../components/home/CountUp.jsx";
import GoogleIcon from "../components/home/GoogleIcon.jsx";
import SpotifyIcon from "../components/home/SpotifyIcon.jsx";
import Icon from "../components/home/Icon.jsx";
import { BLOB_COLORS, HOW_TO_GET, blobColor, canUseColor } from "../lib/blobColors.js";

// Only what matters: how many matches you won and how many questions you got right.
const STATS = [
  { key: "wins", label: "Victorias", color: "amber" },
  { key: "correctAnswers", label: "Aciertos", color: "green" },
];

// Badge shown on the profile for owners (plain users get none).
const ROLE_TAGS = {
  owner: { label: "Owner", icon: "star" },
};

function Notice({ tone, icon, children }) {
  return (
    <p className={`tv-notice tv-notice--${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={icon} size={18} strokeWidth={2.6} filled={icon === "star"} />
      {children}
    </p>
  );
}

// "Color de tu Blob": every colour, like an inventory. The ones you can use are tapped to wear them (the one you wear in
// the site's blue); the others are dimmed with a lock, and a tap says how to get them (lib/blobColors.js).
function BlobColors({ user, onPick }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState("");
  const current = blobColor(user?.avatar);
  const shown = BLOB_COLORS.find((c) => c.id === (info || current));
  const locked = shown && !canUseColor(user, shown);

  async function choose(c) {
    if (!canUseColor(user, c)) {
      setInfo((cur) => (cur === c.id ? null : c.id));
      return;
    }
    setInfo(null);
    if (c.id === current || busy) return;
    setBusy(c.id);
    try {
      await onPick(c.id);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="tv-blob-colors">
      <div className="tv-card-head">
        <h2 className="tv-card-title">Color de tu Blob</h2>
      </div>
      <div className="tv-blob-opts" role="radiogroup" aria-label="Color de tu Blob">
        {BLOB_COLORS.map((c) => {
          const ok = canUseColor(user, c);
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === current}
              aria-label={ok ? c.name : `${c.name} (bloqueado)`}
              className={`tv-blob-opt${c.id === current ? " is-on" : ""}${ok ? "" : " is-locked"}${info === c.id ? " is-asked" : ""}`}
              disabled={Boolean(busy)}
              onClick={() => choose(c)}
            >
              <Blob color={c.id} />
              {!ok && (
                <span className="tv-blob-lock" aria-hidden="true">
                  <Icon name="lock" size={12} strokeWidth={2.8} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {shown && (
        <p className={`tv-blob-note${locked ? " is-locked" : ""}`} aria-live="polite">
          <b>{shown.name}</b>
          {locked ? ` · ${HOW_TO_GET[shown.needs]}` : shown.id === current ? " · Es el que llevas" : ""}
        </p>
      )}
    </div>
  );
}

// What the profile says about the @username's changes.
function handleInfo(info) {
  let left;
  if (info.changesLeft > 0) left = `Te quedan ${info.changesLeft} ${info.changesLeft === 1 ? "cambio" : "cambios"} este mes.`;
  else {
    const when = new Date(info.nextChangeAt).toLocaleDateString("es", { day: "numeric", month: "long" });
    left = `Ya no te quedan cambios este mes. Podrás cambiarlo el ${when}.`;
  }
  // An assigned username (made from the name) says so; changing it counts like any change.
  return info.assigned ? `Te asignamos este usuario. ${left}` : left;
}

function ProfileScreen() {
  const { user: currentUser, updateUsername, changeHandle, updateAvatar, linkGoogle, connectSpotify, unlinkSpotify, linkingStatus, logout } =
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
  // The @username: changes are limited, so it is saved apart from the name for the games and shows how many are left.
  const [newHandle, setNewHandle] = useState("");
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

  // A colour is worn as soon as it's tapped (BlobColors).
  async function onPickColor(color) {
    setErr("");
    try {
      await updateAvatar(color);
    } catch (e) {
      setErr(e.message || "No se pudo cambiar el color");
    }
  }

  // One button saves whatever was edited: the name, the @username, or both.
  async function onSaveProfile(e) {
    e?.preventDefault();
    if (!canSave || saving) return;
    const withName = nameChanged;
    const withHandle = handleChanged;
    setSaving(true);
    setErr("");
    try {
      if (withName) {
        await updateUsername(newUserName.trim());
        setNewUserName("");
      }
      if (withHandle) {
        await changeHandle(newHandle);
        setNewHandle("");
      }
      setMsg(withName && withHandle ? "Perfil actualizado." : withName ? "Nombre actualizado." : "Nombre de usuario actualizado.");
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
  const canLinkGoogle = !isOtherUser && !isGuest && !hasGoogle;
  const nameChanged = Boolean(newUserName.trim()) && newUserName.trim() !== activeUser?.name;
  const handleCheck = useUsernameCheck(newHandle, activeUser?.username);
  const handleChanged = newHandle.length >= USERNAME_MIN && newHandle !== activeUser?.username && handleCheck.state !== "bad";
  const canSave = nameChanged || handleChanged;
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
    <div className="tv-page tv-page--wide">
      {searchParams.get("new") === "1" && (
        <Notice tone="brand" icon="star">¡Tu cuenta está lista! Puedes cambiar tu nombre cuando quieras.</Notice>
      )}
      {(googleNotice === "success" || googleNotice === "link_success") && (
        <Notice tone="ok" icon="check">Google conectado.</Notice>
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
        <span className="tv-profile-avatar">
          <Avatar className="tv-avatar--xl" avatar={activeUser?.avatar} />
        </span>
        <div className="tv-profile-who">
          <p className="tv-party-kicker">{isOtherUser ? "Perfil de jugador" : "Tu perfil"}</p>
          <h1 className="tv-page-title">{activeUser?.name || "Jugador"}</h1>
          {activeUser?.username && <p className="tv-handle tv-profile-handle">@{activeUser.username}</p>}
          {/* Only two tags: "Registrado" (any account) and "Owner". */}
          {(roleTag || !isGuest) && (
            <div className="tv-tags">
              {roleTag && (
                <span className={`tv-tag tv-tag--${activeUser.role}`}>
                  <Icon name={roleTag.icon} size={13} filled className={activeUser.role === "owner" ? "tv-tag-sparkle" : ""} />
                  {roleTag.label}
                </span>
              )}
              {!isGuest && (
                <span className="tv-tag tv-tag--ok">
                  <Icon name="verified" size={15} strokeWidth={2.4} className="tv-tag-verified" />
                  Registrado
                </span>
              )}
            </div>
          )}
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
            <div className="tv-stat-grid tv-stat-grid--two" aria-busy={statsLoading}>
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
          {!isOtherUser && <BlobColors user={currentUser} onPick={onPickColor} />}
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
                <span className="tv-label">Tu nombre</span>
                <input
                  className="tv-field tv-field--sm"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder={activeUser?.name || "Tu nuevo nombre"}
                  maxLength={24}
                  disabled={saving}
                />
              </label>
              {!isGuest && (
                <>
                  <UsernameField
                    value={newHandle}
                    onChange={setNewHandle}
                    check={handleCheck}
                    placeholder={activeUser?.username || "tu_usuario"}
                    disabled={saving}
                    note={activeUser?.usernameInfo ? handleInfo(activeUser.usernameInfo) : null}
                  />
                </>
              )}
            </form>

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
                  <span>Entra con un clic con tu cuenta de Google.</span>
                </div>
                <button type="button" className="tv-btn tv-btn--sm tv-btn--google" onClick={() => linkGoogle("/profile")}>
                  Vincular
                </button>
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
                  <span className="tv-email">{activeUser.email}</span>
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
