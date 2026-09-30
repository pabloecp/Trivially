import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../../lib/theme.js";
import Icon from "./Icon.jsx";
import ProfileChip from "./ProfileChip.jsx";
import { useApp } from "../../lib/store.jsx";
import "../../styles/home.css";

// The Home look (backdrop, top bar, chunky cards) for screens that live inside a game mode.
// `mode` swaps the site's main color for that mode (see :root[data-mode] in global.css).
export default function TvShell({ mode, children }) {
  const { user } = useApp();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (!mode) return;
    document.documentElement.setAttribute("data-mode", mode);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [mode]);

  return (
    <div className="tv-app">
      <div className="tv-backdrop" aria-hidden="true">
        <span className="tv-blob tv-blob--1" />
        <span className="tv-blob tv-blob--2" />
        <span className="tv-blob tv-blob--3" />
      </div>

      <header className="tv-topbar">
        <Link to="/" className="tv-chip" aria-label="Volver al inicio">
          <span className="tv-avatar tv-avatar--empty">
            <Icon name="home" size={18} />
          </span>
          <span className="tv-chip-name">Inicio</span>
        </Link>
        <div className="tv-topbar-end">
          <ProfileChip user={user} />
          <button
            type="button"
            className="tv-icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={22} />
          </button>
        </div>
      </header>

      <main className="tv-main tv-main--page">{children}</main>
    </div>
  );
}
