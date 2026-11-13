import { useEffect, useRef, useState } from "react";
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
import Modal from "../components/home/Modal.jsx";
import { BLOB_COLORS, HOW_TO_GET, blobColor, canUseColor } from "../lib/blobColors.js";
import { BLOB_SKINS, isBlobSkin } from "../lib/blobSkins.js";
import Segmented from "../components/home/Segmented.jsx";

// Only what matters: how many matches you won, how many questions you got right and how many daily challenges you completed.
const STATS = [
  { key: "wins", label: "Victorias", color: "amber" },
  { key: "correctAnswers", label: "Aciertos", color: "green" },
  { key: "dailyDone", label: "Retos", color: "pink" },
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

// "Borrar cuenta": a panel that says what is lost and asks for the account's name and, when it has one, its password
// (an account that only enters with Google has none). The red button stays off until both are written.
function DeleteAccount({ open, name, needsPassword, onClose, onDelete }) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Opened again, it starts empty.
  useEffect(() => {
    if (!open) return;
    setTyped("");
    setPassword("");
    setError("");
    setBusy(false);
  }, [open]);
  const ready = typed.trim() === name && (!needsPassword || password.length > 0);

  async function submit(e) {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(typed.trim(), needsPassword ? password : undefined);
    } catch (err) {
      setError(err.message || "No se pudo borrar tu cuenta. Inténtalo otra vez.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Borrar tu cuenta"
      size="sm"
      className="tv-delete-modal"
      foot={
        <>
          <button type="button" className="tv-btn tv-btn--neutral" data-sound="back" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="tv-btn tv-btn--bad" data-sound="back" onClick={submit} disabled={!ready || busy} aria-busy={busy}>
            {busy ? "Borrando…" : "Borrar cuenta"}
          </button>
        </>
      }
    >
      <p className="tv-delete-text">
        Se borra para siempre: tu @usuario, tus estadísticas, tu elo y tu rango, tus últimas partidas y tus amigos. No se puede deshacer.
      </p>
      <form onSubmit={submit} className="tv-delete-form">
        <label className="tv-form-row">
          <span className="tv-label">Escribe tu nombre para confirmar</span>
          <input
            className="tv-field tv-field--sm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={name}
            maxLength={24}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        {needsPassword && (
          <label className="tv-form-row">
            <span className="tv-label">Tu contraseña</span>
            <input
              className="tv-field tv-field--sm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="La de tu cuenta"
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
        )}
        {/* Enter in a box sends it too. */}
        <button type="submit" hidden />
        {error && <p className="tv-lobby-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

// "Tu Blob": every colour and every skin, like an inventory, in two tabs ("Colores", "Skins"; it opens on the one you
// wear). The ones you can use are tapped to wear them (the one you wear in the site's blue); the others are dimmed with
// a lock, and a tap says how to get them (lib/blobColors.js, lib/blobSkins.js). The skins come SKIN_PAGE at a time, in
// the colours' box, with which ones show and the arrows to move through them at the foot (like a match's history,
// MatchSummarySheet); it opens on the page of the one you wear.
const BLOB_TABS = [
  { value: "colores", label: "Colores" },
  { value: "skins", label: "Skins" },
];
const ALL_LOOKS = [...BLOB_COLORS, ...BLOB_SKINS];
const SKIN_PAGE = 8;
const SKIN_PAGES = Math.ceil(BLOB_SKINS.length / SKIN_PAGE);

function BlobColors({ user, onPick }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState("");
  const current = blobColor(user?.avatar);
  const [tab, setTab] = useState(() => (isBlobSkin(current) ? "skins" : "colores"));
  const [page, setPage] = useState(() => Math.max(0, Math.floor(BLOB_SKINS.findIndex((s) => s.id === current) / SKIN_PAGE)));
  const skins = tab === "skins";
  const from = page * SKIN_PAGE;
  const list = skins ? BLOB_SKINS.slice(from, from + SKIN_PAGE) : BLOB_COLORS;
  const shown = ALL_LOOKS.find((c) => c.id === (info || current));
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
    <div className={`tv-blob-colors${skins ? " has-pages" : ""}`}>
      <div className="tv-card-head">
        <h2 className="tv-card-title">Tu Blob</h2>
        <Segmented options={BLOB_TABS} value={tab} onChange={(v) => { setTab(v); setInfo(null); }} label="Colores o skins" />
      </div>
      <div className="tv-blob-opts" role="radiogroup" aria-label={skins ? "Skin de tu Blob" : "Color de tu Blob"}>
        {list.map((c) => {
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
      {skins && (
        <div className="tv-blob-pager">
          <span className="tv-summary-where">
            Skins{" "}
            <b>
              {from + 1}–{from + list.length}
            </b>{" "}
            de {BLOB_SKINS.length}
          </span>
          <span className="tv-summary-nav">
            <button type="button" className="tv-iconbtn tv-summary-prev" aria-label="Skins anteriores" disabled={page <= 0} onClick={() => { setPage(page - 1); setInfo(null); }}>
              <Icon name="chevron" size={20} strokeWidth={3} />
            </button>
            <button type="button" className="tv-iconbtn" aria-label="Skins siguientes" disabled={page >= SKIN_PAGES - 1} onClick={() => { setPage(page + 1); setInfo(null); }}>
              <Icon name="chevron" size={20} strokeWidth={3} />
            </button>
          </span>
        </div>
      )}
      {/* Over the colours, so saying it moves nothing. */}
      {locked && (
        <p className="tv-pf-blobnote" aria-live="polite">
          <b>{shown.name}</b> · {HOW_TO_GET[shown.how || shown.needs]}
        </p>
      )}
    </div>
  );
}

// The username's label, with how many changes are left this month.
function handleLabel(info) {
  return info ? `Usuario · ${info.changesLeft} ${info.changesLeft === 1 ? "cambio" : "cambios"}` : "Usuario";
}

function ProfileScreen() {
  const { user: currentUser, updateUsername, changeHandle, updateAvatar, linkGoogle, connectSpotify, unlinkSpotify, linkingStatus, logout, deleteAccount } =
    useApp();
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The account was just deleted: this page goes to Inicio, not to the login it sends a signed-out visitor to.
  const deleted = useRef(false);
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
  const isOtherUser = Boolean(userId && userId !== currentUser?.id && userId !== currentUser?.username);

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
          setStats(d.user?.stats ? { ...d.user.stats, dailyDone: d.user.dailyDone || 0 } : null);
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
          setStats(d.user?.stats ? { ...d.user.stats, dailyDone: d.user.dailyDone || 0 } : null);
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
      setErr(e.message || "No se pudo cambiar tu Blob");
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

  // The profile's address is its username, whatever link opened it (the id never shows).
  const shownUser = isOtherUser ? profileData : currentUser;
  const shownHandle = shownUser?.username;
  useEffect(() => {
    if (!userId || loadingUser || !shownHandle || userId === shownHandle) return;
    nav(`/profile/${shownHandle}`, { replace: true });
  }, [userId, loadingUser, shownHandle]);

  // Before any of the returns below: a screen must call the same hooks every time.
  const handleCheck = useUsernameCheck(newHandle, shownUser?.username);

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
    return <Navigate to={deleted.current ? "/" : "/login?returnTo=/profile"} replace />;
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

      {/* Three columns of the same width and height: who it is, the Blob's colour and the account. The same places with or
          without an account, whatever the name's length (it's cut with "…"). Someone else's profile is only the first. */}
      <div className={`tv-pf${isOtherUser ? " is-other" : ""}`}>
        <section className="tv-card tv-pf-card" aria-label="Perfil">
          <div className="tv-pf-who">
            <span className="tv-profile-avatar">
              <Avatar className="tv-avatar--xl" avatar={activeUser?.avatar} />
            </span>
            <div className="tv-pf-names">
              <h1 className="tv-pf-name" title={activeUser?.name || "Jugador"}>{activeUser?.name || "Jugador"}</h1>
              <p className="tv-pf-handle">{isGuest ? "Juega como invitado" : activeUser?.username ? `@${activeUser.username}` : ""}</p>
            </div>
          </div>
          <div className="tv-pf-tags">
            {roleTag && (
              <span className={`tv-tag tv-tag--${activeUser.role}`}>
                <Icon name={roleTag.icon} size={13} filled className={activeUser.role === "owner" ? "tv-tag-sparkle" : ""} />
                {roleTag.label}
              </span>
            )}
          </div>
          <div className="tv-pf-stats" aria-busy={statsLoading} aria-label="Estadísticas">
            {STATS.map((s) => (
              <div key={s.key} className="tv-pf-stat">
                <span className="tv-pf-label">{s.label}</span>
                <span className="tv-pf-num">
                  {statsLoading ? <span className="tv-skeleton" aria-hidden="true" /> : stats ? <CountUp value={stats[s.key] || 0} /> : 0}
                </span>
              </div>
            ))}
          </div>
        </section>

        {!isOtherUser && (
          <section className="tv-card tv-pf-card tv-pf-blob" aria-label="Tu Blob">
            <BlobColors user={currentUser} onPick={onPickColor} />
          </section>
        )}

        {!isOtherUser && (
          <section className="tv-card tv-pf-card" aria-labelledby="tv-account-title">
            <div className="tv-pf-head">
              <h2 id="tv-account-title" className="tv-pf-title">Tu cuenta</h2>
              <button type="button" className="tv-btn tv-btn--primary" onClick={onSaveProfile} disabled={!canSave || saving} aria-busy={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
            <form onSubmit={onSaveProfile} className="tv-pf-form">
              <label className="tv-form-row">
                <span className="tv-label">Nombre</span>
                <input
                  className="tv-field tv-field--sm"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder={activeUser?.name || "Tu nuevo nombre"}
                  maxLength={24}
                  disabled={saving}
                />
              </label>
              {isGuest ? (
                <label className="tv-form-row">
                  <span className="tv-label">Usuario</span>
                  <input className="tv-field tv-field--sm" placeholder="Crea una cuenta para tener uno" disabled />
                </label>
              ) : (
                <UsernameField
                  label={handleLabel(activeUser?.usernameInfo)}
                  value={newHandle}
                  onChange={setNewHandle}
                  check={handleCheck}
                  placeholder={activeUser?.username || "tu_usuario"}
                  disabled={saving}
                />
              )}
            </form>
            <div className="tv-pf-foot">
              <p className="tv-pf-mail" title={isGuest ? undefined : activeUser?.email}>{isGuest ? "Sin cuenta" : activeUser?.email || ""}</p>
              {isGuest ? (
                <div className="tv-pf-actions">
                  <Link to="/login?mode=login&returnTo=/profile" className="tv-btn tv-btn--neutral">Iniciar sesión</Link>
                  <Link to="/login?returnTo=/profile" className="tv-btn tv-btn--neutral">Crear cuenta</Link>
                </div>
              ) : (
                <div className="tv-pf-actions">
                  {canLinkGoogle && (
                    <button type="button" className="tv-iconbtn tv-pf-icon" aria-label="Vincular Google" title="Vincular Google" onClick={() => linkGoogle("/profile")}>
                      <GoogleIcon size={22} />
                    </button>
                  )}
                  {canSpotify && (
                    <button
                      type="button"
                      className={`tv-iconbtn tv-pf-icon${hasSpotify ? "" : " is-faint"}${confirmUnlink ? " is-danger" : ""}`}
                      aria-label={confirmUnlink ? "Toca otra vez para desconectar Spotify" : hasSpotify ? "Spotify conectado. Toca para desconectarlo" : "Conectar Spotify"}
                      title={confirmUnlink ? "Toca otra vez para desconectar" : hasSpotify ? activeUser.spotify?.displayName || "Spotify conectado" : "Conectar Spotify"}
                      onClick={hasSpotify ? onSpotifyActive : onConnectSpotify}
                      disabled={spotifyBusy}
                    >
                      <SpotifyIcon size={22} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="tv-btn tv-btn--bad"
                    onClick={() => {
                      logout();
                      nav("/login");
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
        {!isOtherUser && (
          <nav className="tv-legal-links" aria-label="Información legal">
            <Link to="/terminos">Términos de uso</Link>
            <Link to="/privacidad">Aviso de privacidad</Link>
            {!isGuest && (
              <button type="button" onClick={() => setDeleteOpen(true)}>
                Borrar cuenta
              </button>
            )}
          </nav>
        )}
        {!isOtherUser && !isGuest && (
          <DeleteAccount
            open={deleteOpen}
            name={activeUser?.name || ""}
            needsPassword={Boolean(linkingStatus?.hasPassword)}
            onClose={() => setDeleteOpen(false)}
            onDelete={async (typedName, password) => {
              deleted.current = true;
              try {
                await deleteAccount(typedName, password);
              } catch (err) {
                deleted.current = false;
                throw err;
              }
            }}
          />
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
