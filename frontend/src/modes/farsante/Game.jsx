import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Avatar from "../../components/home/Avatar.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import WaitingPill from "../../components/home/WaitingPill.jsx";
import { ControllerBar, GetReady, PhoneHint } from "../../components/home/CentralBits.jsx";
import { PauseButton, PauseVeil, SkipButton } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { MAX_CHARS, findKind, sameText } from "./farsanteInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/farsante.css";

const COUNTDOWN_MS = 3000;
const REVEAL_MS = 8000;

// Under an option at the reveal: who wrote it (or that it is the real answer), who voted for it and its points.
function Who({ option, room }) {
  const person = (id) => room.players.find((p) => p.id === id);
  const author = option.real ? null : person(option.authorId);
  return (
    <div className="tv-fs-who">
      {option.real ? (
        <span className="tv-fs-real-tag">Respuesta real</span>
      ) : (
        <span className="tv-fs-author">
          <Avatar name={author?.name || "?"} avatar={author?.avatar} />
          {author?.name || "Alguien que se fue"}
        </span>
      )}
      {option.voters.length > 0 && (
        <span className="tv-fs-voters" aria-label={`Votaron: ${option.voters.map((id) => person(id)?.name).filter(Boolean).join(", ")}`}>
          {option.voters.map((id) => (
            <Avatar key={id} name={person(id)?.name || "?"} avatar={person(id)?.avatar} />
          ))}
        </span>
      )}
      {option.points > 0 && <span className="tv-fs-pts">+{option.points}</span>}
    </div>
  );
}

function GameScreen() {
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, farsanteWrite, farsanteVote, setGame } = useApp();
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  const { central, controller, viewerId } = useView(room);

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  const [confirmHub, setConfirmHub] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const [voted, setVoted] = useState(null);
  const inputRef = useRef(null);
  const round = room?.currentRound;
  const stage = room?.farsante?.stage;

  // Join the room after a reload. Going back to the room screen is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (!room || room.code !== code) joinRoom(code).catch(() => nav("/"));
  }, [code]);
  useEffect(() => {
    if (!confirmHub) return undefined;
    const t = setTimeout(() => setConfirmHub(false), 3000);
    return () => clearTimeout(t);
  }, [confirmHub]);
  useEffect(() => {
    setErr("");
    setText("");
    setSent("");
    setVoted(null);
  }, [round]);
  useEffect(() => setErr(""), [stage]);

  const me = room?.players.find((p) => p.id === viewerId) || null;
  const spectator = Boolean(me?.spectator);
  const canAct = !central && !spectator && Boolean(me) && !room?.paused;
  // The box takes the keyboard as soon as the writing opens.
  useEffect(() => {
    if (stage === "writing" && room?.phase === "playing" && canAct) inputRef.current?.focus();
  }, [stage, round, room?.phase]);

  function backToHub() {
    if (!confirmHub) {
      setConfirmHub(true);
      return;
    }
    setConfirmHub(false);
    setGame(null).catch((e) => setErr(e.message || "No se pudo volver a la sala"));
  }

  if (!room) {
    return (
      <div className="tv-card tv-lobby-guest">
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          Conectando a la partida…
        </p>
      </div>
    );
  }
  if (room.phase === "finished" && room.results) return <MatchResults room={room} color="farsante" />;

  const fs = room.farsante;
  const kind = findKind(fs?.kind);
  const countdown = room.phase === "countdown";
  const reveal = room.phase === "reveal";
  const writing = room.phase === "playing" && stage === "writing";
  const voting = room.phase === "playing" && stage === "voting";
  const isHost = !central && room.hostId === user?.id;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || "Otro jugador";

  const totalMs = writing ? fs?.writeMs : voting ? fs?.voteMs : reveal ? REVEAL_MS : COUNTDOWN_MS;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const pct = countdown || writing || voting ? Math.max(0, Math.min(100, (left / (totalMs || COUNTDOWN_MS)) * 100)) : 100;
  const urgent = (writing || voting) && left <= 5000;
  const players = room.players.filter((p) => p.connected && !p.spectator).length;

  async function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !canAct || !writing) return;
    setErr("");
    try {
      await farsanteWrite(value);
      setSent(value);
    } catch (e2) {
      setErr(e2.message || "No se pudo enviar tu respuesta");
    }
  }

  async function vote(id) {
    if (!canAct || !voting || voted != null) return;
    setVoted(id);
    setErr("");
    try {
      await farsanteVote(id);
    } catch (e2) {
      setVoted(null);
      setErr(e2.message || "No se pudo votar");
    }
  }

  let title;
  let hint = "";
  if (countdown) {
    title = kind.label;
    hint = kind.how;
  } else if (writing) {
    title = central ? "¡Escriban sus respuestas!" : spectator ? "Estás viendo la partida" : "Escribe tu respuesta";
    hint = fs.kind === "dato" ? "Que parezca la verdad. No puede ser la respuesta real." : kind.how;
  } else if (voting) {
    title = "¡A votar!";
    hint = fs.kind === "dato" ? "Encuentra la respuesta real. Si engañas a alguien, ganas puntos." : "Vota la que más te guste. La tuya no cuenta.";
  } else if (reveal) {
    title = fs?.options ? "Resultados" : "Nadie escribió nada";
  } else {
    title = "";
  }

  const tools = (
    <>
      <SkipButton room={room} onError={setErr} />
      <PauseButton room={room} isHost={isHost} onError={setErr} />
      {isHost && (
        <button type="button" className={`tv-mini-btn${confirmHub ? " is-on" : ""}`} onClick={backToHub}>
          {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
        </button>
      )}
    </>
  );

  return (
    <div className={`tv-room tv-game tv-quiz tv-farsante${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <div className="tv-room-main tv-game-main">
        {spectator && <SpectatorBanner />}
        {controller ? (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        ) : (
          <section className="tv-game-top">
            <div className="tv-game-round">
              <p className="tv-mono-label">
                Ronda {round + 1} de {room.totalRounds} · Farsante
              </p>
              <h1 key={`${round}-${title}`} className="tv-card-title">
                {title}
              </h1>
              {hint && <p className="tv-hint">{hint}</p>}
            </div>

            <div className={`tv-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle className="tv-clock-track" cx="22" cy="22" r="19" />
                <circle className="tv-clock-fill" cx="22" cy="22" r="19" style={{ strokeDashoffset: 119.4 * (1 - pct / 100) }} />
              </svg>
              <span key={seconds} className="tv-clock-num">{seconds}</span>
            </div>

            <div className="tv-game-tools">{tools}</div>

            <div className="tv-timer" aria-hidden="true">
              <span className={`tv-timer-fill${urgent ? " is-urgent" : ""}`} style={{ width: `${pct}%` }} />
            </div>
          </section>
        )}

        <section key={round} className="tv-game-stage tv-quiz-stage is-open tv-fs-stage">
          <PauseVeil room={room} isHost={isHost} />

          {fs && !controller && (
            <div className="tv-fs-prompt">
              <div className="tv-quiz-q-meta">
                <span className="tv-match-chip">
                  <Icon name={kind.icon} size={14} strokeWidth={2.8} /> {kind.label}
                </span>
              </div>
              <h2 className="tv-fs-prompt-text">{fs.prompt}</h2>
            </div>
          )}

          {countdown && controller && <GetReady />}

          {writing && central && <PhoneHint room={room}>Escriban en su teléfono ({fs.written}/{players})</PhoneHint>}
          {writing && !central && !spectator && (
            <form className="tv-fs-write" onSubmit={submit}>
              <div className="tv-search tv-quiz-write">
                <div className="tv-search-box">
                  <Icon name="keyboard" size={22} className="tv-search-icon" />
                  <input
                    ref={inputRef}
                    type="text"
                    className="tv-search-input"
                    placeholder={fs.kind === "dato" ? "Una respuesta que suene real…" : "Escribe lo más gracioso…"}
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                    autoComplete="off"
                    autoCapitalize="sentences"
                    spellCheck="false"
                    enterKeyHint="send"
                    maxLength={MAX_CHARS}
                    aria-label="Tu respuesta"
                  />
                  {text.trim() && (
                    <button type="submit" className="tv-btn tv-btn--sm tv-c-green">
                      {sent ? "Cambiar" : "Enviar"}
                    </button>
                  )}
                </div>
              </div>
              <span className={`tv-fs-count${text.length >= MAX_CHARS ? " is-full" : ""}`}>
                {text.length}/{MAX_CHARS}
              </span>
              {sent && (
                <p className="tv-fs-sent">
                  <Icon name="check" size={18} strokeWidth={3} />
                  Enviada: {sent}
                </p>
              )}
              {sent && <WaitingPill room={room} userId={me?.id} />}
            </form>
          )}

          {(voting || reveal) && fs?.options && (
            <div className="tv-fs-options" role={voting && canAct ? "group" : undefined} aria-label="Respuestas">
              {fs.options.map((o) => {
                const mine = !central && sent && sameText(o.text, sent);
                const interactive = voting && canAct;
                const Tag = interactive ? "button" : "div";
                return (
                  <Tag
                    key={o.id}
                    type={interactive ? "button" : undefined}
                    disabled={interactive ? Boolean(mine) || voted != null : undefined}
                    onClick={interactive ? () => vote(o.id) : undefined}
                    className={`tv-fs-option${mine ? " is-mine" : ""}${voted === o.id ? " is-voted" : ""}${reveal && o.real ? " is-real" : ""}`}
                  >
                    <span className="tv-fs-option-text">{o.text}</span>
                    {mine && <span className="tv-fs-option-note">Tu respuesta</span>}
                    {reveal && <Who option={o} room={room} />}
                  </Tag>
                );
              })}
            </div>
          )}
          {voting && central && <PhoneHint room={room}>Voten en su teléfono</PhoneHint>}
          {voting && !central && !spectator && voted != null && <WaitingPill room={room} userId={me?.id} />}
          {reveal && !central && !spectator && (me?.lastPoints || 0) > 0 && <Confetti pieces={20} />}
          {reveal && !central && !spectator && (
            <p className="tv-fs-sent">{me?.lastPoints > 0 ? `+${me.lastPoints} puntos` : "Esta ronda no sumaste"}</p>
          )}
          {err && <p className="tv-lobby-error" role="alert">{err}</p>}
        </section>
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && <PartyPanel room={room} scores display={central} onToast={setErr} />}
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="farsante">
      <GameScreen />
    </TvShell>
  );
}
