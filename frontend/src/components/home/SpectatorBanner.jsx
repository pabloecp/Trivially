import Icon from "./Icon.jsx";

// Shown to someone who joined while a match was already running: they watch it, and play from the next one.
export default function SpectatorBanner() {
  return (
    <p className="tv-spectator" role="status">
      <Icon name="info" size={18} strokeWidth={2.6} />
      <span>
        <strong>Estás viendo la partida.</strong> Entrarás a la sala cuando termine.
      </span>
    </p>
  );
}
