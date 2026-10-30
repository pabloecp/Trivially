import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Avatar from "../../components/home/Avatar.jsx";
import Blob from "../../components/home/Blob.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import WaitingPill from "../../components/home/WaitingPill.jsx";
import { ControllerBar, GetReady, PhoneHint } from "../../components/home/CentralBits.jsx";
import { PauseButton, PauseVeil, ReportButton, SkipButton } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { MatchBar, MatchCard, MatchQuestion, topicIcon } from "../../components/home/MatchFrame.jsx";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { findDifficulty, pointsText, reyConfig } from "./reyInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/rey.css";

const PICK_MS = 10000;
const LEVEL_CLASS = { facil: "is-facil", media: "is-media", dificil: "is-dificil" };

// While a question is played: the king big on the left (the crown, their Blob, their name) and the ones trying to take
// the crown on the right, "RETADORES", each with how their round goes.
function Court({ room, king, viewerId }) {
  const reveal = room.phase === "reveal";
  const challengers = room.players.filter((p) => !p.spectator && p.id !== king?.id);
  const status = (p) => {
    if (reveal) return p.lastAnswer?.correct ? ["Acertó", "is-ok"] : p.lastAnswer?.text ? ["Falló", "is-bad"] : ["Sin respuesta", ""];
    if (p.answered) return [p.id === viewerId ? "Respondiste" : "Respondió", ""];
    return [p.id === viewerId ? "Tu turno" : "Pensando…", ""];
  };
  return (
    <div className="tv-rey-court">
      <div className="tv-rey-throne">
        <Icon name="crown" size={44} strokeWidth={1.2} filled className="tv-rey-throne-crown" />
        <span className="tv-rey-throne-blob">
          <Blob />
        </span>
        <b>{king ? (king.id === viewerId ? "Tú" : king.name) : "Sin rey"}</b>
        <span>{reveal && room.rey?.dethronedBy ? "Era el rey" : "El rey · eligió esta"}</span>
      </div>
      <div className="tv-rey-challengers">
        <span className="tv-mpanel-label">Retadores</span>
        {challengers.map((p) => {
          const [text, tone] = status(p);
          return (
            <div key={p.id} className={`tv-rey-challenger${p.id === viewerId ? " is-me" : ""}`}>
              <Avatar />
              <b>
                {p.name}
                {p.id === viewerId ? " · tú" : ""}
              </b>
              <span className={tone}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Who holds the crown now: their face, their name and what they have.
function KingBar({ room, king, you }) {
  if (!king) return null;
  return (
    <div className="tv-rey-king" role="status">
      <span className="tv-rey-crown" aria-hidden="true">
        <Icon name="crown" size={20} strokeWidth={2.4} filled />
      </span>
      <Avatar name={king.name} avatar={king.avatar} />
      <span className="tv-rey-king-text">
        <small>{room.phase === "reveal" && room.rey?.dethronedBy ? "Era el rey" : "El rey"}</small>
        <strong>{you ? "Tú" : king.name}</strong>
      </span>
      <span className="tv-rey-king-points">{pointsText(king.score || 0)}</span>
    </div>
  );
}

// The three questions the king chooses from, with their difficulty and what keeping the crown through each is worth.
// Only the king can tap them; everyone else sees them, and who is choosing.
function Offers({ offers, canPick, onPick, picked }) {
  return (
    <div className="tv-rey-offers" role={canPick ? "group" : undefined} aria-label="Preguntas para elegir">
      {offers.map((o) => {
        const level = findDifficulty(o.difficulty);
        const Tag = canPick ? "button" : "div";
        return (
          <Tag
            key={o.index}
            type={canPick ? "button" : undefined}
            className={`tv-rey-offer ${LEVEL_CLASS[o.difficulty] || ""}${picked === o.index ? " is-picked" : ""}`}
            disabled={canPick ? picked != null : undefined}
            onClick={canPick ? () => onPick(o.index) : undefined}
          >
            <span className="tv-rey-offer-meta">
              <span className="tv-match-chip">{o.category}</span>
              <span className="tv-match-chip tv-rey-level">
                {level.label} · +{o.points}
              </span>
            </span>
            <span className="tv-rey-offer-text">{o.text}</span>
          </Tag>
        );
      })}
    </div>
  );
}

function GameScreen() {
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, answer, kingPick, restartGame } = useApp();
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  const { central, controller, viewerId } = useView(room);

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  const [confirmHub, setConfirmHub] = useState(false);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState(null);
  const [picked, setPicked] = useState(null);
  const sending = useRef(false);
  const inputRef = useRef(null);
  const round = room?.currentRound;

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
    setQuery("");
    setSent(null);
    setPicked(null);
    sending.current = false;
  }, [round]);

  const playing = room?.phase === "playing";
  const me = room?.players.find((p) => p.id === viewerId) || null;
  const kingId = room?.rey?.kingId || null;
  // The king of this round (while it's played they can't answer; at the reveal the crown may already be someone else's).
  const isKing = !central && Boolean(viewerId) && viewerId === room?.rey?.roundKingId;
  const locked = !playing || room?.paused || Boolean(sent) || Boolean(me?.answered) || Boolean(me?.spectator) || isKing || central;
  // The box takes the keyboard as soon as the round opens.
  useEffect(() => {
    if (playing && !locked) inputRef.current?.focus();
  }, [playing, round]);

  function backToHub() {
    if (!confirmHub) {
      setConfirmHub(true);
      return;
    }
    setConfirmHub(false);
    restartGame().catch((e) => setErr(e.message || "No se pudo volver a la sala"));
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
  if (room.phase === "finished" && room.results) return <MatchResults room={room} />;

  const rey = room.rey || {};
  const question = room.question;
  const reveal = room.phase === "reveal";
  const picking = room.phase === "countdown";
  const spectator = Boolean(me?.spectator);
  const isHost = !central && room.hostId === user?.id;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || "Otro jugador";
  const roundKing = room.players.find((p) => p.id === rey.roundKingId) || null;
  const king = room.players.find((p) => p.id === (reveal ? rey.roundKingId : kingId)) || null;
  const youAreRoundKing = !central && viewerId === rey.roundKingId;
  const youWon = !central && reveal && rey.dethronedBy === viewerId;
  const kingPicking = picking && viewerId === kingId && !central && !spectator;

  const totalMs = playing ? question?.roundMs || reyConfig(room).roundMs : PICK_MS;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const pct = playing || picking ? Math.max(0, Math.min(100, (left / totalMs) * 100)) : 100;
  const urgent = (playing && left <= 5000) || (picking && left <= 3000);

  async function pick(index) {
    if (picked != null) return;
    setPicked(index);
    try {
      await kingPick(index);
    } catch (e) {
      setPicked(null);
      setErr(e.message || "No se pudo elegir la pregunta");
    }
  }

  async function submit(e) {
    e.preventDefault();
    const text = query.trim();
    if (locked || sending.current || !text) return;
    sending.current = true;
    setSent({ text });
    setErr("");
    try {
      await answer(text);
    } catch (e2) {
      sending.current = false;
      setSent(null);
      setErr(e2.message || "No se pudo enviar tu respuesta");
    }
  }

  // The round's middle line: what is going on.
  let title;
  if (picking) title = kingPicking ? "Elige una pregunta" : `${king ? (viewerId === king.id ? "Tú eliges" : `${king.name} elige`) : "El rey elige"} la pregunta`;
  else if (reveal) {
    title = rey.dethronedBy
      ? `¡${nameOf(rey.dethronedBy)} se queda con la corona!`
      : `¡${roundKing ? roundKing.name : "El rey"} sigue en el trono!`;
  } else if (youAreRoundKing) title = "Eres el rey: resiste";
  else if (spectator) title = "Estás viendo la partida";
  else title = "Respóndela antes que nadie";

  let hint;
  if (picking) hint = kingPicking ? "Cuanto más difícil, más puntos si nadie la acierta." : "El rey tiene unos segundos para elegir.";
  else if (reveal) hint = rey.survived ? `${pointsText(rey.points)} para el rey.` : "";
  else if (youAreRoundKing) hint = "Si alguien la acierta, te quita la corona.";
  else hint = "El primero en acertar se convierte en el rey.";

  const tools = (
    <>
      <ReportButton room={room} onError={setErr} />
      <SkipButton room={room} onError={setErr} />
      <PauseButton room={room} isHost={isHost} onError={setErr} />
      {isHost && (
        <button type="button" className={`tv-mini-btn tv-end-btn${confirmHub ? " is-on" : ""}`} onClick={backToHub}>
          {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
        </button>
      )}
    </>
  );

  const level = question ? findDifficulty(question.difficulty) : null;

  return (
    <div className={`tv-room tv-game tv-match tv-rey${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <div className="tv-room-main tv-game-main">
        {spectator && <SpectatorBanner />}
        {controller ? (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        ) : (
          <MatchCard
            room={room}
            label={!picking && question ? question.category : "El rey elige"}
            icon={!picking && question ? topicIcon(question.category) : "crown"}
            pills={!picking && question && <span className="tv-qc-pill is-dark">{level.label} · {pointsText(level.points)}</span>}
            dir={
              playing && !youAreRoundKing
                ? "Abiertas: acierta primero y quítale la corona; si nadie acierta, puntos para el rey"
                : [title, hint].filter(Boolean).join(" · ")
            }
            seconds={seconds}
            pct={pct}
            urgent={urgent}
          >
            <MatchQuestion>{!picking && question ? question.text : title}</MatchQuestion>
          </MatchCard>
        )}

        <section key={round} className="tv-game-stage tv-rey-stage tv-mpanel">
          <PauseVeil room={room} isHost={isHost} />
          {!controller && picking && <KingBar room={room} king={king} you={!central && viewerId === king?.id} />}
          {!controller && !picking && <Court room={room} king={roundKing || king} viewerId={central ? null : viewerId} />}

          {picking && rey.offers && !controller && (
            <Offers offers={rey.offers} canPick={kingPicking} onPick={pick} picked={picked} />
          )}
          {picking && controller && (kingPicking ? <Offers offers={rey.offers || []} canPick onPick={pick} picked={picked} /> : <GetReady />)}

          <div className="tv-rey-answerbox">
            {reveal && question && (
              <>
                {rey.dethronedBy && <Confetti pieces={22} />}
                <p className="tv-rey-answer">
                  Respuesta: <strong>{question.answer}</strong>
                </p>
                {youWon && <p className="tv-rey-note is-win">¡Ahora eres el rey!</p>}
                {youAreRoundKing && rey.dethronedBy && <p className="tv-rey-note is-lose">Te quitaron la corona</p>}
                {youAreRoundKing && rey.survived && <p className="tv-rey-note is-win">+{rey.points}</p>}
              </>
            )}
            {playing && central && <PhoneHint room={room}>Escriban la respuesta en su teléfono</PhoneHint>}
            {playing && !central && !locked && (
              <form className="tv-mwrite" onSubmit={submit}>
                <label className="tv-mwrite-box">
                  <Icon name="keyboard" size={24} />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Escribe tu respuesta…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="sentences"
                    spellCheck="false"
                    enterKeyHint="send"
                    maxLength={80}
                    aria-label="Tu respuesta"
                  />
                </label>
                <button type="submit" className="tv-btn tv-btn--primary tv-mwrite-send" disabled={!query.trim()}>
                  <Icon name="send" size={20} strokeWidth={2.4} />
                  Enviar
                </button>
              </form>
            )}
            {playing && !central && locked && !spectator && (
              <>
                <p className="tv-mwrite-sent">
                  <Icon name={isKing ? "crown" : "check"} size={18} strokeWidth={3} filled={isKing} />
                  {isKing ? "Eres el rey. A ver si alguien te la quita…" : sent?.text || me?.lastAnswer?.text || "Respuesta enviada"}
                </p>
                {!isKing && <WaitingPill room={room} userId={me?.id} />}
              </>
            )}
          </div>
          {err && <p className="tv-lobby-error" role="alert">{err}</p>}
        </section>
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && (
        <PartyPanel
          room={room}
          scores
          display={central}
          onToast={setErr}
          status={`En juego: ${room.players.filter((p) => !p.spectator && p.connected).length}`}
        />
      )}
      {!controller && !central && (
        <MatchBar
          room={room}
          viewerId={viewerId}
          tools={tools}
          line={playing && roundKing ? `Nadie le ha quitado la corona a ${viewerId === roundKing.id ? "ti" : roundKing.name} todavía` : undefined}
        />
      )}
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="rey">
      <GameScreen />
    </TvShell>
  );
}
