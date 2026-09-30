import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import { findMode, roomPath } from "../../modes/index.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

function playerTag(player, { isMe, isHost }) {
  if (!player.connected) return "Reconectando…";
  if (isHost && isMe) return "Anfitrión · tú";
  if (isHost) return "Anfitrión";
  if (isMe) return "Tú";
  return "En la sala";
}

// The room card on Home: invite code, who's in, and which game the room is in.
export default function PartyPanel({ room, onToast }) {
  const { user, setGame, leaveRoom } = useApp();
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(0);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const isHost = room.hostId === user?.id;
  const activeMode = findMode(room.game);
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

  function bringEveryoneHome() {
    setGame(null).catch((err) => onToast(err.message));
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
              </span>
              <span className="tv-player-text">
                <span className="tv-player-name">{p.name}</span>
                <span className="tv-player-tag">{playerTag(p, { isMe, isHost: isHostPlayer })}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {activeMode ? (
        <div className="tv-party-active">
          <span className={`tv-badge tv-c-${activeMode.color}`}>
            <Icon name={activeMode.icon} size={24} />
          </span>
          <p className="tv-party-active-text">
            La sala está en <strong>{activeMode.name}</strong>
          </p>
          <div className="tv-party-actions">
            <button type="button" className="tv-btn tv-c-yellow" onClick={() => nav(roomPath(room))}>
              <Icon name="play" size={16} filled strokeWidth={1.5} />
              Ir al juego
            </button>
            {isHost && (
              <button type="button" className="tv-btn tv-c-neutral" onClick={bringEveryoneHome}>
                <Icon name="home" size={18} />
                Traer a todos aquí
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          {isHost
            ? alone
              ? "Invita a tus amigos o elige un juego para jugar solo."
              : "Elige un juego y todos entrarán contigo."
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
