import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MiniBoard from "../../components/MiniBoard.jsx";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import { remainingMs, useApp } from "../../lib/store.jsx";
import { BACKEND_URL } from "../../lib/config.js";
import WorldMap from "./WorldMap.jsx";
import { useWorld } from "./worldData.js";
import { LOCATION_SECONDS, findKind, geoConfig } from "./geoInfo.js";
import "../../styles/home.css";
import "../../styles/geo.css";

const COUNTDOWN_MS = 3000;
// One colour per player for the pins on the reveal map (never the green and red of right and wrong).
const PIN_COLORS = ["#ffb52e", "#a58bff", "#ff6a55", "#2ea8ff", "#f2456b", "#14b8a6", "#ff9f1c", "#e879f9"];
const CHEERS = ["¡Estuviste cerca!", "¡La próxima es tuya!", "¡Casi la tienes!", "¡No te rindas, tú puedes!", "¡Sigue así, vas mejorando!"];

const flagSrc = (path) => (path ? `${BACKEND_URL}${path}` : null);
const km = (n) => `${Math.round(n).toLocaleString("es-ES")} km`;

// "Ana", "Ana y Luis", "Ana, Luis y Eva".
function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
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
  const cheerOffset = useRef(Math.floor(Math.random() * CHEERS.length));
  const sending = useRef(false);
  // The phase right now, for replies that arrive after the round closed (their errors no longer matter).
  const phaseRef = useRef(room?.phase);
  phaseRef.current = room?.phase;

  const [left, setLeft] = useState(0);
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
    const t = setInterval(() => setLeft(remainingMs(room)), 100);
    return () => clearInterval(t);
  }, [room]);

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
  // Matches with map rounds keep one frame, the height of the screen, for every round (see .tv-geo-stage).
  const stage = isMap || geoConfig(room).kinds.includes("location");
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

  // Focus the answer box as a written question opens.
  useEffect(() => {
    if (room?.phase === "playing" && !isMap) setTimeout(() => inputRef.current?.focus(), 100);
  }, [room?.phase, round]);

  // The game fills what's left of the screen under the top bar (see .tv-geo-stage), so nothing has to be scrolled:
  // --geo-top is where it starts on the page.
  const hasGame = Boolean(room) && room.phase !== "finished";
  useLayoutEffect(() => {
    const el = gameRef.current;
    if (!stage || !el) return undefined;
    const measure = () => el.style.setProperty("--geo-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [stage, hasGame]);

  // Whoever scrolled down to the scoreboard is brought back up to the map as the next round counts down.
  useEffect(() => {
    if (stage && room?.phase === "countdown" && window.scrollY > 4) window.scrollTo({ top: 0 });
  }, [stage, room?.phase, round]);

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

  const isHost = room.hostId === user?.id;
  const kindInfo = findKind(kind);
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const totalMs = isMap ? LOCATION_SECONDS * 1000 : room.config?.geo?.roundMs || 15000;
  const pct =
    room.phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : room.phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const urgent = room.phase === "playing" && left <= (isMap ? 3000 : 4000);
  const tiedNames = tiebreak ? tiebreak.playerIds.map((id) => room.players.find((p) => p.id === id)?.name || "Jugador") : [];
  const colorOf = (id) => PIN_COLORS[Math.max(0, room.players.findIndex((p) => p.id === id)) % PIN_COLORS.length];

  // Everyone's pins at the reveal (only the tied players' in a tiebreak).
  const revealPins =
    room.phase === "reveal" && isMap
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
  const pinLocked = Boolean(myPin?.locked) || Boolean(me?.answered);
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
  let mapHeader;
  if (!isMap) {
    const flag = kind === "flag";
    mapHeader = {
      kicker: `${roundLabel} · Sala ${room.code}`,
      title: kind ? kindInfo.label : "Geografía",
      hint:
        room.phase === "reveal"
          ? nextText
          : room.phase === "countdown"
          ? flag
            ? "Escribe de qué país es la bandera."
            : "Escribe la capital en cuanto la sepas."
          : flag
          ? "Escribe el país y pulsa Enter. Se aceptan pequeños errores."
          : "Escribe la capital y pulsa Enter. Se aceptan pequeños errores.",
    };
  } else {
    const kicker = room.phase === "countdown" ? `${roundLabel} · Ubicación` : `${roundLabel} · ¿Dónde está…?`;
    let title = question?.name || room.reveal?.name || "";
    let hint;
    if (room.phase === "countdown") {
      title = tiebreak ? `Desempate entre ${joinNames(tiedNames)}` : "Prepárate…";
      hint = tiebreak
        ? iPlay
          ? "Pon tu pin y confírmalo: gana el primero que confirme dentro del país. Si nadie lo encuentra, el más cercano."
          : "Solo juegan los empatados. Tú miras cómo lo resuelven."
        : `Tendrás ${LOCATION_SECONDS} segundos para poner tu pin en el mapa.`;
    } else if (room.phase === "reveal") {
      hint = nextText;
    } else if (!iPlay) {
      hint = `Solo juegan ${joinNames(tiedNames)}: gana el primero que confirme su pin dentro del país.`;
    } else if (pinLocked) {
      hint = tiebreak ? "Pin confirmado. Si cayó dentro y fuiste el primero, ganas." : "Pin confirmado. Esperando al resto…";
    } else if (myPin) {
      hint = `Arrástralo o ${touch ? "toca" : "haz clic en"} otro sitio para moverlo, y confirma.`;
    } else {
      hint = touch ? "Toca para poner tu pin. Doble toque o pellizca para acercar." : "Haz clic para poner tu pin. Rueda o doble clic para acercar.";
    }
    mapHeader = { kicker, title, hint };
  }

  return (
    <div className={`tv-game tv-geo-game${stage ? " is-stage" : ""}${isMap ? " is-map" : ""}`} ref={gameRef}>
      <div className="tv-game-main tv-geo-stage">
        <section className="tv-card tv-game-top">
          <div className="tv-game-round tv-geo-find">
            <p className="tv-party-kicker">{mapHeader.kicker}</p>
            <h1 key={mapHeader.title} className="tv-card-title tv-geo-country">
              {mapHeader.title}
            </h1>
            <p className="tv-hint" aria-live="polite">
              {mapHeader.hint}
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

        <div className="tv-geo-body">
          {!isMap && room.phase === "countdown" && (
            <section className="tv-card tv-countdown">
              <p className="tv-party-kicker tv-geo-kind-kicker">
                <Icon name={kindInfo.icon} size={16} strokeWidth={2.6} />
                {kindInfo.label}
              </p>
              <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
              <p className="tv-hint">{kind === "flag" ? "Escribe de qué país es la bandera." : "Escribe la capital en cuanto la sepas."}</p>
            </section>
          )}

          {!isMap && room.phase === "playing" && question && (
            <section className="tv-card tv-play-card tv-geo-play">
              {kind === "flag" ? (
                <Flag src={flagSrc(question.flag)} alt="Bandera de un país misterioso" />
              ) : (
                <span className="tv-badge tv-c-world" aria-hidden="true">
                  <Icon name={kindInfo.icon} size={28} />
                </span>
              )}
              <h2 className="tv-play-q">{question.prompt}</h2>

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
                      placeholder={kind === "flag" ? "Escribe el país…" : "Escribe la capital…"}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="words"
                      spellCheck="false"
                      maxLength={80}
                      aria-label={kind === "flag" ? "País de la bandera" : "Capital"}
                    />
                    {query.trim() && (
                      <button type="submit" className="tv-btn tv-btn--sm tv-c-green">
                        Enviar
                      </button>
                    )}
                  </div>
                  {!query.trim() && (
                    <button type="button" className={`tv-skip-btn${confirmSkip ? " is-on" : ""}`} onClick={handleSkip} aria-live="polite">
                      <Icon name={confirmSkip ? "lock" : "close"} size={16} strokeWidth={3} />
                      {confirmSkip ? "No te dará puntos. Toca otra vez" : "Saltar"}
                    </button>
                  )}
                </form>
              ) : (
                <div className={`tv-locked${skipped ? " is-skipped" : ""}`}>
                  <span className="tv-locked-check">
                    <Icon name={skipped ? "close" : "check"} size={28} strokeWidth={3.2} />
                  </span>
                  <p className="tv-party-kicker">{skipped ? "Sin respuesta" : "Respuesta enviada"}</p>
                  <p className="tv-locked-title">{skipped ? "Te la saltaste" : mySent?.text || me?.lastAnswer?.text || "Respuesta enviada"}</p>
                  <p className="tv-hint">Esperando al resto de jugadores…</p>
                </div>
              )}
              {err && <p className="tv-lobby-error" role="alert">{err}</p>}
            </section>
          )}

          {!isMap && room.phase === "reveal" && room.reveal && (
            <WrittenReveal room={room} me={me} skipped={skipped} mySent={mySent} cheer={CHEERS[(round + cheerOffset.current) % CHEERS.length]} />
          )}
          {/* A map round keeps the same map from its countdown to its reveal: only what's on it changes. */}
          {isMap && (
            <section className={`tv-card tv-geo-map-card is-${room.phase}`}>
              {world ? (
                <WorldMap
                  key={round}
                  world={world}
                  frozen={room.phase === "countdown"}
                  interactive={room.phase === "playing" && !locked}
                  onPick={onPick}
                  myPin={room.phase === "playing" ? myPin?.lngLat || null : null}
                  pins={revealPins}
                  target={room.phase === "reveal" ? room.reveal?.map : null}
                  regions={room.phase === "playing"}
                  label={
                    room.phase === "playing"
                      ? `Mapamundi. Pon tu pin en ${question?.name}. Flechas para moverte, más y menos para acercar, Enter para poner el pin en el centro.`
                      : room.phase === "reveal"
                      ? `Mapamundi con ${room.reveal?.name || "el país"} marcado y los pines de los jugadores`
                      : "Mapamundi"
                  }
                >
                  {room.phase === "countdown" && (
                    <div className="tv-geo-countdown" aria-hidden="true">
                      <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
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

              <div className="tv-geo-action">
                {room.phase === "reveal" && room.reveal ? (
                  <MapVerdict room={room} me={me} user={user} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={iPlay} />
                ) : iPlay ? (
                  <button
                    type="button"
                    className="tv-btn tv-btn--block tv-c-world"
                    onClick={confirmPin}
                    disabled={room.phase !== "playing" || !myPin || pinLocked}
                    aria-live="polite"
                  >
                    <Icon name={pinLocked ? "check" : "pin"} size={20} strokeWidth={2.6} />
                    {pinLocked ? "Pin confirmado" : myPin ? "Confirmar pin" : "Pon tu pin en el mapa"}
                  </button>
                ) : (
                  <p className="tv-hint tv-geo-watch">Mira el desempate entre {joinNames(tiedNames)}</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <aside className="tv-game-side">
        {isMap && room.phase === "reveal" && room.reveal && <MapDistances room={room} user={user} tiebreak={tiebreak} colorOf={colorOf} />}
        <MiniBoard players={room.players || []} currentUserId={user?.id} phase={room.phase} />
      </aside>
    </div>
  );
}

// The end of a written round (capital or flag): how it went and the answer.
function WrittenReveal({ room, me, skipped, mySent, cheer }) {
  const reveal = room.reveal;
  const isCorrect = Boolean(me?.lastAnswer?.correct);
  const didAnswer = !skipped && Boolean(me?.lastAnswer?.text || mySent?.text);
  const tone = isCorrect ? "ok" : didAnswer ? "bad" : "timeout";
  return (
    <>
      <section className={`tv-card tv-result tv-result--${tone}`} role="status">
        {isCorrect && <Confetti pieces={18} />}
        <span className="tv-result-icon">
          <Icon name={isCorrect ? "check" : didAnswer ? "lock" : skipped ? "close" : "hash"} size={30} strokeWidth={3} />
        </span>
        <h2 className="tv-result-title">
          {isCorrect ? "¡Correcto!" : didAnswer ? "Incorrecto" : skipped ? "No te la sabías" : "¡Se acabó el tiempo!"}
        </h2>
        {!isCorrect && <p className="tv-result-cheer">{cheer}</p>}
        <div className="tv-tags tv-tags--center">
          {isCorrect && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0} pts</span>}
          {me?.streak > 1 && <span className="tv-tag tv-tag--streak">Racha de {me.streak}</span>}
        </div>
        {didAnswer && !isCorrect && me?.lastAnswer?.text && <p className="tv-hint">Escribiste “{me.lastAnswer.text}”</p>}
      </section>

      <section className="tv-card tv-song tv-geo-answer">
        {reveal.kind === "flag" ? (
          <Flag src={flagSrc(reveal.flag)} alt={`Bandera de ${reveal.name}`} />
        ) : (
          <span className="tv-badge tv-c-world" aria-hidden="true">
            <Icon name="landmark" size={28} />
          </span>
        )}
        <div className="tv-song-text">
          <p className="tv-party-kicker">{reveal.kind === "flag" ? "Era la bandera de" : "La respuesta era"}</p>
          <h3 className="tv-song-title">{reveal.answer}</h3>
          {reveal.kind !== "flag" && <p className="tv-song-meta">{reveal.prompt}</p>}
        </div>
      </section>
    </>
  );
}

// The end of a map round, in the row under the map: how far this player's pin landed and its points, or who won
// the tiebreak.
function MapVerdict({ room, me, user, tiebreak, tiedNames, iPlay }) {
  const answer = me?.lastAnswer;
  const name = room.reveal.name;
  let tone;
  let icon;
  let title;
  let detail;
  let won = false;
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
  } else {
    const inside = Boolean(answer?.inside);
    const placed = Boolean(answer?.pin);
    won = inside;
    tone = inside ? "ok" : placed ? "bad" : "timeout";
    icon = inside ? "check" : placed ? "pin" : "hash";
    title = inside ? "¡Dentro!" : placed ? `A ${km(answer.distanceKm)}` : "¡Se acabó el tiempo!";
    detail = inside ? `Tu pin cayó en ${name}.` : placed ? `de ${name}` : "No pusiste tu pin a tiempo.";
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
      {!tiebreak && answer?.pin && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0}</span>}
    </div>
  );
}

// Everyone's distance to the country at the end of a map round (only the tied players in a tiebreak).
function MapDistances({ room, user, tiebreak, colorOf }) {
  const players = room.players
    .filter((p) => !tiebreak || tiebreak.playerIds.includes(p.id))
    .map((p) => ({ ...p, a: p.lastAnswer || {} }))
    .sort((x, y) => (y.a.inside ? 1 : 0) - (x.a.inside ? 1 : 0) || (x.a.pin ? x.a.distanceKm : Infinity) - (y.a.pin ? y.a.distanceKm : Infinity));
  return (
    <section className="tv-card tv-geo-distances" aria-labelledby="tv-geo-distances-title">
      <h2 id="tv-geo-distances-title" className="tv-card-title">
        {room.reveal.name}: ¿quién quedó más cerca?
      </h2>
      <ol className="tv-geo-distance-list">
        {players.map((p, i) => (
          <li key={p.id} className={p.id === user?.id ? "is-me" : undefined} style={{ "--i": i, "--pin": colorOf(p.id) }}>
            <span className="tv-geo-swatch" aria-hidden="true" />
            <span className="tv-geo-distance-name">
              {p.name}
              {p.id === user?.id && <span className="tv-muted"> · tú</span>}
            </span>
            <span className={`tv-geo-distance${p.a.inside ? " is-inside" : ""}`}>
              {p.a.inside ? (
                <>
                  <Icon name="check" size={14} strokeWidth={3.2} />
                  Dentro
                </>
              ) : p.a.pin ? (
                km(p.a.distanceKm)
              ) : (
                "Sin pin"
              )}
            </span>
            {!tiebreak && <span className="tv-geo-distance-points">+{p.lastPoints || 0}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Game() {
  return (
    <TvShell mode="mundo">
      <GameScreen />
    </TvShell>
  );
}
