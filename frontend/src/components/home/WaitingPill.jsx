import { translate as tr } from "../../lib/i18n.js";

// Who a round still waits for, the same in every game. Only the match's bottom bar says it ("Falta Ana por responder"):
// no notice of its own comes up in the round's panel once this player answered, so nothing there moves.

/** "Ana", "Ana y Luis", "Ana, Luis y Eva". */
export function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return tr("{list} y {last}", { list: names.slice(0, -1).join(", "), last: names[names.length - 1] });
}

/**
 * The names of the players the round still waits for: connected, playing (not spectators, nor watching a tiebreak:
 * status "mirando"; in Campo de minas, not out; in Rey de la colina, not the king) and without an answer yet. This player is never in it.
 */
export function waitingNames(room, userId) {
  if (!room || room.phase !== "playing") return [];
  return room.players
    .filter((p) => p.id !== userId && p.id !== room.rey?.kingId && p.connected && !p.spectator && !p.idle && p.status !== "mirando" && !p.out && !p.answered)
    .map((p) => p.name);
}
