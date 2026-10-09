import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import Avatar from "./Avatar.jsx";

export default function ProfileChip({ user }) {
  if (!user) {
    return (
      <Link to="/login" className="tv-chip tv-chip--profile" aria-label="Entrar">
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="user" size={18} />
        </span>
        <span className="tv-chip-name">Entrar</span>
      </Link>
    );
  }

  return (
    <Link to="/profile" className="tv-chip tv-chip--profile" aria-label={`Tu perfil: ${user.name}`}>
      <Avatar name={user.name} avatar={user.avatar} />
      <span className="tv-chip-name">{user.name}</span>
    </Link>
  );
}
