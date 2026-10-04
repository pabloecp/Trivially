import { useEffect, useRef, useState } from "react";
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
import { LOCATION_SECONDS, findKind } from "./geoInfo.js";
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

  // A tap on the map. In a tiebreak the first tap is final; otherwise the pin can move until "Confirmar".
  function onPick([lng, lat]) {
    if (locked) return;
    const final = Boolean(tiebreak);
    setPin({ round, lngLat: [lng, lat], locked: final });
    setErr("");
    placePin({ lng, lat }).catch((e) => {
      if (phaseRef.current !== "playing") return;
      if (final) setPin(null);
      setErr(e.message || "No se pudo poner tu pin");
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

  return (
    <div className="tv-game tv-geo-game">
      <div className="tv-game-main">
        <section className="tv-card tv-game-top">
          <div className="tv-game-round">
            <p className="tv-party-kicker">
              Sala {room.code} · {kind ? kindInfo.label : "Geografía"}
            </p>
            <h1 className="tv-card-title">
              {tiebreak ? (
                <>
                  Desempate{tiebreak.round > 1 ? ` ${tiebreak.round}` : ""}
                </>
              ) : (
                <>
                  Ronda {round + 1} <span className="tv-muted">de {room.totalRounds}</span>
                </>
              )}
            </h1>
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

        {room.phase === "countdown" && (
          <section className={`tv-card tv-countdown${tiebreak ? " tv-geo-tiebreak" : ""}`}>
            {tiebreak ? (
              <>
                <p className="tv-party-kicker">¡Empate en el primer puesto!</p>
                <h2 className="tv-geo-tie-title">Desempate entre {joinNames(tiedNames)}</h2>
              </>
            ) : (
              <p className="tv-party-kicker tv-geo-kind-kicker">
                <Icon name={kindInfo.icon} size={16} strokeWidth={2.6} />
                {kindInfo.label}
              </p>
            )}
            <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
            <p className="tv-hint">
              {tiebreak
                ? iPlay
                  ? "Un solo intento: el primero que ponga el pin dentro del país gana. Si nadie lo encuentra, gana el más cercano."
                  : "Solo juegan los empatados. Tú miras cómo lo resuelven."
                : kind === "location"
                ? `Tendrás ${LOCATION_SECONDS} segundos para poner tu pin en el mapa.`
                : kind === "flag"
                ? "Escribe de qué país es la bandera."
                : "Escribe la capital en cuanto la sepas."}
            </p>
          </section>
        )}

        {room.phase === "playing" && !isMap && question && (
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

        {isMap && (room.phase === "playing" || room.phase === "reveal") && question && (
          <section className="tv-card tv-geo-map-card">
            {room.phase === "playing" && (
              <div className="tv-geo-ask">
                <p className="tv-party-kicker">{iPlay ? "¿Dónde está…?" : `Desempate entre ${joinNames(tiedNames)}`}</p>
                <h2 className="tv-geo-country">{question.name}</h2>
                <p className="tv-hint" aria-live="polite">
                  {!iPlay
                    ? "Solo juegan los empatados: el primero que lo encuentre gana."
                    : myPin?.locked || me?.answered
                    ? tiebreak
                      ? "Pin puesto. Esperando a tu rival…"
                      : "Pin confirmado. Esperando al resto…"
                    : tiebreak
                    ? "Un solo intento: tu primer toque cuenta."
                    : myPin
                    ? "Puedes moverlo tocando otro sitio. Si no confirmas, cuenta donde esté al acabar el tiempo."
                    : "Toca el mapa para poner tu pin. Acerca con dos dedos o la rueda."}
                </p>
              </div>
            )}

            {world ? (
              <WorldMap
                key={round}
                world={world}
                interactive={room.phase === "playing" && !locked}
                onPick={onPick}
                myPin={room.phase === "playing" ? myPin?.lngLat || null : null}
                pins={revealPins}
                target={room.phase === "reveal" ? room.reveal?.map : null}
                label={
                  room.phase === "playing"
                    ? `Mapamundi. Toca para poner tu pin en ${question.name}. Flechas para moverte, más y menos para acercar, Enter para poner el pin en el centro.`
                    : `Mapamundi con ${room.reveal?.name || "el país"} marcado y los pines de los jugadores`
                }
              />
            ) : (
              <div className="tv-geo-map tv-geo-map--loading" role="status">
                {mapError || "Cargando el mapa…"}
              </div>
            )}

            {room.phase === "playing" && iPlay && !tiebreak && (
              <button
                type="button"
                className="tv-btn tv-btn--block tv-c-world"
                onClick={confirmPin}
                disabled={!myPin || Boolean(myPin?.locked) || Boolean(me?.answered)}
              >
                <Icon name={myPin?.locked || me?.answered ? "check" : "pin"} size={20} strokeWidth={2.6} />
                {myPin?.locked || me?.answered ? "Pin confirmado" : myPin ? "Confirmar pin" : "Pon tu pin en el mapa"}
              </button>
            )}
            {err && <p className="tv-lobby-error" role="alert">{err}</p>}
          </section>
        )}

        {room.phase === "reveal" && room.reveal && (
          isMap ? (
            <MapReveal room={room} me={me} user={user} tiebreak={tiebreak} tiedNames={tiedNames} colorOf={colorOf} iPlay={iPlay} />
          ) : (
            <WrittenReveal room={room} me={me} skipped={skipped} mySent={mySent} cheer={CHEERS[(round + cheerOffset.current) % CHEERS.length]} />
          )
        )}

        {room.phase === "reveal" && (
          <p className="tv-party-status tv-next">
            <span className="tv-pulse" aria-hidden="true" />
            {tiebreak
              ? tiebreak.winnerId
                ? "Calculando resultados…"
                : tiebreak.round >= 3
                ? "Sigue el empate: calculando resultados…"
                : "Nadie ganó: otro desempate en breve…"
              : round + 1 >= room.totalRounds
              ? "Calculando resultados…"
              : "Siguiente pregunta en breve…"}
          </p>
        )}
      </div>

      <aside className="tv-game-side">
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

// The end of a map round: this player's result (or who won the tiebreak) and everyone's distance.
function MapReveal({ room, me, user, tiebreak, tiedNames, colorOf, iPlay }) {
  const answer = me?.lastAnswer;
  const players = room.players
    .filter((p) => !tiebreak || tiebreak.playerIds.includes(p.id))
    .map((p) => ({ ...p, a: p.lastAnswer || {} }))
    .sort((x, y) => (y.a.inside ? 1 : 0) - (x.a.inside ? 1 : 0) || (x.a.pin ? x.a.distanceKm : Infinity) - (y.a.pin ? y.a.distanceKm : Infinity));

  let head;
  if (tiebreak) {
    const winner = room.players.find((p) => p.id === tiebreak.winnerId);
    const won = winner?.id === user?.id;
    head = (
      <section className={`tv-card tv-result tv-result--${winner ? (won || !iPlay ? "ok" : "bad") : "timeout"}`} role="status">
        {won && <Confetti pieces={24} />}
        <span className="tv-result-icon">
          <Icon name={winner ? "crown" : "hash"} size={30} strokeWidth={2.6} />
        </span>
        <h2 className="tv-result-title">{winner ? (won ? "¡Ganaste el desempate!" : `¡${winner.name} gana el desempate!`) : "Nadie lo resolvió"}</h2>
        <p className="tv-result-cheer">
          {winner
            ? tiebreak.reason === "dentro"
              ? `${won ? "Encontraste" : "Encontró"} ${room.reveal.name} primero.`
              : `Nadie cayó dentro de ${room.reveal.name}: ${won ? "tu" : "su"} pin quedó más cerca.`
            : `${joinNames(tiedNames)} siguen empatados.`}
        </p>
      </section>
    );
  } else {
    const inside = Boolean(answer?.inside);
    const placed = Boolean(answer?.pin);
    head = (
      <section className={`tv-card tv-result tv-result--${inside ? "ok" : placed ? "bad" : "timeout"}`} role="status">
        {inside && <Confetti pieces={18} />}
        <span className="tv-result-icon">
          <Icon name={inside ? "check" : placed ? "pin" : "hash"} size={30} strokeWidth={3} />
        </span>
        <h2 className="tv-result-title">{inside ? "¡Dentro!" : placed ? `A ${km(answer.distanceKm)}` : "¡Se acabó el tiempo!"}</h2>
        <p className="tv-result-cheer">
          {inside ? `Tu pin cayó en ${room.reveal.name}.` : placed ? `de ${room.reveal.name}` : "No pusiste tu pin a tiempo."}
        </p>
        <div className="tv-tags tv-tags--center">
          {placed && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0} pts</span>}
          {me?.streak > 1 && <span className="tv-tag tv-tag--streak">Racha de {me.streak}</span>}
        </div>
      </section>
    );
  }

  return (
    <>
      {head}
      <section className="tv-card tv-geo-distances" aria-labelledby="tv-geo-distances-title">
        <h2 id="tv-geo-distances-title" className="tv-card-title">
          {room.reveal.name}: ¿quién quedó más cerca?
        </h2>
        <ol className="tv-geo-distance-list">
          {players.map((p, i) => (
            <li key={p.id} className={p.id === user?.id ? "is-me" : undefined} style={{ "--i": i, "--pin": colorOf(p.id) }}>
              <span className="tv-geo-dot" aria-hidden="true" />
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
    </>
  );
}

export default function Game() {
  return (
    <TvShell mode="mundo">
      <GameScreen />
    </TvShell>
  );
}
