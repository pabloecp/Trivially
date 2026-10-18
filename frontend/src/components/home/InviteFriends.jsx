import { useEffect, useState } from "react";
import { useFriends } from "../../lib/friends.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

// How many friends show at once (the friends sheet has them all).
const SHOWN = 4;

/**
 * In the room's column while the room waits, under the players (accounts only): "Invitar amigos", your friends who are
 * online and not in this room, each with "Invitar" (they get a card with the room's code, friend:invite), which turns
 * into "Invitado" for a while. With nobody online it says so; with no friends yet, a button opens the friends sheet.
 */
export default function InviteFriends({ room, onToast }) {
  const friends = useFriends();
  const [sent, setSent] = useState({});

  // "Invitado" goes back to "Invitar" after a while (the server lets you invite the same friend again then).
  useEffect(() => {
    const ids = Object.keys(sent);
    if (!ids.length) return undefined;
    const t = setTimeout(() => setSent({}), 15000);
    return () => clearTimeout(t);
  }, [sent]);

  if (!friends.isAccount || !friends.view) return null;
  const all = friends.view.friends || [];
  const inRoom = new Set(room.players.map((p) => p.id));
  const online = all.filter((f) => f.online && !inRoom.has(f.id));

  async function invite(friend) {
    try {
      await friends.inviteFriend(friend.id);
      setSent((s) => ({ ...s, [friend.id]: true }));
      onToast?.(`Invitaste a ${friend.name}`, "check");
    } catch (err) {
      onToast?.(err.message || "No se pudo invitar");
    }
  }

  return (
    <div className="tv-invite-friends">
      {/* Titled like "En la sala": the name, and on the right how many of your friends are online to invite. */}
      <div className="tv-party-title">
        <h2>Invitar amigos</h2>
        {online.length > 0 && <span>{online.length === 1 ? "1 conectado" : `${online.length} conectados`}</span>}
      </div>
      {!all.length ? (
        <button type="button" className="tv-invite-friends-empty" onClick={() => friends.setOpen(true)}>
          <Icon name="users" size={16} strokeWidth={2.4} />
          Añade amigos para invitarlos
        </button>
      ) : !online.length ? (
        <p className="tv-invite-friends-none">Ninguno de tus amigos está conectado ahora</p>
      ) : (
        <ul className="tv-invite-friends-list">
          {online.slice(0, SHOWN).map((f) => (
            <li key={f.id} className="tv-invite-friend">
              <Avatar name={f.name} avatar={f.avatar} />
              <span className="tv-invite-friend-text">
                <strong>{f.name}</strong>
                <small>{f.room ? "En otra sala" : "En línea"}</small>
              </span>
              <button
                type="button"
                className={`tv-btn tv-btn--sm ${sent[f.id] ? "tv-c-neutral" : "tv-c-violet"} tv-invite-friend-btn`}
                onClick={() => invite(f)}
                disabled={Boolean(sent[f.id])}
              >
                {sent[f.id] ? <Icon name="check" size={14} strokeWidth={3} /> : null}
                {sent[f.id] ? "Invitado" : "Invitar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
