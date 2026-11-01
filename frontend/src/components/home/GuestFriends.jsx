import { Link } from "react-router-dom";

// What someone without an account sees wherever friends would be (Inicio's box, the sala's "Invitar amigos", the Amigos
// panel): the same line and the same two buttons everywhere.
export default function GuestFriends({ onNavigate }) {
  return (
    <>
      <p className="tv-stage-friends-empty">Con una cuenta puedes agregar amigos, ver quién está jugando e invitarlos a tu sala.</p>
      <div className="tv-stage-login">
        <Link to="/login?mode=login&returnTo=/" className="tv-btn tv-btn--neutral" onClick={onNavigate}>
          Iniciar sesión
        </Link>
        <Link to="/login?returnTo=/" className="tv-btn tv-btn--neutral" onClick={onNavigate}>
          Crear cuenta
        </Link>
      </div>
    </>
  );
}
