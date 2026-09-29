import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { YoavllyLogo } from "./YoavllySymbol.jsx";

export default function Layout({ children }) {
  const { user, error } = useApp();
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("yoavlly_theme") || localStorage.getItem("bysong_theme") || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("yoavlly_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <div className="shell">
      <header>
        <nav className="nav">
          <NavLink to="/" className="logo">
            <YoavllyLogo size={32} />
          </NavLink>

          <div className="nav-links">
            <NavLink to="/">Jugar</NavLink>

            {/* Theme Toggle Button */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>

            {user && !user.isGuest ? (
              <NavLink to="/profile" className="user-nav-chip">
                {user.avatar?.startsWith("http") ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="avatar"
                    style={{
                      background: user.avatar || "#7B73F6",
                      width: 26,
                      height: 26,
                      fontSize: 12,
                      border: "none",
                    }}
                  >
                    {(user.name || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}
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
