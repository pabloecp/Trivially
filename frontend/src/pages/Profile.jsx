import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { AVATAR_COLORS, useApp } from "../lib/store.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";

export default function Profile() {
  const {
    user: currentUser,
    saveProfile,
    registerAccount,
    loginAccount,
    updateUsername,
    loginWithGoogle,
    logout,
  } = useApp();
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();

  // If userId is present in URL and differs from currentUser.id, we view a public profile
  const isOtherUser = Boolean(userId && userId !== currentUser?.id);

  const [profileData, setProfileData] = useState(null);
  const [loadingUser, setLoadingUser] = useState(isOtherUser);
  const [stats, setStats] = useState(null);

  // Editing state for own profile
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState(AVATAR_COLORS[0]);

  // Direct username customization state
  const [newUserName, setNewUserName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Guest conversion / login state
  const [authMode, setAuthMode] = useState("register"); // "register" | "login"
  const [convertEmail, setConvertEmail] = useState("");
  const [convertPassword, setConvertPassword] = useState("");
  const [convertName, setConvertName] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Load user data
  useEffect(() => {
    if (isOtherUser) {
      setLoadingUser(true);
      api(`/api/users/${userId}`)
        .then((d) => {
          setProfileData(d.user);
          setStats(d.user?.stats || null);
          setLoadingUser(false);
        })
        .catch(() => {
          setErr("No se pudo cargar el perfil del jugador solicitado.");
          setLoadingUser(false);
        });
    } else if (currentUser?.id) {
      setProfileData(currentUser);
      setEditName(currentUser.name || "");
      setEditAvatar(currentUser.avatar || AVATAR_COLORS[0]);
      setConvertName(currentUser.name || "");
      api(`/api/users/${currentUser.id}`)
        .then((d) => {
          setStats(d.user?.stats || null);
          if (d.user) setProfileData(d.user);
        })
        .catch(() => {});
    }
  }, [userId, currentUser?.id, isOtherUser]);

  async function onSaveProfile(e) {
    e.preventDefault();
    if (!editName.trim()) return;
    try {
      await saveProfile(editName.trim(), editAvatar);
      setIsEditing(false);
      setMsg("Perfil actualizado correctamente.");
      setTimeout(() => setMsg(""), 3500);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onUpdateUsername(e) {
    if (e) e.preventDefault();
    const clean = newUserName.trim();
    if (!clean) return;
    setSavingName(true);
    setErr("");
    try {
      await updateUsername(clean);
      setMsg("Nombre de usuario actualizado exitosamente.");
      setNewUserName("");
      setSavingName(false);
      setTimeout(() => setMsg(""), 3500);
    } catch (e) {
      setErr(e.message);
      setSavingName(false);
    }
  }

  async function onRegisterAccount(e) {
    e.preventDefault();
    if (!convertPassword || convertPassword.length < 2) {
      setErr("La contraseña debe tener al menos 2 caracteres");
      return;
    }
    setAuthLoading(true);
    setErr("");
    try {
      await registerAccount({
        name: convertName.trim() || currentUser?.name,
        email: convertEmail.trim(),
        password: convertPassword,
      });
      setMsg("¡Cuenta creada con éxito! Tus estadísticas de invitado han sido vinculadas.");
      setAuthLoading(false);
      setTimeout(() => setMsg(""), 4500);
    } catch (e) {
      setErr(e.message);
      setAuthLoading(false);
    }
  }

  async function onLoginAccount(e) {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) return;
    setAuthLoading(true);
    setErr("");
    try {
      await loginAccount(loginIdentifier.trim(), loginPassword);
      setMsg("Sesión iniciada con éxito. Tus estadísticas han sido sincronizadas.");
      setAuthLoading(false);
      setTimeout(() => setMsg(""), 4500);
    } catch (e) {
      setErr(e.message);
      setAuthLoading(false);
    }
  }

  if (loadingUser) {
    return (
      <div className="card page-container" style={{ margin: "40px auto", textAlign: "center", padding: 48 }}>
        <YoavllySymbol size={44} />
        <p className="muted" style={{ marginTop: 16 }}>Cargando perfil del jugador...</p>
      </div>
    );
  }

  if (!isOtherUser && (!currentUser || currentUser.isGuest)) {
    return <Navigate to="/login" replace />;
  }

  const activeUser = isOtherUser ? profileData : currentUser;
  const isGuest = Boolean(activeUser?.isGuest);

  return (
    <div className="grid page-container" style={{ gap: 28 }}>
      {/* Header Bar */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="kicker">
            <YoavllySymbol size={16} /> {isOtherUser ? "Perfil Comunitario" : "Panel de Jugador"}
          </div>
          <h1 style={{ margin: "4px 0" }}>
            {isOtherUser ? `Perfil de ${activeUser?.name || "Jugador"}` : "Tu Cuenta YOAVLLY"}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {isOtherUser
              ? "Estadísticas de rendimiento, precisión y artistas destacados en YOAVLLY."
              : "Gestiona tu identidad, vincula tu cuenta permanente y revisa tu récord musical."}
          </p>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <Link to="/play" className="btn primary sm">
            + Jugar Partida
          </Link>
        </div>
      </div>

      {searchParams.get("new") === "1" && (
        <div className="card" style={{ padding: 18, borderColor: "var(--brand)", background: "var(--brand-subtle)" }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 28 }}>🎉</span>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: "0 0 2px", fontSize: 16, color: "var(--brand)" }}>
                ¡Bienvenido a YOAVLLY! Tu cuenta ha sido creada exitosamente
              </h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Aquí puedes personalizar tu nombre de usuario libremente tantas veces como quieras.
              </p>
            </div>
          </div>
        </div>
      )}

      {searchParams.get("google") === "success" && (
        <div className="card" style={{ padding: 14, borderColor: "var(--ok)", background: "var(--ok-subtle)" }}>
          <p className="ok" style={{ margin: 0, fontWeight: 700 }}>Conexión con Google completada exitosamente.</p>
        </div>
      )}

      {msg && (
        <div className="card" style={{ padding: 14, borderColor: "var(--ok)", background: "var(--ok-subtle)" }}>
          <p className="ok" style={{ margin: 0, fontWeight: 700 }}>{msg}</p>
        </div>
      )}

      {err && (
        <div className="card" style={{ padding: 14, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
          <p className="error" style={{ margin: 0, fontWeight: 700 }}>{err}</p>
        </div>
      )}

      {/* Main 2-Column Dashboard Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        {/* Left Column: Identity, Guest Link */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
          {/* Identity Card */}
          <div
            className="card"
            style={{
              padding: 32,
              borderRadius: 20,
              boxShadow: "var(--shadow-lg)",
              height: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 22,
            }}
          >
            <div className="row" style={{ gap: 16, alignItems: "center" }}>
              {activeUser?.avatar?.startsWith("http") ? (
                <img
                  src={activeUser.avatar}
                  alt={activeUser.name}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    objectFit: "cover",
                    boxShadow: "0 6px 16px rgba(0, 0, 0, 0.25)",
                    border: "2px solid #FFFFFF",
                  }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="avatar"
                  style={{
                    background: activeUser?.avatar || "var(--brand)",
                    width: 72,
                    height: 72,
                    fontSize: 30,
                    boxShadow: "0 6px 16px rgba(123, 115, 246, 0.25)",
                  }}
                >
                  {(activeUser?.name || "U").slice(0, 1).toUpperCase()}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <h2 style={{ margin: 0, fontSize: 24, wordBreak: "break-word" }}>
                    {activeUser?.name || "Jugador"}
                  </h2>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {isGuest ? (
                    <span className="chip" style={{ fontSize: 11, background: "var(--brand-subtle)", color: "var(--brand)" }}>
                      Modo Invitado
                    </span>
                  ) : (
                    <span className="chip ok" style={{ fontSize: 11 }}>
                      Cuenta Registrada
                    </span>
                  )}
                  {activeUser?.googleId && (
                    <span className="chip" style={{ fontSize: 11, background: "#FFFFFF", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                      </svg>
                      Google
                    </span>
                  )}
                  {activeUser?.email && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {activeUser.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Name Changer */}
            {!isOtherUser && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 800, display: "block", marginBottom: 8, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                  Cambiar Nombre de Usuario
                </label>
                <form onSubmit={onUpdateUsername} className="row" style={{ gap: 8 }}>
                  <input
                    className="field"
                    style={{ flex: 1, height: 44, fontSize: 14 }}
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder={activeUser?.name || "Escribe tu nuevo nombre..."}
                    maxLength={24}
                  />
                  <button className="btn primary" type="submit" disabled={savingName || !newUserName.trim()} style={{ height: 44, padding: "0 22px", fontWeight: 800 }}>
                    {savingName ? "..." : "Guardar"}
                  </button>
                </form>
              </div>
            )}

            {!isOtherUser && (
              <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: "auto" }}>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? "Cancelar" : "🎨 Cambiar avatar"}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    logout();
                    nav("/login");
                  }}
                  style={{ color: "var(--bad)" }}
                >
                  Cerrar sesión
                </button>
              </div>
            )}

            {/* Editing Avatar Form */}
            {isEditing && !isOtherUser && (
              <form onSubmit={onSaveProfile} className="grid" style={{ gap: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>
                    Color de avatar
                  </label>
                  <div className="row" style={{ gap: 8 }}>
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditAvatar(c)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: c,
                          border: editAvatar === c ? "3px solid #FFFFFF" : "1px solid var(--border)",
                          boxShadow: editAvatar === c ? "0 0 0 2px var(--brand)" : "none",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button className="btn primary sm" type="submit">
                  Guardar Avatar
                </button>
              </form>
            )}
          </div>


          {/* Guest Conversion Card (Create account or Login directly without logout!) */}
          {!isOtherUser && isGuest && (
            <div className="card grid" style={{ gap: 16, padding: 22, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div>
                <span className="chip" style={{ fontSize: 11, background: "var(--brand-subtle)", color: "var(--brand)", fontWeight: 700, marginBottom: 8 }}>
                  💡 Conserva tus estadísticas
                </span>
                <h3 style={{ margin: "6px 0 6px", fontSize: 17, color: "var(--text)" }}>
                  ¿Quieres guardar tu progreso permanentemente?
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                  No necesitas cerrar sesión. Puedes crear una cuenta o iniciar sesión para vincular todas tus victorias y puntos actuales.
                </p>
              </div>

              {/* Continue with Google button */}
              <button
                type="button"
                onClick={() => loginWithGoogle("/profile")}
                className="btn"
                style={{
                  background: "#FFFFFF",
                  color: "#1F2937",
                  border: "1.5px solid #E5E7EB",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                Vincular con Google
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ padding: "0 8px" }}>o con correo</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>

              {/* Subtabs */}
              <div className="tab-group" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={`tab-btn ${authMode === "register" ? "active" : ""}`}
                  onClick={() => setAuthMode("register")}
                >
                  Crear cuenta
                </button>
                <button
                  type="button"
                  className={`tab-btn ${authMode === "login" ? "active" : ""}`}
                  onClick={() => setAuthMode("login")}
                >
                  Ya tengo cuenta
                </button>
              </div>

              {authMode === "register" ? (
                <form onSubmit={onRegisterAccount} className="grid" style={{ gap: 10 }}>
                  <input
                    className="field"
                    type="text"
                    placeholder="Nombre de usuario"
                    value={convertName}
                    onChange={(e) => setConvertName(e.target.value)}
                    required
                  />
                  <input
                    className="field"
                    type="email"
                    placeholder="tu@email.com"
                    value={convertEmail}
                    onChange={(e) => setConvertEmail(e.target.value)}
                    required
                  />
                  <input
                    className="field"
                    type="password"
                    placeholder="Contraseña (mínimo 2 caracteres)"
                    value={convertPassword}
                    onChange={(e) => setConvertPassword(e.target.value)}
                    required
                  />
                  <button className="btn primary sm" type="submit" disabled={authLoading || !convertEmail.trim() || !convertPassword}>
                    {authLoading ? "Guardando..." : "Crear cuenta y vincular puntos"}
                  </button>
                </form>
              ) : (
                <form onSubmit={onLoginAccount} className="grid" style={{ gap: 10 }}>
                  <input
                    className="field"
                    type="text"
                    placeholder="tu@email.com o Nombre de usuario"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                  <input
                    className="field"
                    type="password"
                    placeholder="Tu contraseña"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <button className="btn primary sm" type="submit" disabled={authLoading || !loginIdentifier.trim() || !loginPassword}>
                    {authLoading ? "Iniciando..." : "Iniciar sesión y sincronizar"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Stats Card */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {isGuest ? (
            <div
              className="card grid"
              style={{
                gap: 16,
                padding: 36,
                textAlign: "center",
                alignItems: "center",
                borderRadius: 20,
                boxShadow: "var(--shadow-lg)",
                height: "100%",
                boxSizing: "border-box",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--brand-subtle)",
                  color: "var(--brand)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  margin: "0 auto",
                }}
              >
                📊
              </div>
              <div>
                <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>Estadísticas solo para usuarios registrados</h3>
                <p className="muted" style={{ margin: "0 auto", maxWidth: 440, fontSize: 14, lineHeight: 1.6 }}>
                  Las estadísticas, puntos, rachas y récords solo se acumulan para usuarios con sesión iniciada. Al jugar en modo invitado las estadísticas no se guardan.
                </p>
              </div>
              <Link to="/login?returnTo=/profile" className="btn primary" style={{ fontWeight: 800 }}>
                Iniciar Sesión o Crear Cuenta
              </Link>
            </div>
          ) : (
            <div
              className="card"
              style={{
                padding: 32,
                borderRadius: 20,
                boxShadow: "var(--shadow-lg)",
                height: "100%",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 20,
              }}
            >
              {/* Header */}
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>
                  Rendimiento y Puntos
                </h3>
                <span
                  className="chip"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: "var(--brand-subtle)",
                    color: "var(--brand)",
                    border: "1px solid rgba(29, 185, 84, 0.25)",
                  }}
                >
                  En Vivo
                </span>
              </div>

              {/* 6 Stats Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 14,
                  flex: 1,
                  alignContent: "center",
                }}
              >
                <Stat label="PUNTUACIÓN TOTAL" value={stats?.totalScore || 0} isBrand />
                <Stat label="MEJOR PARTIDA" value={stats?.bestScore || 0} />
                <Stat label="VICTORIAS" value={stats?.wins || 0} />
                <Stat label="PARTIDAS JUGADAS" value={stats?.gamesPlayed || 0} />
                <Stat label="ACIERTOS" value={stats?.correctAnswers || 0} />
                <Stat label="MEJOR RACHA" value={`🔥 ${stats?.bestStreak || 0}`} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, isBrand = false }) {
  return (
    <div
      style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 26,
          fontWeight: 900,
          color: isBrand ? "var(--brand)" : "var(--text)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
