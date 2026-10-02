import { Link } from "react-router-dom";

export function profilePath(id) {
  return `/profile/${encodeURIComponent(id)}`;
}

// A player's name that opens their profile (registered players only; guests have none). Opens in a new tab
// so nobody loses their seat in the room or game.
export default function PlayerName({ player, className = "", children }) {
  const label = children ?? player.name;
  if (!player?.id || player.isGuest) return <span className={className}>{label}</span>;
  return (
    <Link
      to={profilePath(player.id)}
      target="_blank"
      rel="noopener"
      className={`tv-player-link ${className}`.trim()}
      title={`Ver el perfil de ${player.name}`}
    >
      {label}
    </Link>
  );
}
