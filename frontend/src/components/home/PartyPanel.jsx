import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import { ReactionBubble } from "./RoomExtras.jsx";
import Icon from "./Icon.jsx";
import PlayerName from "./PlayerName.jsx";

function playerTag(player, { isMe, isHost }) {
  if (!player.connected) return "Reconectando…";
  if (isHost && isMe) return "Anfitrión · tú";
  if (isHost) return "Anfitrión";
  if (isMe) return "Tú";
  return "En la sala";
}

// The room card on Home: invite code and who's in.
export default function PartyPanel({ room, onToast }) {
  const { user, leaveRoom } = useApp();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(0);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const isHost = room.hostId === user?.id;
  const alone = room.players.length === 1;

  async function copyInvite() {
    const url = `${window.location.origin}/sala/${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast(`Comparte este enlace: ${url}`, "link");
    }
  }

  return (
    <section className="tv-party" aria-label="Tu sala">
      <div className="tv-party-head">
        <div>
          <p className="tv-party-kicker">Código de sala</p>
          <p className="tv-party-code">{room.code}</p>
        </div>
        <button type="button" className="tv-btn tv-c-violet" onClick={copyInvite}>
          <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.8} />
          {copied ? "¡Copiado!" : "Invitar"}
        </button>
      </div>

      <ul className="tv-party-players" aria-label="Jugadores en la sala">
        {room.players.map((p, i) => {
          const isMe = p.id === user?.id;
          const isHostPlayer = p.id === room.hostId;
          return (
            <li
              key={p.id}
              className={`tv-player${isMe ? " is-me" : ""}${p.connected ? "" : " is-away"}`}
              style={{ "--i": i }}
            >
              <span className="tv-player-avatar">
                <Avatar name={p.name} avatar={p.avatar} />
                {isHostPlayer && <Icon name="crown" size={18} strokeWidth={2} filled className="tv-player-crown" />}
                <ReactionBubble playerId={p.id} />
              </span>
              <span className="tv-player-text">
                <PlayerName player={p} className="tv-player-name" />
                <span className="tv-player-tag">
                  {playerTag(p, { isMe, isHost: isHostPlayer })}
                  {!isHostPlayer && p.canEditConfig && " · ajustes"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {!room.game && (
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          {isHost
            ? alone
              ? "Invita a tus amigos o elige un juego para jugar solo."
              : "Elige un juego y todos lo verán al instante."
            : `Esperando a que ${room.hostName} elija el juego…`}
        </p>
      )}

      <button type="button" className="tv-link-btn tv-party-leave" onClick={leaveRoom}>
        <Icon name="logout" size={18} />
        Salir de la sala
      </button>
    </section>
  );
}
