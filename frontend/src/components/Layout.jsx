import { useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { useTheme } from "../lib/theme.js";
import { YoavllyLogo } from "./YoavllySymbol.jsx";
import UserAvatar from "./UserAvatar.jsx";

export default function Layout({ children, mode }) {
  const { user, error } = useApp();
  const { theme, toggleTheme, canToggle } = useTheme();

  // A game mode swaps the site's main color (see :root[data-mode] in global.css).
  useEffect(() => {
    if (!mode) return;
    document.documentElement.setAttribute("data-mode", mode);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [mode]);

  return (
    <div className="shell">
      <header>
        <nav className="nav">
          <NavLink to="/" className="logo">
            <YoavllyLogo size={32} />
          </NavLink>

          <div className="nav-links">
            <NavLink to="/">Jugar</NavLink>

            {/* Theme Toggle Button (hidden while the app is dark-only) */}
            {canToggle && (
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              >
                {theme === "dark" ? "🌙" : "☀️"}
              </button>
            )}

            {user && !user.isGuest ? (
              <NavLink to="/profile" className="user-nav-chip">
                <UserAvatar
                  avatar={user.avatar}
                  name={user.name}
                  size={26}
                />
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                  {user.name}
                </span>
              </NavLink>
            ) : (
              <NavLink to="/login" className="btn ghost sm">
                Entrar
              </NavLink>
            )}
          </div>
        </nav>
      </header>

      {error ? (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--bad)", background: "var(--bad-subtle)" }}>
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <main>{children}</main>
    </div>
  );
}
