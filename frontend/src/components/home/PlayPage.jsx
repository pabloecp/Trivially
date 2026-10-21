import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { findMode } from "../../modes/index.js";
import { useHiddenCode } from "../../lib/hiddenCode.js";
import { useFriends } from "../../lib/friends.jsx";
import { AVATAR_COLORS, savedGuest, useApp } from "../../lib/store.jsx";
import { withSound } from "../../lib/sounds.js";
import Avatar from "./Avatar.jsx";
import { JoinButton, statusOf } from "./FriendsSheet.jsx";
import Icon from "./Icon.jsx";
import Logo, { logoIncoming } from "./Logo.jsx";
import ModeStage from "./ModeStage.jsx";
import OptionRow from "./OptionRow.jsx";

import MatchGames from "./MatchGames.jsx";
import { MATCH_KINDS, MATCH_ROUNDS, MATCH_SIZES, gamesText } from "./matchInfo.js";
import "../../styles/match.css";

const ROOM_CODE_LENGTH = 5;
// The tiles sink away for this long before the chosen option's card comes in (and the card goes before the tiles come
// back), like "Elige el juego" in a room (TILES_OUT_MS in Home.jsx).
const OUT_MS = 320;
// Longer than the tiles' late way in when the logo jumps here (match.css, .is-landing), so taking the delay away
// afterwards changes nothing on screen.
const LANDING_MS = 1200;
// How many online friends "Invitar al crear la sala" offers.
const INVITES_SHOWN = 6;

// Casual and Competitivo say the same, but for their first line.
const MATCH_STEPS = [
  { icon: "users", text: "Duelo o todos contra todos" },
  { icon: "play", text: "Entra y juega en segundos" },
];

// The three ways to play, each with its big card (ModeStage: icon, name, how it goes).
const KINDS = [
  {
    ...MATCH_KINDS.casual,
    steps: [{ icon: "sun", text: "Juega por diversión, sin presión" }, ...MATCH_STEPS],
  },
  {
    ...MATCH_KINDS.competitivo,
    steps: [{ icon: "crown", text: "Cada victoria te sube de rango" }, ...MATCH_STEPS],
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

// A room's code out of what was typed or pasted: the code itself, or the invite link (/sala/CODE).
function codeFrom(text) {
  const link = String(text).match(/\/sala\/([A-Za-z0-9]{5})/);
  return (link ? link[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

// Inicio, "¿Cómo quieres jugar?": the big logo and Casual, Competitivo and Privada as big tiles, all on one page (/).
// Picking one (/jugar/casual, /jugar/privada...) makes the tiles sink away and that option's card grow in with its
// settings beside it, laid out like a room's screen; the top bar's "Volver" (the only way back) and the browser's Back
// do it the other way round. Leaving a room comes back to the option it came from (exitPath in TvTopbar.jsx). Without
// an account, the settings card asks for the name first (filled in with the one used last time), then does what was
// asked. Once in a room, RoomNavigator takes the player there. Privada's settings have "Amigos conectados" with the
// ones in a room to join with a tap. `toHome` is kept for the logo's old jump back to Inicio (Logo.jsx).
export default function PlayPage({ leaving = false, toHome = false }) {
  const { user, saveGuest, createRoom, joinRoom, checkRoom, findMatch } = useApp();
  const friends = useFriends();
  const nav = useNavigate();
  // The option comes from the address; `chosen` is the one on screen, which follows it once the old one has gone.
  const { option } = useParams();
  const wanted = KINDS.some((k) => k.id === option) ? option : null;
  const [chosen, setChosen] = useState(wanted);
  const [out, setOut] = useState(false);
  const [rounds, setRounds] = useState(MATCH_ROUNDS[0]);
  // Duelo and 5 rounds unless the player picks otherwise.
  const [size, setSize] = useState(MATCH_SIZES[0].value);
  const [code, setCode] = useState("");
  // Privada: the online friends to invite as soon as the room exists (the game is chosen inside, as always). Hiding the
  // code is this device's own setting (lib/hiddenCode.js), the room's column's "Ocultar".
  const [invites, setInvites] = useState([]);
  const [codeHidden, toggleCodeHidden] = useHiddenCode();
  const [pending, setPending] = useState(null); // what to do once there's a name
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const codeRef = useRef(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Coming from Inicio, its logo jumps here (Logo.jsx) and the tiles come up as it lands.
  const [landing, setLanding] = useState(logoIncoming);
  useEffect(() => {
    if (!landing) return undefined;
    const t = setTimeout(() => setLanding(false), LANDING_MS);
    return () => clearTimeout(t);
  }, []);

  const kind = KINDS.find((k) => k.id === chosen) || null;
  const needsName = !user?.name || user.isGuest;

  useEffect(() => {
    if (wanted === chosen) return;
    setError("");
    setNote("");
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
          ? createPrivate(action)
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

  // The room, then the invitations. The room exists once createRoom is done: an invitation that fails can still be
  // sent from there ("Invitar amigos").
  async function createPrivate(action) {
    await createRoom("multi", {}, null);
    if (!friends.isAccount) return;
    await Promise.all(action.invites.map((id) => friends.inviteFriend(id).catch(() => {})));
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

  // A friend's room: straight in, or asking its host (then the answer comes as a toast, lib/friends.jsx).
  async function joinFriend(friend) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const action = await withSound(() => friends.joinFriend(friend.id));
      if (action === "requested") {
        setNote(`Le pediste a ${friend.room?.hostName || "el anfitrión"} unirte. Esperando su respuesta…`);
        setBusy(false);
      }
    } catch (err) {
      if (err.offer) return;
      setError(err.message || "No pudimos entrar a la sala");
      setBusy(false);
    }
  }

  async function cancelJoin(friend) {
    try {
      await friends.cancelJoin(friend.id);
      setNote("");
    } catch (err) {
      setError(err.message || "No se pudo cancelar");
    }
  }

  const match = kind && kind.id !== "privada";
  const isAccount = friends.isAccount;
  const online = (friends.view?.friends || []).filter((f) => f.online);
  // The ticked friends still online.
  const invited = invites.filter((id) => online.slice(0, INVITES_SHOWN).some((f) => f.id === id));
  const mainLabel = match ? (busy ? "Buscando…" : "Buscar partida") : busy ? "Creando sala…" : "Crear sala";
  const mainAction = match
    ? { type: "match", kind: kind.id, rounds, size }
    : { type: "create", invites: invited };

  // Casual and Competitivo: everything in one view, looking like a game's settings: how many play, how long, and the
  // games a match can draw with their ways of playing (only to read).
  const matchContent = (
    <>
      <OptionRow
        label="Jugadores"
        options={MATCH_SIZES.map((o) => ({ value: o.value, label: `${o.label} · ${o.value}` }))}
        value={size}
        onChange={setSize}
      />
      <OptionRow
        label="Rondas"
        options={MATCH_ROUNDS.map((n) => ({ value: n, label: `${n} rondas · ${gamesText(n)}` }))}
        value={rounds}
        onChange={setRounds}
      />
      <MatchGames kind={kind?.id} />
    </>
  );

  // Privada: joining first (a code, or a friend's room when there is one), then the room "Crear sala" makes (its code
  // shown or hidden, the online friends to invite), all in one view, looking like a game's settings. Nothing about
  // friends when there's nothing to show: the column beside it has them.
  const privateContent = (
    <>
      {/* The first thing on the card and the most used: a bigger title, the code on a wide strip ringed in the option's
          colour, and "Entrar a la sala" under it, as wide. */}
      <form className="tv-optrow tv-play-join" onSubmit={submitCode}>
        <span className="tv-optrow-name">
          <label className="tv-optrow-label" htmlFor="tv-play-code">
            Unirme a una sala
          </label>
        </span>
        <div className="tv-optrow-opts tv-play-codestrip">
          {/* "Código de sala: Ocultar" covers the code being written too (dots), and its example, like the room's own code
              on screen. */}
          <input
            ref={codeRef}
            id="tv-play-code"
            type={codeHidden ? "password" : "text"}
            className="tv-play-codeinput"
            aria-invalid={Boolean(error) || undefined}
            value={code}
            onChange={(e) => {
              setCode(codeFrom(e.target.value));
              setError("");
            }}
            placeholder={codeHidden ? "•".repeat(ROOM_CODE_LENGTH) : "YOAVH"}
            autoComplete={codeHidden ? "one-time-code" : "off"}
            autoCapitalize="characters"
            spellCheck="false"
          />
        </div>
        <button type="submit" className={`tv-btn tv-btn--block tv-c-${kind?.color} tv-play-codego`} data-sound="none" disabled={busy || code.length < ROOM_CODE_LENGTH}>
          Entrar a la sala
        </button>
      </form>
      {/* Friends who are online, right here: the ones in a room can be joined with a tap (or asked, as the host
          allows), the rest are just there to invite once the room is made (below). */}
      {isAccount && (
        <div className="tv-optrow">
          <span className="tv-optrow-label">
            Amigos conectados
            {online.length > 0 && <span className="tv-play-online-count">{online.length}</span>}
          </span>
          {online.length ? (
            <ul className="tv-invite-friends-list tv-play-rooms">
              {online.map((f) => {
                const m = f.room ? findMode(f.room.game) : null;
                return (
                  <li key={f.id} className="tv-invite-friend">
                    <Avatar name={f.name} avatar={f.avatar} />
                    <span className="tv-invite-friend-text">
                      <strong>{f.name}</strong>
                      <small>{statusOf(f)}</small>
                    </span>
                    {m && (
                      <span className={`tv-badge tv-c-${m.color} tv-play-rooms-game`} aria-hidden="true">
                        <Icon name={m.icon} size={16} />
                      </span>
                    )}
                    {f.room && <JoinButton friend={f} onJoin={joinFriend} onCancel={cancelJoin} busy={busy} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tv-invite-friends-none">Ninguno de tus amigos está conectado ahora</p>
          )}
        </div>
      )}
      <OptionRow
        label="Código de sala"
        options={[
          { value: false, label: "Mostrar" },
          { value: true, label: "Ocultar" },
        ]}
        value={codeHidden}
        onChange={(v) => v !== codeHidden && toggleCodeHidden()}
      />
      {online.length > 0 && (
        <OptionRow
          label="Invitar al crear la sala"
          hint="Les llega la invitación en cuanto la crees"
          multi
          wrap
          options={online.slice(0, INVITES_SHOWN).map((f) => ({ value: f.id, label: f.name }))}
          value={invited}
          onChange={(id) => setInvites((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))}
          onSetAll={(list) => setInvites(list)}
        />
      )}
    </>
  );

  return (
    <div className={`tv-room tv-playpage${leaving ? " is-leaving" : ""}`}>
      <div className="tv-room-main">
        {!kind ? (
          <div className={`tv-play-menu${landing ? " is-landing" : ""}`}>
            <Logo className={`tv-play-logo${out || (leaving && !toHome) ? " is-leaving" : ""}`} quiet decorative tilt={6} />
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
                    onClick={() => nav(`/jugar/${k.id}`, { state: { from: "/" } })}
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
          </div>
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

            {/* The settings take the option's colour (the chosen tab's line, the chosen choices). */}
            <section className={`tv-settings-card tv-settings-panel tv-play-opts tv-c-${kind.color}`} aria-labelledby="tv-play-opts-title">
              <div className="tv-settings-head">
                <h2 id="tv-play-opts-title" className="tv-settings-title">
                  {pending ? "¿Cómo te llamas?" : "Ajustes"}
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
                <fieldset key={kind.id} className="tv-settings tv-play-form">
                  {matchContent}
                </fieldset>
              ) : (
                <fieldset key={kind.id} className="tv-settings tv-play-form">
                  {privateContent}
                </fieldset>
              )}

              {note && !error && <p className="tv-play-note">{note}</p>}
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
