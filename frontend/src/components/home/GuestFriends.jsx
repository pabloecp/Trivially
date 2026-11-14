import { Link } from "react-router-dom";
import { useT } from "../../lib/i18n.js";

// What someone without an account sees wherever friends would be (Inicio's box, the group's "Invitar amigos", the Amigos
// panel): the same line and the same two buttons everywhere.
export default function GuestFriends({ onNavigate }) {
  const t = useT();
  return (
    <>
      <p className="tv-stage-friends-empty">{t("Con una cuenta puedes agregar amigos, ver quién está jugando e invitarlos a tu grupo.")}</p>
      <div className="tv-stage-login">
        <Link to="/login?mode=login&returnTo=/" className="tv-btn tv-btn--neutral" onClick={onNavigate}>
          {t("Iniciar sesión")}
        </Link>
        <Link to="/login?returnTo=/" className="tv-btn tv-btn--neutral" onClick={onNavigate}>
          {t("Crear cuenta")}
        </Link>
      </div>
    </>
  );
}
