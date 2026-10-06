import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { useApp, useRemainingMs } from "../../lib/store.jsx";
import { BACKEND_URL } from "../../lib/config.js";
import WorldMap from "./WorldMap.jsx";
import { useWorld } from "./worldData.js";
import { LOCATION_SECONDS, findKind } from "./geoInfo.js";
import "../../styles/home.css";
import "../../styles/geo.css";

const COUNTDOWN_MS = 3000;
// One colour per player for the pins on the reveal map (never the green and red of right and wrong).
const PIN_COLORS = ["#ffb52e", "#a58bff", "#ff6a55", "#2ea8ff", "#f2456b", "#14b8a6", "#ff9f1c", "#e879f9"];

const flagSrc = (path) => (path ? `${BACKEND_URL}${path}` : null);
const km = (n) => `${Math.round(n).toLocaleString("es-ES")} km`;

// "Ana", "Ana y Luis", "Ana, Luis y Eva".
function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// "¿Cuál es la capital del Reino Unido?" → "Capital del Reino Unido", short enough for the top card.
function capitalTitle(prompt = "") {
  const short = prompt.replace(/^¿\s*cuál es la\s+/i, "").replace(/\?$/, "").trim();
  return short ? short[0].toUpperCase() + short.slice(1) : "Capitales";
}

function Flag({ src, alt }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="tv-geo-flag is-missing" role="img" aria-label={alt}>
        <Icon name="flag" size={40} />
        <span>No se pudo cargar la bandera</span>
      </div>
    );
  }
  return <img key={src} className="tv-geo-flag" src={src} alt={alt} onError={() => setFailed(true)} />;
}

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, answer, skipSong, placePin, setGame } = useApp();
  const nav = useNavigate();
  const { world, error: mapError } = useWorld();
  const inputRef = useRef(null);
  const gameRef = useRef(null);
  // Phones and tablets get "toca" in the hints; a mouse gets "haz clic".
  const [touch] = useState(() => Boolean(window.matchMedia?.("(pointer: coarse)").matches));
  const sending = useRef(false);
  // The phase right now, for replies that arrive after the round closed (their errors no longer matter).
  const phaseRef = useRef(room?.phase);
  phaseRef.current = room?.phase;

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  // What this player sent this round, shown before the server confirms: { round, text } / { round, skipped }.
  const [sent, setSent] = useState(null);
  // This player's pin on the map round being played: { round, lngLat, locked }.
  const [pin, setPin] = useState(null);
  const [confirmHub, setConfirmHub] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);

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
    if (!confirmSkip) return undefined;
    const t = setTimeout(() => setConfirmSkip(false), 3000);
    return () => clearTimeout(t);
  }, [confirmSkip]);

  const round = room?.currentRound;
  const question = room?.question;
  const kind = question?.kind;
  const isMap = kind === "location";
  const tiebreak = room?.tiebreak || null;
  const iPlay = !tiebreak || tiebreak.playerIds.includes(user?.id);
  const playerObj = room?.players?.find((p) => p.id === user?.id);
  const me = playerObj
    ? { ...playerObj, ...(room?.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room?.me?.lastAnswer }
    : room?.me;
  const mySent = sent?.round === round ? sent : null;
  const myPin = pin?.round === round ? pin : null;
  const skipped = Boolean(mySent?.skipped) || Boolean(me?.lastAnswer?.skipped);
  const locked = room?.phase !== "playing" || Boolean(me?.answered) || Boolean(mySent) || Boolean(myPin?.locked) || !iPlay;

  // A new round: clean slate.
  useEffect(() => {
    sending.current = false;
    setQuery("");
    setConfirmSkip(false);
  }, [round]);
  useEffect(() => setErr(""), [round, room?.phase]);

  // Focus the answer box as a written question opens (only with a mouse: on a phone it would pop the keyboard up
  // over the map before the player even looked).
  useEffect(() => {
    if (room?.phase === "playing" && !isMap && !touch) setTimeout(() => inputRef.current?.focus(), 100);
  }, [room?.phase, round]);

  // The game is one frame that fills the screen under the top bar (see .tv-geo-stage); --geo-top is where it starts.
  // On a phone the page doesn't scroll at all during the match (html.tv-geo-playing hides the top bar and locks it),
  // so nothing moves when rounds change or the keyboard opens and closes.
  // Nor does the page zoom: a pinch is for the map (WorldMap takes the ones that start on it), and a zoomed page
  // would push the frame off the screen. maximum-scale also undoes a zoom from before the match.
  const hasGame = Boolean(room) && room.phase !== "finished";
  useLayoutEffect(() => {
    const el = gameRef.current;
    if (!hasGame || !el) return undefined;
    const root = document.documentElement;
    root.classList.add("tv-geo-playing");
    const measure = () => el.style.setProperty("--geo-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener("resize", measure);
    const viewport = document.querySelector('meta[name="viewport"]');
    const pageViewport = viewport?.getAttribute("content");
    viewport?.setAttribute("content", `${pageViewport}, maximum-scale=1, user-scalable=no`);
    const noPinch = (e) => {
      if (e.cancelable && (e.type !== "touchmove" || e.touches.length > 1)) e.preventDefault();
    };
    const pinchEvents = ["touchmove", "gesturestart", "gesturechange"];
    for (const type of pinchEvents) document.addEventListener(type, noPinch, { passive: false });
    return () => {
      root.classList.remove("tv-geo-playing");
      window.removeEventListener("resize", measure);
      if (pageViewport) viewport.setAttribute("content", pageViewport);
      for (const type of pinchEvents) document.removeEventListener(type, noPinch);
    };
  }, [hasGame]);

  // Whoever scrolled away (a computer, where the page can scroll) is brought back to the game as a round counts down.
  useEffect(() => {
    if (room?.phase === "countdown" && window.scrollY > 4) window.scrollTo({ top: 0 });
  }, [room?.phase, round]);

  // After a reload mid-round, the pin this player had placed comes back with the room.
  useEffect(() => {
    if (room?.me?.pin && !myPin && isMap) setPin({ round, lngLat: room.me.pin, locked: Boolean(room.me.lastAnswer) });
  }, [room?.me?.pin, round]);

  async function submitText() {
    const text = query.trim();
    if (locked || sending.current || !text) return;
    sending.current = true;
    setSent({ round, text });
    setErr("");
    inputRef.current?.blur();
    try {
      await answer(text);
    } catch (e) {
      if (phaseRef.current === "playing") {
        setSent(null);
        sending.current = false;
        setErr(e.message || "No se pudo enviar tu respuesta");
      }
    }
  }

  function handleSkip() {
    if (locked) return;
    if (!confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    setConfirmSkip(false);
    setSent({ round, skipped: true });
    skipSong().catch((e) => {
      setSent(null);
      setErr(e.message || "No se pudo saltar la pregunta");
    });
  }

  // A tap on the map (or the pin let go after dragging it): the pin can move until "Confirmar".
  function onPick([lng, lat]) {
    if (locked) return;
    setPin({ round, lngLat: [lng, lat], locked: false });
    setErr("");
    placePin({ lng, lat }).catch((e) => {
      if (phaseRef.current === "playing") setErr(e.message || "No se pudo poner tu pin");
    });
  }

  async function confirmPin() {
    if (locked || !myPin || sending.current) return;
    sending.current = true;
    setPin({ ...myPin, locked: true });
    try {
      await placePin({ lng: myPin.lngLat[0], lat: myPin.lngLat[1], lock: true });
    } catch (e) {
      sending.current = false;
      if (phaseRef.current !== "playing") return;
      setPin({ ...myPin, locked: false });
      setErr(e.message || "No se pudo confirmar tu pin");
    }
  }

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

  if (room.phase === "finished" && room.results) return <MatchResults room={room} color="world" />;

  const phase = room.phase;
  const isHost = room.hostId === user?.id;
  const kindInfo = findKind(kind);
  const isFlag = kind === "flag";
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const totalMs = isMap ? LOCATION_SECONDS * 1000 : room.config?.geo?.roundMs || 15000;
  const pct =
    phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const urgent = phase === "playing" && left <= (isMap ? 3000 : 4000);
  const tiedNames = tiebreak ? tiebreak.playerIds.map((id) => room.players.find((p) => p.id === id)?.name || "Jugador") : [];
  const colorOf = (id) => PIN_COLORS[Math.max(0, room.players.findIndex((p) => p.id === id)) % PIN_COLORS.length];
  const pinLocked = Boolean(myPin?.locked) || Boolean(me?.answered);

  // Everyone's pins at the reveal of a map round (only the tied players' in a tiebreak).
  const revealPins =
    phase === "reveal" && isMap
      ? room.players
          .filter((p) => p.lastAnswer?.pin && (!tiebreak || tiebreak.playerIds.includes(p.id)))
          .map((p) => ({
            id: p.id,
            lngLat: p.lastAnswer.pin,
            nearest: p.lastAnswer.nearest,
            inside: p.lastAnswer.inside,
            color: colorOf(p.id),
            label: p.id === user?.id ? "Tú" : p.name.slice(0, 12),
            isMe: p.id === user?.id,
          }))
      : [];

  const roundLabel = tiebreak ? `Desempate${tiebreak.round > 1 ? ` ${tiebreak.round}` : ""}` : `Ronda ${round + 1} de ${room.totalRounds}`;
  const nextText = tiebreak
    ? tiebreak.winnerId
      ? "Calculando resultados…"
      : tiebreak.round >= 3
      ? "Sigue el empate: calculando resultados…"
      : "Nadie ganó: otro desempate en breve…"
    : round + 1 >= room.totalRounds
    ? "Calculando resultados…"
    : "Siguiente pregunta en breve…";

  // The top card: the same three lines (kicker, title, hint) in every round and phase, so nothing below it moves.
  let kicker = `${roundLabel} · ${kind ? kindInfo.label : "Geografía"}`;
  let title;
  let hint;
  if (phase === "countdown") {
    title = tiebreak ? `Desempate entre ${joinNames(tiedNames)}` : "Prepárate…";
    if (tiebreak) {
      hint = iPlay
        ? "Pon tu pin y confírmalo: gana el primero que confirme dentro del país. Si nadie lo encuentra, el más cercano."
        : "Solo juegan los empatados. Tú miras cómo lo resuelven.";
    } else if (isMap) hint = `Tendrás ${LOCATION_SECONDS} segundos para poner tu pin en el mapa.`;
    else hint = isFlag ? "Saldrá una bandera: escribe de qué país es." : "Escribe la capital en cuanto la sepas.";
  } else if (isMap) {
    kicker = `${roundLabel} · ¿Dónde está…?`;
    title = question?.name || room.reveal?.name || "";
    if (phase === "reveal") hint = nextText;
    else if (!iPlay) hint = `Solo juegan ${joinNames(tiedNames)}: gana el primero que confirme su pin dentro del país.`;
    else if (pinLocked) hint = tiebreak ? "Pin confirmado. Si cayó dentro y fuiste el primero, ganas." : "Pin confirmado. Esperando al resto…";
    else if (myPin) hint = `Arrástralo o ${touch ? "toca" : "haz clic en"} otro sitio para moverlo, y confirma.`;
    else hint = touch ? "Toca para poner tu pin. Doble toque o pellizca para acercar." : "Haz clic para poner tu pin. Rueda, doble clic o arrastra para moverte.";
  } else {
    title = isFlag ? "¿De qué país es esta bandera?" : capitalTitle(question?.prompt);
    if (phase === "reveal") hint = nextText;
    else if (locked) hint = "Esperando al resto de jugadores…";
    else hint = `Escribe ${isFlag ? "el país" : "la capital"} y pulsa Enter. Se aceptan pequeños errores.`;
  }

  // Under the map, always the same height: what to do now, or how the round went.
  let action;
  if (phase === "reveal" && room.reveal) {
    action = <Verdict room={room} me={me} user={user} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={iPlay} isMap={isMap} skipped={skipped} />;
  } else if (isMap && !iPlay) {
    action = <p className="tv-hint tv-geo-watch">Mira el desempate entre {joinNames(tiedNames)}</p>;
  } else if (isMap) {
    action = (
      <button type="button" className="tv-btn tv-btn--block tv-c-world" onClick={confirmPin} disabled={phase !== "playing" || !myPin || pinLocked} aria-live="polite">
        <Icon name={pinLocked ? "check" : "pin"} size={20} strokeWidth={2.6} />
        {pinLocked ? "Pin confirmado" : myPin ? "Confirmar pin" : "Pon tu pin en el mapa"}
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        className={`tv-btn tv-btn--block tv-c-neutral tv-geo-skip${confirmSkip ? " is-on" : ""}`}
        onClick={handleSkip}
        disabled={phase !== "playing" || locked}
        aria-live="polite"
      >
        <Icon name={skipped ? "close" : mySent ? "check" : confirmSkip ? "lock" : "close"} size={18} strokeWidth={3} />
        {skipped ? "Te la saltaste" : mySent || me?.answered ? "Respuesta enviada" : confirmSkip ? "No te dará puntos. Toca otra vez" : "Saltar"}
      </button>
    );
  }

  return (
    <div className="tv-room tv-game tv-geo-game" ref={gameRef}>
      <div className="tv-room-main tv-game-main tv-geo-stage">
        <section className="tv-game-top">
          <div className="tv-game-round tv-geo-find">
            <p className="tv-mono-label">{kicker}</p>
            <h1 key={title} className="tv-card-title tv-geo-country">
              {title}
            </h1>
            <p className="tv-hint" aria-live="polite">
              {hint}
            </p>
          </div>

          <div className={`tv-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle className="tv-clock-track" cx="22" cy="22" r="19" />
              <circle className="tv-clock-fill" cx="22" cy="22" r="19" style={{ strokeDashoffset: 119.4 * (1 - pct / 100) }} />
            </svg>
            <span key={seconds} className="tv-clock-num">{seconds}</span>
          </div>

          <div className="tv-game-tools">
            {isHost && (
              <button
                type="button"
                className={`tv-mini-btn${confirmHub ? " is-on" : ""}`}
                onClick={backToHub}
                title="Termina la partida y lleva a todos al inicio"
              >
                {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
              </button>
            )}
          </div>

          <div className="tv-timer" aria-hidden="true">
            <span className={`tv-timer-fill${urgent ? " is-urgent" : ""}`} style={{ width: `${pct}%` }} />
          </div>
        </section>

        {/* Phones and tablets: the scoreboard in a strip, since the full one (at the side on a computer) has no room. */}
        <ScoreStrip players={room.players || []} meId={user?.id} phase={phase} />

        {/* The same map for the whole match: a map round puts pins on it, a written one floats over it and its reveal
            flies to the country. Only what's on it changes, never its size. */}
        <section className={`tv-card tv-geo-map-card is-${phase}${isMap ? " is-map" : " is-written"}`}>
          {world ? (
            <WorldMap
              world={world}
              resetKey={round}
              frozen={phase === "countdown" || !isMap}
              interactive={isMap && phase === "playing" && !locked}
              onPick={onPick}
              myPin={isMap && phase === "playing" ? myPin?.lngLat || null : null}
              pins={revealPins}
              target={phase === "reveal" ? room.reveal?.map : null}
              regions={isMap && phase === "playing"}
              label={
                isMap && phase === "playing"
                  ? `Mapamundi. Pon tu pin en ${question?.name}. Flechas para moverte, más y menos para acercar, Enter para poner el pin en el centro.`
                  : phase === "reveal"
                  ? `Mapamundi con ${room.reveal?.name || "el país"} marcado`
                  : "Mapamundi"
              }
            >
              {phase === "countdown" && (
                <div className="tv-geo-countdown" aria-hidden="true">
                  <p className="tv-mono-label tv-geo-kind-kicker">
                    <Icon name={kindInfo.icon} size={16} strokeWidth={2.6} />
                    {tiebreak ? "Desempate" : kindInfo.label}
                  </p>
                  <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
                </div>
              )}

              {!isMap && phase === "playing" && question && (
                <div className="tv-geo-veil">
                  <div className="tv-geo-ask">
                    {isFlag && <Flag src={flagSrc(question.flag)} alt="Bandera de un país misterioso" />}
                    {!locked ? (
                      <form
                        className="tv-search"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitText();
                        }}
                      >
                        <div className="tv-search-box">
                          <Icon name={kindInfo.icon} size={22} className="tv-search-icon" />
                          <input
                            ref={inputRef}
                            type="text"
                            className="tv-search-input"
                            placeholder={isFlag ? "Escribe el país…" : "Escribe la capital…"}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoComplete="off"
                            autoCapitalize="words"
                            spellCheck="false"
                            enterKeyHint="send"
                            maxLength={80}
                            aria-label={isFlag ? "País de la bandera" : "Capital"}
                          />
                          {query.trim() && (
                            <button type="submit" className="tv-btn tv-btn--sm tv-c-green">
                              Enviar
                            </button>
                          )}
                        </div>
                      </form>
                    ) : (
                      <p className={`tv-geo-sent${skipped ? " is-skipped" : ""}`}>
                        <Icon name={skipped ? "close" : "check"} size={18} strokeWidth={3} />
                        {skipped ? "Te la saltaste" : mySent?.text || me?.lastAnswer?.text || "Respuesta enviada"}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {err && (
                <p className="tv-geo-error" role="alert">
                  {err}
                </p>
              )}
            </WorldMap>
          ) : (
            <div className="tv-geo-map tv-geo-map--loading" role="status">
              {mapError || "Cargando el mapa…"}
            </div>
          )}

          <div className="tv-geo-action">{action}</div>
        </section>
      </div>

      <PartyPanel room={room} scores className="tv-geo-side" />
    </div>
  );
}

// The scoreboard as one strip of chips (position, name, score, and this round's points at the reveal).
function ScoreStrip({ players, meId, phase }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <ol className="tv-geo-scores" aria-label="Marcador">
      {ranked.map((p, i) => (
        <li key={p.id} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`}>
          <span className="tv-geo-scores-pos">{i + 1}</span>
          <span className="tv-geo-scores-name">{p.id === meId ? "Tú" : p.name}</span>
          <strong key={p.score}>{p.score}</strong>
          {phase === "reveal" && p.lastPoints > 0 && <em>+{p.lastPoints}</em>}
          {phase === "playing" && p.answered && <Icon name="check" size={13} strokeWidth={3.2} />}
        </li>
      ))}
    </ol>
  );
}

// The end of a round, in the row under the map: how this player did (the pin's distance, or whether the written
// answer was right, and what it was), or who won the tiebreak.
function Verdict({ room, me, user, tiebreak, tiedNames, iPlay, isMap, skipped }) {
  const answer = me?.lastAnswer;
  const reveal = room.reveal;
  const name = reveal.name;
  let tone;
  let icon;
  let title;
  let detail;
  let won = false;
  let points = false;
  if (tiebreak) {
    const winner = room.players.find((p) => p.id === tiebreak.winnerId);
    won = Boolean(winner) && winner.id === user?.id;
    tone = winner ? (won || !iPlay ? "ok" : "bad") : "timeout";
    icon = winner ? "crown" : "hash";
    title = winner ? (won ? "¡Ganaste el desempate!" : `¡${winner.name} gana el desempate!`) : "Nadie lo resolvió";
    detail = winner
      ? tiebreak.reason === "dentro"
        ? `${won ? "Confirmaste" : "Confirmó"} ${name} primero.`
        : `Nadie cayó dentro: ${won ? "tu" : "su"} pin quedó más cerca.`
      : `${joinNames(tiedNames)} siguen empatados.`;
  } else if (isMap) {
    const inside = Boolean(answer?.inside);
    const placed = Boolean(answer?.pin);
    won = inside;
    points = placed;
    tone = inside ? "ok" : placed ? "bad" : "timeout";
    icon = inside ? "check" : placed ? "pin" : "hash";
    title = inside ? "¡Dentro!" : placed ? `A ${km(answer.distanceKm)}` : "¡Se acabó el tiempo!";
    detail = inside ? `Tu pin cayó en ${name}.` : placed ? `de ${name}` : "No pusiste tu pin a tiempo.";
  } else {
    const correct = Boolean(answer?.correct);
    const wrote = !skipped && Boolean(answer?.text);
    won = correct;
    points = correct;
    tone = correct ? "ok" : wrote ? "bad" : "timeout";
    icon = correct ? "check" : wrote || skipped ? "close" : "hash";
    title = correct ? "¡Correcto!" : wrote ? "Incorrecto" : skipped ? "Te la saltaste" : "¡Se acabó el tiempo!";
    const solution = reveal.kind === "flag" ? `Era la bandera de ${reveal.answer}` : `Era ${reveal.answer}`;
    detail = correct ? (reveal.kind === "flag" ? `Es la bandera de ${reveal.answer}.` : `${reveal.answer}, la capital.`) : wrote ? `${solution} · escribiste “${answer.text}”` : `${solution}.`;
  }
  return (
    <div className={`tv-geo-verdict tv-geo-verdict--${tone}`} role="status">
      {won && <Confetti pieces={18} />}
      <span className="tv-geo-verdict-icon">
        <Icon name={icon} size={22} strokeWidth={tiebreak ? 2.6 : 3} />
      </span>
      <span className="tv-geo-verdict-text">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {points && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0}</span>}
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="mundo">
      <GameScreen />
    </TvShell>
  );
}
