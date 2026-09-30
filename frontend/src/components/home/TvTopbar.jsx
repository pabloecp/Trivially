import { Link } from "react-router-dom";
import { useTheme } from "../../lib/theme.js";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import ProfileChip from "./ProfileChip.jsx";

// Same top bar on every screen: Inicio on the left, profile and theme toggle on the right.
export default function TvTopbar() {
  const { user } = useApp();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="tv-topbar">
      <Link to="/" className="tv-chip tv-chip--home" aria-label="Volver al inicio">
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
  );
}
