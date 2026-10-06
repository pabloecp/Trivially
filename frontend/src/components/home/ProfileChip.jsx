import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import Avatar from "./Avatar.jsx";

// `compact`: only the avatar, without the name (on your own profile, which already shows it).
export default function ProfileChip({ user, compact = false }) {
  if (!user) {
    return (
      <Link to="/login" className="tv-chip">
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="user" size={18} />
        </span>
        <span className="tv-chip-name">Entrar</span>
      </Link>
    );
  }

  return (
    <Link to="/profile" className={`tv-chip${compact ? " tv-chip--compact" : ""}`} aria-label={`Tu perfil: ${user.name}`}>
      <Avatar name={user.name} avatar={user.avatar} />
      {!compact && <span className="tv-chip-name">{user.name}</span>}
    </Link>
  );
}
