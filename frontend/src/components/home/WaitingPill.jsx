// "Esperando a Ana y Luis": who a round (or a turn of Campo de minas) still waits for, the same in every game. It
// shows once this player answered, picked or confirmed, until the round goes on.

/** "Ana", "Ana y Luis", "Ana, Luis y Eva". */
export function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * The names of the players the round still waits for: connected, playing (not spectators, nor watching a tiebreak:
 * status "mirando"; in Campo de minas, not out) and without an answer yet. This player is never in it.
 */
export function waitingNames(room, userId) {
  if (!room || room.phase !== "playing") return [];
  return room.players
    .filter((p) => p.id !== userId && p.connected && !p.spectator && p.status !== "mirando" && !p.out && !p.answered)
    .map((p) => p.name);
}

/**
 * The pill itself (with a pulsing dot). `names` can be given (Campo de minas works them out its own way); otherwise
 * they come from `room`. With nobody to wait for it shows `fallback`, if any. `inline` drops the pill's own box, for
 * a place that already has one (a button, a hint line).
 */
export default function WaitingPill({ room, userId, names = null, fallback = null, inline = false, className = "" }) {
  const list = names || waitingNames(room, userId);
  if (!list.length) return fallback;
  const text = (
    <>
      <span className="tv-pulse" aria-hidden="true" />
      <span className="tv-wait-text">
        Esperando a <strong>{joinNames(list)}</strong>
      </span>
    </>
  );
  if (inline) return text;
  return (
    <span className={`tv-wait-pill ${className}`} role="status">
      {text}
    </span>
  );
}
