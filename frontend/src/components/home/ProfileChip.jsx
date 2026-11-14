import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import Avatar from "./Avatar.jsx";
import { useT } from "../../lib/i18n.js";

export default function ProfileChip({ user }) {
  const t = useT();
  if (!user) {
    return (
      <Link to="/login" className="tv-chip tv-chip--profile" aria-label={t("Entrar")}>
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="user" size={20} strokeWidth={2.6} />
        </span>
        <span className="tv-chip-name">{t("Entrar")}</span>
      </Link>
    );
  }

  return (
    <Link to="/profile" className="tv-chip tv-chip--profile" aria-label={t("Tu perfil: {name}", { name: user.name })}>
      <Avatar name={user.name} avatar={user.avatar} />
      <span className="tv-chip-name">{user.name}</span>
    </Link>
  );
}
