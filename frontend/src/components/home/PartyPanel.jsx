import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../../modes/index.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import PlayerMenu from "./PlayerMenu.jsx";

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
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const copiedTimer = useRef(0);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  function leave() {
    leaveRoom();
    nav("/");
  }

  const isHost = room.hostId === user?.id;
  const alone = room.players.length === 1;
  const StartButton = findMode(room.game)?.Start;

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
        <button type="button" className="tv-leave-btn tv-leave-btn--icon" onClick={leave} aria-label="Salir de la sala" title="Salir de la sala">
          <Icon name="logout" size={18} strokeWidth={2.6} />
        </button>
        <div className="tv-party-codebox">
          <p className="tv-party-kicker">Código de sala</p>
          <p className="tv-party-code">{room.code}</p>
        </div>
        <button type="button" className="tv-btn tv-c-violet tv-invite-btn" onClick={copyInvite} aria-label="Invitar con enlace">
          <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.8} />
          <span className="tv-invite-label">{copied ? "¡Copiado!" : "Invitar"}</span>
        </button>
      </div>

      <ul className="tv-party-players" aria-label="Jugadores en la sala">
        {room.players.map((p, i) => {
          const isMe = p.id === user?.id;
          const isHostPlayer = p.id === room.hostId;
          return (
            <li
              key={p.id}
              className={`tv-player${isMe ? " is-me" : ""}${p.connected ? "" : " is-away"}${menuFor === p.id ? " is-open" : ""}`}
              style={{ "--i": i }}
            >
              <button
                type="button"
                className="tv-player-btn"
                aria-haspopup="menu"
                aria-expanded={menuFor === p.id}
                onClick={() => setMenuFor((cur) => (cur === p.id ? null : p.id))}
              >
                <span className="tv-player-avatar">
                  <Avatar name={p.name} avatar={p.avatar} />
                  {isHostPlayer && <Icon name="crown" size={18} strokeWidth={2} filled className="tv-player-crown" />}
                </span>
                <span className="tv-player-text">
                  <span className="tv-player-name">{p.name}</span>
                  <span className="tv-player-tag">
                    {playerTag(p, { isMe, isHost: isHostPlayer })}
                    {!isHostPlayer && p.canEditConfig && " · ajustes"}
                  </span>
                </span>
              </button>
              {menuFor === p.id && (
                <PlayerMenu
                  player={p}
                  isMe={isMe}
                  canManage={isHost && !isMe}
                  onClose={() => setMenuFor(null)}
                  onToast={onToast}
                />
              )}
            </li>
          );
        })}
      </ul>

      {StartButton && <StartButton room={room} onToast={onToast} />}

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

    </section>
  );
}
