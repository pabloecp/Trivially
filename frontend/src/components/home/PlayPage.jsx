import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AVATAR_COLORS, savedGuest, useApp } from "../../lib/store.jsx";
import { withSound } from "../../lib/sounds.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import ModeStage from "./ModeStage.jsx";
import Segmented from "./Segmented.jsx";
import SlowReel from "./SlowReel.jsx";
import { MATCH_KINDS, MATCH_ROUNDS, MATCH_SIZES, gamesText } from "./matchInfo.js";
import "../../styles/match.css";

const ROOM_CODE_LENGTH = 5;
// The tiles sink away for this long before the chosen option's card comes in (and the card goes before the tiles come
// back), like "Elige el juego" in a room (TILES_OUT_MS in Home.jsx).
const OUT_MS = 320;

// The three ways to play, each with its big card (ModeStage: icon, name, how it goes).
const KINDS = [
  {
    ...MATCH_KINDS.casual,
    steps: [
      { icon: "bolt", text: "Partidas de 5 o 15 rondas" },
      { icon: "users", text: "Duelo o todos contra todos" },
      { icon: "play", text: "Entra y juega en segundos" },
    ],
  },
  {
    ...MATCH_KINDS.competitivo,
    steps: [
      { icon: "crown", text: "Solo preguntas medias y difíciles" },
      { icon: "users", text: "Duelo o todos contra todos" },
      { icon: "star", text: "Gana quien sume más puntos" },
    ],
  },
  {
    id: "privada",
    name: "Privada",
    color: "blue",
    icon: "lock",
    blurb: "Crea una sala o entra con un código",
    steps: [
      { icon: "users", text: "Crea tu sala e invita a tus amigos" },
      { icon: "grid", text: "Elijan el juego y sus ajustes" },
      { icon: "hash", text: "O entra con el código de un amigo" },
    ],
  },
];

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// "¿Cómo quieres jugar?" as a page of its own (/jugar), not a sheet: Casual, Competitivo and Privada as big tiles. Picking
// one (/jugar/casual, /jugar/privada...) makes the tiles sink away and that option's card grow in with its settings beside
// it, on the same page; the top bar's "Volver" (the only way back) and the browser's Back do it the other way round. Leaving a room
// comes back to the option it came from (exitPath in TvTopbar.jsx). Without an account, the settings card asks for the name first (filled in with the one
// used last time), then does what was asked. Once in a room, RoomNavigator takes the player there.
export default function PlayPage({ leaving = false }) {
  const { user, saveGuest, createRoom, joinRoom, checkRoom, findMatch } = useApp();
  const nav = useNavigate();
  // The option comes from the address; `chosen` is the one on screen, which follows it once the old one has gone.
  const { option } = useParams();
  const wanted = KINDS.some((k) => k.id === option) ? option : null;
  const [chosen, setChosen] = useState(wanted);
  const [out, setOut] = useState(false);
  const [rounds, setRounds] = useState(MATCH_ROUNDS[0]);
  const [size, setSize] = useState(MATCH_SIZES[1].value);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(null); // what to do once there's a name
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeRef = useRef(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const kind = KINDS.find((k) => k.id === chosen) || null;
  const needsName = !user?.name || user.isGuest;

  useEffect(() => {
    if (wanted === chosen) return;
    setError("");
    setPending(null);
    if (reducedMotion()) {
      setChosen(wanted);
      return;
    }
    setOut(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setOut(false);
      setChosen(wanted);
    }, OUT_MS);
  }, [wanted]);

  function run(action) {
    if (needsName) {
      const last = user?.isGuest ? { name: user.name, avatar: user.avatar } : savedGuest();
      setName(last.name || "");
      setColor(AVATAR_COLORS.includes(last.avatar) ? last.avatar : AVATAR_COLORS[0]);
      setError("");
      setPending(action);
      return;
    }
    perform(action);
  }

  async function perform(action) {
    setBusy(true);
    setError("");
    try {
      await withSound(() =>
        action.type === "create"
          ? createRoom("multi", {}, null)
          : action.type === "match"
          ? findMatch(action.kind, action.rounds, action.size)
          : joinRoom(action.code)
      );
      // The room navigator takes the player wherever the room is.
    } catch (err) {
      // This account already plays in that room from another device: CentralOffer asks about this one instead.
      if (err.offer) return;
      setError(err.message || "Algo salió mal, inténtalo otra vez");
      setBusy(false);
    }
  }

  async function submitName(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await withSound(() => saveGuest(name, color), null);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    const action = pending;
    setPending(null);
    perform(action);
  }

  // The code is checked first, so a wrong one is said here; a wrong code shakes the box each time.
  async function submitCode(e) {
    e.preventDefault();
    if (code.length < ROOM_CODE_LENGTH || busy) return;
    setBusy(true);
    try {
      await withSound(() => checkRoom(code), needsName ? "next" : null);
    } catch (err) {
      setError(err.message || "No hay ninguna sala con ese código");
      setBusy(false);
      codeRef.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
        { duration: 320, easing: "ease-out" }
      );
      return;
    }
    setBusy(false);
    run({ type: "join", code });
  }

  const match = kind && kind.id !== "privada";
  const mainLabel = match ? (busy ? "Buscando…" : "Buscar partida") : busy ? "Creando sala…" : "Crear sala";
  const mainAction = match ? { type: "match", kind: kind.id, rounds, size } : { type: "create" };

  return (
    <div className={`tv-room tv-playpage${leaving ? " is-leaving" : ""}`}>
      <div className="tv-room-main">
        {!kind ? (
          <section className={`tv-picker tv-play-picker${out ? " is-leaving" : ""}`} aria-labelledby="tv-play-title">
            <div className="tv-picker-head">
              <h1 id="tv-play-title" className="tv-picker-title">
                ¿Cómo quieres jugar?
              </h1>
            </div>
            <div className="tv-play-grid">
              {KINDS.map((k, i) => (
                <button
                  key={k.id}
                  type="button"
                  className={`tv-mode tv-play-tile tv-c-${k.color}`}
                  style={{ "--i": i }}
                  onClick={() => nav(`/jugar/${k.id}`, { state: { from: "/jugar" } })}
                >
                  <Icon name={k.icon} size={170} strokeWidth={1.5} className="tv-mode-watermark" />
                  <span className="tv-mode-badge">
                    <Icon name={k.icon} size={28} strokeWidth={2.2} />
                  </span>
                  <span className="tv-play-tile-text">
                    <span className="tv-mode-name">{k.name}</span>
                    <span className="tv-play-tile-blurb">{k.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div key={kind.id} className={`tv-room-row is-pick${out ? " is-out" : ""}`}>
            <ModeStage mode={kind}>
              <button
                type="button"
                className="tv-mstage-start tv-shine"
                data-sound={needsName ? undefined : "none"}
                onClick={() => run(mainAction)}
                disabled={busy || Boolean(pending)}
              >
                <Icon name="play" size={22} filled strokeWidth={1.5} />
                {mainLabel}
              </button>
            </ModeStage>

            <section className="tv-settings-card tv-settings-panel tv-play-opts" aria-labelledby="tv-play-opts-title">
              <div className="tv-settings-head">
                <h2 id="tv-play-opts-title" className="tv-settings-title">
                  {pending ? "¿Cómo te llamas?" : match ? "Ajustes" : "Tengo un código"}
                </h2>
              </div>

              {pending ? (
                <form key="name" className="tv-play-form" onSubmit={submitName}>
                  <div className="tv-name-row">
                    <Avatar name={name.trim() || "?"} avatar={color} className="tv-avatar--lg" />
                    <div className="tv-name-fields">
                      <label className="tv-sr-only" htmlFor="tv-play-name">
                        Tu nombre
                      </label>
                      <input
                        id="tv-play-name"
                        className="tv-field"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setError("");
                        }}
                        placeholder="Tu nombre o apodo"
                        onFocus={(e) => e.target.select()}
                        maxLength={20}
                        autoComplete="nickname"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="tv-swatches" role="group" aria-label="Color de tu avatar">
                    {AVATAR_COLORS.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        className="tv-swatch"
                        style={{ "--sw": c }}
                        aria-pressed={color === c}
                        aria-label={`Color ${i + 1}`}
                        onClick={() => setColor(c)}
                      />
                    ))}
                  </div>
                  <button type="submit" className={`tv-btn tv-btn--block tv-c-${kind.color}`} data-sound="none" disabled={busy || !name.trim()}>
                    {busy ? "Entrando…" : "Continuar"}
                  </button>
                  <div className="tv-sheet-account">
                    <span>Guarda tus puntos con una cuenta</span>
                    <span className="tv-sheet-account-links">
                      <Link to="/login" className="tv-sheet-account-btn is-main">
                        Crear cuenta
                      </Link>
                      <Link to="/login?mode=login" className="tv-sheet-account-btn">
                        Iniciar sesión
                      </Link>
                    </span>
                  </div>
                </form>
              ) : match ? (
                <div key="match" className="tv-play-form">
                  {/* First how many play: two big modes in the option's colour, the chosen one full and ticked. */}
                  <div className="tv-play-field">
                    <p className="tv-mono-label">Modo</p>
                    <div className="tv-play-modes" role="radiogroup" aria-label="Modo">
                      {MATCH_SIZES.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          role="radio"
                          aria-checked={size === o.value}
                          className={`tv-play-mode tv-c-${kind.color}${size === o.value ? " is-on" : ""}`}
                          onClick={() => setSize(o.value)}
                        >
                          <span className="tv-play-mode-icon">
                            <Icon name={o.icon} size={26} strokeWidth={2.4} />
                          </span>
                          <span className="tv-play-mode-text">
                            <strong>{o.label}</strong>
                            <span>{o.hint}</span>
                          </span>
                          <span className="tv-play-mode-tick" aria-hidden="true">
                            <Icon name="check" size={16} strokeWidth={3.4} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Then the length, smaller: it matters less. */}
                  <div className="tv-play-field tv-play-rounds">
                    <p className="tv-mono-label">Rondas</p>
                    <Segmented
                      label="Rondas"
                      value={rounds}
                      onChange={setRounds}
                      options={MATCH_ROUNDS.map((n) => ({ value: n, label: `${n} rondas · ${gamesText(n)}` }))}
                    />
                  </div>
                  {/* The games, going slowly past a marker: the same cards as the roulette that will pick them (MatchIntro). */}
                  <div className="tv-play-field">
                    <p className="tv-mono-label">La ruleta elige</p>
                    <SlowReel color={kind.color} />
                  </div>
                </div>
              ) : (
                <form key="code" className="tv-play-form" onSubmit={submitCode}>
                  <p className="tv-play-note">¿Un amigo ya creó la sala? Escribe su código de 5 letras.</p>
                  <label className="tv-sr-only" htmlFor="tv-play-code">
                    Código de sala
                  </label>
                  <input
                    ref={codeRef}
                    id="tv-play-code"
                    className="tv-field tv-field--code"
                    aria-invalid={Boolean(error) || undefined}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH));
                      setError("");
                    }}
                    placeholder="YOAVH"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck="false"
                  />
                  <button type="submit" className="tv-btn tv-btn--block tv-c-yellow" data-sound="none" disabled={busy || code.length < ROOM_CODE_LENGTH}>
                    Entrar a la sala
                  </button>
                </form>
              )}

              {error && (
                <p className="tv-sheet-error" role="alert">
                  {error}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
