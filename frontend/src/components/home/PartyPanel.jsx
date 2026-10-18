import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import CentralSpot, { DragGhost, useCentralDrag } from "./CentralSpot.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Icon from "./Icon.jsx";
import FriendsRoomControls from "./FriendsRoomControls.jsx";
import PlayerMenu from "./PlayerMenu.jsx";
import { ChatForm, ChatMessages, ChatSheet, useChatUnread, usePhone, useRoomChat } from "./RoomChat.jsx";
import { useInvite } from "./useInvite.js";
import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";

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
      <span className={`tv-player-tag tv-player-answer ${a.correct ? "is-right" : "is-wrong"}`}>
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
  // Hasn't answered in a few rounds in a row: the rounds don't wait for them until they answer again.
  if (room.phase === "playing" && player.idle) return <span className="tv-player-tag">Inactivo</span>;
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
// At the top of the players, the "Dispositivo central" spot (CentralSpot): the host drags a player onto it (or picks
// it in the player's menu) to make that player's device the screen that shows the match. On the central device itself
// the column only shows (`display`): no menus, chat or way out, and the code to join instead of "Invitar".
export default function PartyPanel({ room, onToast, scores = false, display = false, className = "" }) {
  const { user, isCentral, leaveRoom, makeCentral } = useApp();
  const nav = useNavigate();
  const [menuFor, setMenuFor] = useState(null);
  const { copied, copy: copyInvite } = useInvite(room.code, onToast);
  const [codeHidden, toggleCode] = useHiddenCode();
  // Who "you" are in the list: nobody on the central device, even when its account is one of the players'.
  const viewerId = isCentral ? null : user?.id;
  const isHost = Boolean(viewerId) && room.hostId === viewerId;
  const spotRef = useRef(null);
  const { drag, bind } = useCentralDrag({
    enabled: isHost && !display && room.phase === "lobby",
    spotRef,
    onDrop: (player) =>
      makeCentral(player.id)
        .then(() => onToast?.(`La pantalla de ${player.name} es ahora el dispositivo central`, "check"))
        .catch((err) => onToast?.(err.message || "No se pudo cambiar el dispositivo central")),
  });
  // The chat opens in the column (while the room waits and in a match): the players' list (or the scoreboard) folds
  // into a row of faces (tap it, or Escape, to close the chat and unfold it again).
  // On phones the same button opens the chat in a sheet from the bottom, as in the room's bottom bar, so it looks the
  // same in the room and in a match.
  const [chatOpen, setChatOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // "Salir de la sala" asks first, in the same modal as the top bar's "X" during a match.
  const [leaving, setLeaving] = useState(false);
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
    setLeaving(false);
    leaveRoom();
    // Replacing, not pushing: Back from Home must not return to /sala/CODE, which joins the room again.
    nav("/", { replace: true });
  }

  const alone = room.players.length === 1;
  // Between matches, the room's scoreboard (the server's room.board): each player's wins, most first, once a match
  // has been played. The one with most wins (if any) is highlighted.
  const board = room.board || { matches: 0, players: [] };
  const winsOf = (id) => board.players.find((b) => b.id === id)?.wins || 0;
  const showBoard = !scores && board.matches > 0;
  const topWins = showBoard ? Math.max(0, ...room.players.map((p) => winsOf(p.id))) : 0;
  // In a match, the ranking is of the players; those who joined mid-match (spectators) have their own list below it.
  const players = scores
    ? room.players.filter((p) => !p.spectator).sort((a, b) => b.score - a.score)
    : showBoard
    ? [...room.players].sort((a, b) => winsOf(b.id) - winsOf(a.id))
    : room.players;
  const spectators = scores ? room.players.filter((p) => p.spectator) : [];

  const inMatch = room.phase !== "lobby";
  // The spot: always while the room waits (that's where it's set); in a match only while there is a central device.
  const showSpot = !display && (!inMatch || Boolean(room.central));

  return (
    <aside
      className={`tv-party${scores ? " is-scores" : ""}${chatting ? " is-chat" : ""}${display ? " is-display" : ""}${drag ? " is-dragging" : ""} ${className}`.trim()}
      aria-label="Tu sala"
    >
      <div className="tv-party-codebox">
        <div className="tv-party-codehead">
          <p className="tv-mono-label">Código de sala</p>
          {/* Hides the code on this device's screens, for streaming. */}
          <button
            type="button"
            className={`tv-code-eye${codeHidden ? " is-on" : ""}`}
            onClick={toggleCode}
            aria-pressed={codeHidden}
            aria-label={codeHidden ? "Mostrar el código" : "Ocultar el código"}
          >
            <Icon name={codeHidden ? "eye-off" : "eye"} size={16} strokeWidth={2.4} />
            <span>{codeHidden ? "Oculto" : "Ocultar"}</span>
          </button>
        </div>
        <p className={`tv-party-code${codeHidden ? " is-hidden" : ""}`}>{shownCode(room.code, codeHidden)}</p>
        {display ? (
          <p className="tv-party-joinhint">Entra a trivially, toca Jugar y escribe este código</p>
        ) : (
          <button type="button" className="tv-btn tv-c-violet tv-invite-btn tv-shine" onClick={copyInvite} aria-label="Invitar con enlace">
            <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.6} />
            {copied ? "¡Copiado!" : "Invitar"}
          </button>
        )}
      </div>

      {isHost && !display && <FriendsRoomControls room={room} onToast={onToast} />}

      <div className="tv-party-title">
        <h2>{scores ? "Marcador" : "En la sala"}</h2>
        <span>
          {players.length === 1 ? "1 jugador" : `${players.length} jugadores`}
          {showBoard && ` · ${board.matches === 1 ? "1 partida" : `${board.matches} partidas`}`}
        </span>
      </div>

      {/* Folds away (and the row of faces unfolds) while the chat is open. */}
      <div className="tv-fold tv-party-people" ref={inertUnless(!chatting)}>
        <div>
          {showSpot && <CentralSpot room={room} spotRef={spotRef} drag={drag} isHost={isHost} onToast={onToast} />}
          <ul className="tv-party-players" aria-label={scores ? "Marcador" : "Jugadores en la sala"}>
            {players.map((p, i) => {
              const isMe = p.id === viewerId;
              const isHostPlayer = p.id === room.hostId;
              const wins = winsOf(p.id);
              return (
                <li
                  key={p.id}
                  className={`tv-player${isMe ? " is-me" : ""}${p.spectator ? " is-spectator" : ""}${p.connected ? "" : " is-away"}${menuFor === p.id ? " is-open" : ""}${
                    scores && !p.spectator && i < 3 ? ` is-top-${i + 1}` : ""
                  }${showBoard && topWins > 0 && wins === topWins ? " is-leader" : ""}${drag?.player.id === p.id ? " is-dragged" : ""}`}
                  style={{ "--i": i }}
                >
                  <button
                    type="button"
                    className="tv-player-btn"
                    aria-haspopup={display ? undefined : "menu"}
                    aria-expanded={display ? undefined : menuFor === p.id}
                    disabled={display}
                    onClick={() => setMenuFor((cur) => (cur === p.id ? null : p.id))}
                    {...bind(p, !isHostPlayer && p.connected)}
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
                    {scores && !p.spectator && (
                      <span key={p.score} className="tv-player-score">
                        {p.score}
                      </span>
                    )}
                    {showBoard && (
                      <span className="tv-player-wins" aria-label={`${wins} ${wins === 1 ? "victoria" : "victorias"}`}>
                        {wins}
                        <small>{wins === 1 ? "victoria" : "victorias"}</small>
                      </span>
                    )}
                    {/* The host's crown, always last on the right. */}
                    {isHostPlayer && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-player-crown" />}
                  </button>
                  {menuFor === p.id && !display && (
                    <PlayerMenu
                      player={p}
                      isMe={isMe}
                      canManage={isHost && !isMe}
                      canCentral={isHost && !isMe && !inMatch}
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
                  <li key={p.id} className={`tv-player is-spectator${p.id === viewerId ? " is-me" : ""}${p.connected ? "" : " is-away"}`}>
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

      <DragGhost drag={drag} />

      {/* The chat, while the room waits and in a match. Its messages grow in place of the players' list; its box takes the
          "Chat" button's place, swapping with it where it stands. The central device only shows the room. */}
      {!display && (
        <>
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

          <button type="button" className="tv-leave-btn" aria-haspopup="dialog" onClick={() => setLeaving(true)}>
            <Icon name="logout" size={18} strokeWidth={2.4} />
            Salir de la sala
          </button>
        </>
      )}
      {createPortal(
        <ConfirmDialog
          open={leaving}
          title="¿Seguro que quieres salir?"
          text={inMatch ? "Saldrás de la sala y dejarás la partida en curso." : "Saldrás de la sala. Para volver a entrar necesitarás el código o el enlace de invitación."}
          cancelLabel={inMatch ? "Seguir jugando" : "Quedarme"}
          confirmLabel="Salir"
          onCancel={() => setLeaving(false)}
          onConfirm={leave}
        />,
        document.querySelector(".tv-app") || document.body
      )}
    </aside>
  );
}
