import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import PlayerMenu from "./PlayerMenu.jsx";
import { ChatForm, ChatMessages, ChatSheet, useChatUnread, usePhone, useRoomChat } from "./RoomChat.jsx";
import { useInvite } from "./useInvite.js";

function playerTag(player, { isHost }) {
  if (!player.connected) return "Reconectando…";
  if (isHost) return "Anfitrión";
  if (player.canEditConfig) return "Puede editar ajustes";
  return "Conectado";
}

// During a match the line under each name says how their round is going. The server sends everyone's answer only
// once the round is over (reveal), and at the end each player's totals (results).
function MatchTag({ player, room }) {
  if (player.spectator) return <span className="tv-player-tag">Espectador</span>;
  if (!player.connected) return <span className="tv-player-tag">Reconectando…</span>;
  if (room.phase === "finished") {
    const r = room.results?.find((x) => x.id === player.id);
    if (!r) return <span className="tv-player-tag">Sin resultados</span>;
    return (
      <span className="tv-player-tag">
        {r.correct} aciertos · racha {r.bestStreak}
        {r.avgMs ? ` · ${(r.avgMs / 1000).toFixed(1)} s` : ""}
        {r.tiebreakWinner ? " · ganó el desempate" : ""}
      </span>
    );
  }
  if (room.phase === "reveal") {
    const a = player.lastAnswer;
    if (!a || a.skipped || !a.text) return <span className="tv-player-tag">{a?.skipped ? "Se la saltó" : "Sin respuesta"}</span>;
    return (
      <span className={`tv-player-tag tv-player-answer ${a.correct ? "is-right" : "is-wrong"}`} title={a.text}>
        <Icon name={a.correct ? "check" : "close"} size={12} strokeWidth={3.2} />
        <span>{a.text}</span>
      </span>
    );
  }
  // Campo de minas: out of the round (stepped on a mine, or didn't pick a cell in time).
  if (room.phase === "playing" && player.out) {
    return (
      <span className="tv-player-tag tv-player-answer is-wrong">
        <Icon name={player.out === "mina" ? "bomb" : "close"} size={12} strokeWidth={3.2} />
        <span>{player.out === "mina" ? "Pisó una mina" : "Sin tiempo"}</span>
      </span>
    );
  }
  if (player.answered) {
    return (
      <span className="tv-player-tag is-done">
        <Icon name="check" size={12} strokeWidth={3.2} />
        Listo
      </span>
    );
  }
  // Campo de minas: the right answers found so far in this round.
  if (room.phase === "playing" && player.hits > 0) {
    return <span className="tv-player-tag is-streak">{player.hits === 1 ? "1 acierto" : `${player.hits} aciertos`}</span>;
  }
  if (player.streak > 1) return <span className="tv-player-tag is-streak">Racha de {player.streak}</span>;
  return <span className="tv-player-tag">{room.phase === "playing" ? "Pensando…" : "Conectado"}</span>;
}

// A ref that makes a folded part of the column `inert` (not tappable, not reachable with Tab, hidden from screen
// readers) unless `shown`.
const inertUnless = (shown) => (el) => {
  if (el) el.inert = !shown;
};

// The room's side column, on the room screen and during a match: the invite code, who's in and the way out.
// With `scores` (a match) the players are ranked by points, each with their score and how their round is going.
// `className` lets a game add its own (Geografía hides the column on phones, where it shows a strip instead).
export default function PartyPanel({ room, onToast, scores = false, className = "" }) {
  const { user, leaveRoom } = useApp();
  const nav = useNavigate();
  const [menuFor, setMenuFor] = useState(null);
  const { copied, copy: copyInvite } = useInvite(room.code, onToast);
  // The chat opens in the column (while the room waits and in a match): the players' list (or the scoreboard) folds
  // into a row of faces (tap it, or Escape, to close the chat and unfold it again).
  // On phones the same button opens the chat in a sheet from the bottom, as in the room's bottom bar, so it looks the
  // same in the room and in a match.
  const [chatOpen, setChatOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const phone = usePhone();
  const chatting = chatOpen && !phone;
  const unread = useChatUnread(room, chatting || sheetOpen);
  const chat = useRoomChat(room, { focus: chatting });
  useEffect(() => {
    if (!chatting) return undefined;
    const onKey = (e) => e.key === "Escape" && setChatOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chatting]);

  function leave() {
    leaveRoom();
    // Replacing, not pushing: Back from Home must not return to /sala/CODE, which joins the room again.
    nav("/", { replace: true });
  }

  const alone = room.players.length === 1;
  // In a match, the ranking is of the players; those who joined mid-match (spectators) have their own list below it.
  const players = scores ? room.players.filter((p) => !p.spectator).sort((a, b) => b.score - a.score) : room.players;
  const spectators = scores ? room.players.filter((p) => p.spectator) : [];

  return (
    <aside className={`tv-party${scores ? " is-scores" : ""}${chatting ? " is-chat" : ""} ${className}`.trim()} aria-label="Tu sala">
      <div className="tv-party-codebox">
        <p className="tv-mono-label">Código de sala</p>
        <p className="tv-party-code">{room.code}</p>
        <button type="button" className="tv-btn tv-c-violet tv-invite-btn tv-shine" onClick={copyInvite} aria-label="Invitar con enlace">
          <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.6} />
          {copied ? "¡Copiado!" : "Invitar"}
        </button>
      </div>

      <div className="tv-party-title">
        <h2>{scores ? "Marcador" : "En la sala"}</h2>
        <span>{players.length === 1 ? "1 jugador" : `${players.length} jugadores`}</span>
      </div>

      {/* Folds away (and the row of faces unfolds) while the chat is open. */}
      <div className="tv-fold tv-party-people" ref={inertUnless(!chatting)}>
        <div>
          <ul className="tv-party-players" aria-label={scores ? "Marcador" : "Jugadores en la sala"}>
            {players.map((p, i) => {
              const isMe = p.id === user?.id;
              const isHostPlayer = p.id === room.hostId;
              return (
                <li
                  key={p.id}
                  className={`tv-player${isMe ? " is-me" : ""}${p.spectator ? " is-spectator" : ""}${p.connected ? "" : " is-away"}${menuFor === p.id ? " is-open" : ""}${
                    scores && !p.spectator && i < 3 ? ` is-top-${i + 1}` : ""
                  }`}
                  style={{ "--i": i }}
                >
                  <button
                    type="button"
                    className="tv-player-btn"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === p.id}
                    onClick={() => setMenuFor((cur) => (cur === p.id ? null : p.id))}
                  >
                    {scores && !p.spectator && <span className="tv-player-pos">{i + 1}</span>}
                    <Avatar name={p.name} avatar={p.avatar} />
                    <span className="tv-player-text">
                      <span className="tv-player-name">{p.name}</span>
                      {scores ? (
                        <MatchTag player={p} room={room} />
                      ) : (
                        <span className={`tv-player-tag${isHostPlayer ? " is-host" : ""}`}>{playerTag(p, { isHost: isHostPlayer })}</span>
                      )}
                    </span>
                    {isHostPlayer && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-player-crown" />}
                    {scores && !p.spectator && (
                      <span key={p.score} className="tv-player-score">
                        {p.score}
                      </span>
                    )}
                  </button>
                  {menuFor === p.id && (
                    <PlayerMenu
                      player={p}
                      isMe={isMe}
                      canManage={room.hostId === user?.id && !isMe}
                      onClose={() => setMenuFor(null)}
                      onToast={onToast}
                    />
                  )}
                </li>
              );
            })}
            {alone && !scores && (
              <li className="tv-player-waiting">
                <span className="tv-player-waiting-ring" aria-hidden="true" />
                Esperando amigos
              </li>
            )}
          </ul>
          {spectators.length > 0 && (
            <>
              <div className="tv-party-title">
                <h2>Espectadores</h2>
                <span>{spectators.length === 1 ? "1 espectador" : `${spectators.length} espectadores`}</span>
              </div>
              <ul className="tv-party-players tv-party-spectators" aria-label="Espectadores">
                {spectators.map((p) => (
                  <li key={p.id} className={`tv-player is-spectator${p.id === user?.id ? " is-me" : ""}${p.connected ? "" : " is-away"}`}>
                    <div className="tv-player-btn">
                      <Avatar name={p.name} avatar={p.avatar} />
                      <span className="tv-player-text">
                        <span className="tv-player-name">{p.name}</span>
                        <span className="tv-player-tag">{p.connected ? "Entra en la próxima partida" : "Reconectando…"}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="tv-fold tv-party-faces" ref={inertUnless(chatting)}>
        <div>
          <button type="button" className="tv-party-stack" data-sound="back" onClick={() => setChatOpen(false)}>
            <span className="tv-party-stack-faces" aria-hidden="true">
              {players.slice(0, 5).map((p) => (
                <Avatar key={p.id} name={p.name} avatar={p.avatar} className={p.connected ? "" : "is-away"} />
              ))}
              {players.length > 5 && <span className="tv-avatar tv-avatar--empty">+{players.length - 5}</span>}
            </span>
            <span className="tv-party-stack-text">Ver jugadores</span>
            <Icon name="chevron" size={18} strokeWidth={3} className="tv-party-stack-chevron" />
          </button>
        </div>
      </div>

      {/* The chat, while the room waits and in a match. Its messages grow in place of the players' list; its box takes the
          "Chat" button's place, swapping with it where it stands. */}
      <section className="tv-party-chatwrap" aria-label="Chat de la sala" ref={inertUnless(chatting)}>
        <div className="tv-chat tv-chat--side">
          <ChatMessages chat={chat} />
        </div>
      </section>
      <div className="tv-party-chatbar">
        <button
          type="button"
          className="tv-party-chatbtn"
          ref={inertUnless(!chatting)}
          onClick={() => {
            setMenuFor(null);
            if (phone) setSheetOpen(true);
            else setChatOpen(true);
          }}
          aria-label={unread ? `Chat: ${unread} mensajes nuevos` : "Abrir el chat"}
        >
          <Icon name="chat" size={18} strokeWidth={2.6} />
          Chat
          {unread > 0 && <span className="tv-chat-badge">{unread > 9 ? "9+" : unread}</span>}
        </button>
        <div className="tv-party-chatform" ref={inertUnless(chatting)}>
          <ChatForm chat={chat} />
        </div>
      </div>

      {sheetOpen && <ChatSheet room={room} onClose={() => setSheetOpen(false)} />}

      <button type="button" className="tv-leave-btn" onClick={leave}>
        <Icon name="logout" size={18} strokeWidth={2.4} />
        Salir de la sala
      </button>
    </aside>
  );
}
