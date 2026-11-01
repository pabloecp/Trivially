import { Link } from "react-router-dom";

// A profile's address: "/profile/pabloecp" when the player's username is known; by id otherwise (the profile then moves to it).
export function profilePath(idOrPlayer) {
  const username = idOrPlayer?.username;
  return username ? `/profile/${username}` : `/profile/${encodeURIComponent(idOrPlayer?.id ?? idOrPlayer)}`;
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
    >
      {label}
    </Link>
  );
}
