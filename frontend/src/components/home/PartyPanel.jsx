import { useEffect, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import CentralSpot from "./CentralSpot.jsx";
import Icon from "./Icon.jsx";
import FriendsRoomControls from "./FriendsRoomControls.jsx";
import PlayerMenu from "./PlayerMenu.jsx";
import { ChatForm, ChatMessages, ChatSheet, useChatUnread, usePhone, useRoomChat } from "./RoomChat.jsx";
import { useInvite } from "./useInvite.js";
import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";
import InviteFriends from "./InviteFriends.jsx";
import { useResultsLook, useScoreboardLook } from "../../lib/ownerView.js";
import { findVariant } from "./matchInfo.js";
import { findMode } from "../../modes/index.js";
import { formatElo } from "../../lib/gameStats.js";

function playerTag(player, { isHost }) {
  if (!player.connected) return "Reconectando…";
  if (isHost) return "Anfitrión";
  if (player.canEditConfig) return "Puede editar ajustes";
  return "Conectado";
}

// What the line under a name says once they answered, in each game's words ("Respondió", "Confirmó", "Ya votó"…);
// yours in the second person.
function doneWord(room, isMe) {
  if (room.game === "mundo") return isMe ? "Confirmaste" : "Confirmó";
  if (room.game === "historia") return isMe ? "Fijaste tu respuesta" : "Fijó su respuesta";
  if (room.game === "farsante") return room.farsante?.stage === "voting" ? (isMe ? "Ya votaste" : "Ya votó") : isMe ? "Ya escribiste" : "Ya escribió";
  return isMe ? "Respondiste" : "Respondió";
}

// During a match the line under each name says how their round is going. The server sends everyone's answer only
// once the round is over (reveal), and at the end each player's totals (results).
function MatchTag({ player, room, isMe = false }) {
  if (player.spectator) return <span className="tv-player-tag">Espectador</span>;
  if (!player.connected) return <span className="tv-player-tag">Reconectando…</span>;
  if (room.phase === "finished") {
    const r = room.results?.find((x) => x.id === player.id);
    if (!r) return <span className="tv-player-tag">Sin resultados</span>;
    // Only the right answers ("1 acierto", "6 aciertos").
    return <span className="tv-player-tag">{r.correct === 1 ? "1 acierto" : `${r.correct || 0} aciertos`}</span>;
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
  // Rey de la colina: who holds the crown, and who's trying to take it.
  if (room.game === "rey" && room.phase === "playing" && room.rey?.roundKingId) {
    if (player.id === room.rey.roundKingId) return <span className="tv-player-tag is-king">Rey</span>;
    if (!player.answered) return <span className="tv-player-tag">Retador</span>;
  }
  if (player.answered) return <span className="tv-player-tag is-done">{doneWord(room, isMe)}</span>;
  // Campo de minas: the right answers found so far in this round.
  if (room.phase === "playing" && player.hits > 0) {
    return <span className="tv-player-tag is-streak">{player.hits === 1 ? "1 acierto" : `${player.hits} aciertos`}</span>;
  }
  // Hasn't answered in a few rounds in a row: the rounds don't wait for them until they answer again.
  if (room.phase === "playing" && player.idle) return <span className="tv-player-tag">Inactivo</span>;
  if (player.streak > 1) return <span className="tv-player-tag is-streak">Racha de {player.streak}</span>;
  return <span className="tv-player-tag">{room.phase === "playing" ? (room.game === "mundo" ? "Buscando…" : "Pensando…") : room.phase === "countdown" ? "Preparándose…" : "Conectado"}</span>;
}

// The games a player already won in a public match (`run.results`: each game's variant and winners), by name: "Trivia
// Cerradas". An older server sends only how many (`wins`).
function wonGames(room, player) {
  const games = (room.run?.results || []).filter((g) => g.winners?.includes(player.id));
  return games.map((g) => {
    const v = findVariant(g.variant);
    const name = findMode(v?.game)?.name || "";
    return v?.way ? `${name} ${v.way}` : name;
  });
}

// "· Ganó Trivia Cerradas" (or "· Ganó 2 juegos"), after how their round is going: the "frase" scoreboard.
function WonLine({ room, player }) {
  const names = wonGames(room, player);
  const n = player.wins || names.length;
  if (!n) return null;
  return <b className="tv-player-won">&nbsp;· Ganó {n === 1 && names[0] ? names[0] : n === 1 ? "1 juego" : `${n} juegos`}</b>;
}

// The scoreboard's pill while a round is open: "Respondieron 3/4" (those still playing it); between rounds, the round.
function answeredLine(room, players) {
  if (room.phase !== "playing") return `Ronda ${Math.min(room.totalRounds || 1, (room.currentRound || 0) + 1)}`;
  const inRound = players.filter((p) => p.connected && !p.idle && p.status !== "mirando");
  return `Respondieron ${inRound.filter((p) => p.answered).length}/${inRound.length}`;
}

// A ref that makes a folded part of the column `inert` (not tappable, not reachable with Tab, hidden from screen
// readers) unless `shown`.
const inertUnless = (shown) => (el) => {
  if (el) el.inert = !shown;
};

// The room's side column, on the room screen and during a match: the group's code (a group's private match), who's in
// and the way out.
// With `scores` (a match) the players are ranked by points, each with their score and how their round is going.
// `className` lets a game add its own (Geografía hides the column on phones, where it shows a strip instead).
// At the top of the players, while the room has one, the "Dispositivo central" (CentralSpot): the screen that shows the
// match, picked from a player's menu (the host or a player with the settings permission). On the central device itself
// the column only shows (`display`): no menus, chat or way out, and the code to join instead of "Invitar".
// `group` is "Tu grupo" (GroupSheet): the code is in the sheet's own box above, the list is "En el grupo", and under it
// the leader's options for their friends and the friends to invite.
// In a match (`scores`) the header says how the round goes (`status`: "Respondieron 3/4"; by default how many answered)
// and the chat is in the match's bottom bar (MatchFrame.jsx), not here.
export default function PartyPanel({ room, onToast, scores = false, display = false, group = false, className = "", status }) {
  const { user, isCentral, group: myGroup } = useApp();
  const [menuFor, setMenuFor] = useState(null);
  // A group's private match shows the group's code: it's how more people come into the group, and so into it.
  const { copied, copy: copyInvite } = useInvite(room.groupCode, onToast);
  const [codeHidden, toggleCode] = useHiddenCode();
  // Who "you" are in the list: nobody on the central device, even when its account is one of the players'.
  const viewerId = isCentral ? null : user?.id;
  const isHost = Boolean(viewerId) && room.hostId === viewerId;
  // The host or a player with the settings permission: they pick the central device (any player, themselves too).
  const canCentral = Boolean(viewerId) && (isHost || Boolean(room.coHosts?.includes(viewerId)));
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

  // A match decided by games won (a public one or a Clásico) sends each player's `wins`. Once it's over, the column lists
  // them by games won, the one with most highlighted. Private rooms keep no scoreboard across their matches.
  const hasWins = room.players.some((p) => p.wins !== undefined);
  const winsOf = (id) => room.players.find((p) => p.id === id)?.wins || 0;
  const showBoard = !scores && hasWins && room.phase === "finished";
  const topWins = showBoard ? Math.max(0, ...room.players.map((p) => winsOf(p.id))) : 0;
  // In a match, the ranking is of the players; those who joined mid-match (spectators) have their own list below it.
  const players = scores
    ? room.players.filter((p) => !p.spectator).sort((a, b) => b.score - a.score)
    : showBoard
    ? [...room.players].sort((a, b) => winsOf(b.id) - winsOf(a.id))
    : room.players;
  const spectators = scores ? room.players.filter((p) => p.spectator) : [];
  // The games each player already won, in the match's scoreboard and in the column once it's over: in words under the
  // name ("frase", everyone's), in a box on the right ("numeros") or on the face ("insignia"); the last two only for an
  // owner trying them.
  const scoreLook = useScoreboardLook();
  // The "insignia": a gold box with the number, or with the owner's "neutro" tone a small crown and the number.
  const { tone } = useResultsLook();
  const gameWins = hasWins && (scores ? room.phase !== "finished" : showBoard);

  const inMatch = room.phase !== "lobby";
  // The spot: always while the room waits (that's where it's set); in a match only while there is a central device.
  // "Dispositivo central": only while the room has one (it's picked from a player's menu).
  const showSpot = !display && Boolean(room.central);

  return (
    <aside
      className={`tv-party${scores ? " is-scores" : ""}${chatting ? " is-chat" : ""}${display ? " is-display" : ""} ${className}`.trim()}
      aria-label="Tu sala"
    >
      {/* Only a group's private match has a code to share (the group's). Nobody joins a public match but by searching. The
          scoreboard of a match has none: only the scoreboard (the code is in the top bar and the group's bar). */}
      {room.groupCode && !room.matchmaking && !group && !scores && (
      <div className="tv-party-codebox">
        <div className="tv-party-codehead">
          <p className="tv-mono-label">Código del grupo</p>
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
        <p className={`tv-party-code${codeHidden ? " is-hidden" : ""}`}>{shownCode(room.groupCode, codeHidden)}</p>
        {display ? (
          <p className="tv-party-joinhint">Entra a trivially y únete con este código</p>
        ) : (
          <button type="button" className="tv-btn tv-c-violet tv-invite-btn tv-shine" onClick={copyInvite} aria-label="Invitar con enlace">
            <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.6} />
            {copied ? "¡Copiado!" : "Invitar"}
          </button>
        )}
      </div>
      )}

      {group && myGroup?.leaderId === viewerId && <FriendsRoomControls group={myGroup} onToast={onToast} />}

      <div className="tv-party-title">
        <h2>{scores ? "Marcador" : group ? "En el grupo" : "En la sala"}</h2>
        {scores ? (
          <span className="tv-party-status-pill">{status ?? answeredLine(room, players)}</span>
        ) : (
          <span>{players.length === 1 ? "1 jugador" : `${players.length} jugadores`}</span>
        )}
      </div>

      {/* Folds away (and the row of faces unfolds) while the chat is open. */}
      <div className="tv-fold tv-party-people" ref={inertUnless(!chatting)}>
        <div>
          {showSpot && <CentralSpot room={room} canEdit={canCentral} onToast={onToast} />}
          <ul className="tv-party-players" aria-label={scores ? "Marcador" : "Jugadores en la sala"}>
            {players.map((p, i) => {
              const isMe = p.id === viewerId;
              const isHostPlayer = p.id === room.hostId;
              const wins = winsOf(p.id);
              return (
                <li
                  key={p.id}
                  className={`tv-player${isMe ? " is-me" : ""}${scores && p.answered && room.phase === "playing" ? " is-answered" : ""}${p.spectator ? " is-spectator" : ""}${p.connected ? "" : " is-away"}${menuFor === p.id ? " is-open" : ""}${
                    scores && !p.spectator && i < 3 ? ` is-top-${i + 1}` : ""
                  }${showBoard && topWins > 0 && wins === topWins ? " is-leader" : ""}`}
                  style={{ "--i": i }}
                >
                  <button
                    type="button"
                    className="tv-player-btn"
                    aria-haspopup={display ? undefined : "menu"}
                    aria-expanded={display ? undefined : menuFor === p.id}
                    disabled={display}
                    onClick={() => setMenuFor((cur) => (cur === p.id ? null : p.id))}
                  >
                    {scores && !p.spectator && <span className="tv-player-pos">{i + 1}</span>}
                    {gameWins && scoreLook === "insignia" && p.wins > 0 ? (
                      <span className="tv-player-face">
                        <Avatar name={p.name} avatar={p.avatar} />
                        <span key={p.wins} className={`tv-player-badge is-${tone}`}>
                          {tone === "neutro" && <Icon name="crown" size={13} strokeWidth={2.6} filled />}
                          {p.wins}
                        </span>
                      </span>
                    ) : (
                      <Avatar name={p.name} avatar={p.avatar} />
                    )}
                    <span className="tv-player-text">
                      <span className="tv-player-name">
                        {p.name}
                      </span>
                      {gameWins && scoreLook === "frase" && !p.spectator ? (
                        <span className="tv-player-tagline">
                          {scores ? (
                            <MatchTag player={p} room={room} isMe={isMe} />
                          ) : (
                            <span className={`tv-player-tag${isHostPlayer ? " is-host" : ""}`}>{playerTag(p, { isHost: isHostPlayer })}</span>
                          )}
                          <WonLine room={room} player={p} />
                        </span>
                      ) : scores ? (
                        <MatchTag player={p} room={room} isMe={isMe} />
                      ) : (
                        <span className={`tv-player-tag${isHostPlayer ? " is-host" : ""}`}>{playerTag(p, { isHost: isHostPlayer })}</span>
                      )}
                    </span>
                    {!p.spectator && gameWins && scoreLook === "numeros" && (
                      <span key={`w${p.wins}`} className={`tv-player-games${p.wins > 0 ? " is-on" : ""}`} aria-label={`${p.wins} juegos ganados`}>
                        {p.wins}
                      </span>
                    )}
                    {scores && !p.spectator && (
                      <span key={p.score} className="tv-player-score">
                        {formatElo(p.score || 0)}
                      </span>
                    )}
                    {/* The host's crown, always last on the right. */}
                    {isHostPlayer && !scores && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-player-crown" />}
                  </button>
                  {menuFor === p.id && !display && (
                    <PlayerMenu
                      player={p}
                      isMe={isMe}
                      canManage={isHost && !isMe}
                      canCentral={canCentral && !inMatch}
                      onClose={() => setMenuFor(null)}
                      onToast={onToast}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {/* In "Tu grupo": your friends who are online, to invite into the group. */}
          {group && myGroup && <InviteFriends group={myGroup} onToast={onToast} />}
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


      {/* The chat, while the room waits and in a match. Its messages grow in place of the players' list; its box takes the
          "Chat" button's place, swapping with it where it stands. The central device only shows the room. */}
      {!display && !scores && (
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
        </>
      )}
    </aside>
  );
}
