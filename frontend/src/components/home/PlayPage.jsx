import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
import SettingsSection from "./SettingsSection.jsx";

import { MATCH_GAME_COUNT, MATCH_KINDS, MATCH_ROUNDS, MATCH_SIZES } from "./matchInfo.js";
import "../../styles/match.css";
import "../../styles/lobby.css";

const ROOM_CODE_LENGTH = 5;
// The tiles sink away for this long before the chosen option comes in (and it goes before the tiles come back), like
// "Elige el juego" in a room (TILES_OUT_MS in Home.jsx).
const OUT_MS = 320;
// Longer than the tiles' late way in when the logo jumps here (match.css, .is-landing), so taking the delay away
// afterwards changes nothing on screen.
const LANDING_MS = 1200;
// How many online friends "Invitar al crear la sala" offers.
const INVITES_SHOWN = 6;

// What each option's page shows (Pública's two kinds and Privada), each with its address (/jugar/casual...). `facts`
// are the steps on its big card.
const KINDS = [
  {
    ...MATCH_KINDS.casual,
    facts: MATCH_KINDS.casual.steps,
  },
  // Disabled for now: its tab shows, but can't be opened (and its address goes to Casual).
  {
    ...MATCH_KINDS.competitivo,
    disabled: true,
    blurb: "No disponible por ahora",
    facts: [],
  },
  {
    id: "privada",
    name: "Privada",
    color: "blue",
    icon: "lock",
    blurb: "Crea una sala o entra con un código",
    facts: [
      { icon: "grid", text: "Tú eliges el juego y sus ajustes" },
      { icon: "users", text: "Invita a tus amigos con el código" },
    ],
  },
];

// Pública's tabs, and the ones that can be opened.
const PUBLIC_KINDS = KINDS.filter((k) => k.id !== "privada");
const OPEN_KINDS = PUBLIC_KINDS.filter((k) => !k.disabled);
const pageOf = (kindId) => (kindId === "privada" ? "privada" : "publica");

// Pública opens on the tab it was left on last time (this device only).
const PUBLIC_KEY = "trivially_public_kind";
function lastPublicKind() {
  try {
    const saved = localStorage.getItem(PUBLIC_KEY);
    return OPEN_KINDS.some((k) => k.id === saved) ? saved : OPEN_KINDS[0].id;
  } catch {
    return OPEN_KINDS[0].id;
  }
}

// Inicio's two tiles: Pública (Casual and Competitivo inside, as tabs) and Privada.
const TILES = [
  {
    id: "publica",
    name: "Pública",
    color: "site",
    icon: "globe",
    blurb: "Partidas rápidas con gente de todas partes",
    path: () => `/jugar/${lastPublicKind()}`,
  },
  { ...KINDS[2], path: () => "/jugar/privada" },
];

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// A room's code out of what was typed or pasted: the code itself, or the invite link (/sala/CODE).
function codeFrom(text) {
  const link = String(text).match(/\/sala\/([A-Za-z0-9]{5})/);
  return (link ? link[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

// Inicio, "¿Cómo quieres jugar?": the big logo and Pública and Privada as big tiles, all on one page (/). Picking one
// makes the tiles sink away and that option come in, laid out like a game's lobby in a room: its big card in its colour
// (ModeStage: its name, how it goes and the main button, "Buscar partida" or "Crear sala") beside its "Ajustes".
// Pública is Casual and Competitivo (/jugar/casual; Competitivo is disabled for now: it can't be picked in "Tipo de
// partida" and /jugar/competitivo goes to Casual), with how many play; every match is two games, and a third when they
// end one each. Privada (/jugar/privada): the room "Crear sala" makes (its code shown or hidden, friends to invite), and
// joining another with a code or through the friends online. The top bar's "Volver" (the only way back) and the
// browser's Back go to Inicio. Leaving a room comes back to the option it came from (exitPath in TvTopbar.jsx). Without
// an account, the settings ask for the name first (filled in with the one used last time) and the card's button then
// does what was asked. Once in a room, RoomNavigator takes the player there.
// `toHome` is kept for the logo's old jump back to Inicio (Logo.jsx).
export default function PlayPage({ leaving = false, toHome = false }) {
  const { user, saveGuest, createRoom, joinRoom, checkRoom, findMatch } = useApp();
  const friends = useFriends();
  const nav = useNavigate();
  const location = useLocation();
  // The option comes from the address; `chosen` is the one on screen, which follows it once the old one has gone
  // (straight away between Pública's tabs).
  const { option } = useParams();
  const wanted = KINDS.some((k) => k.id === option && !k.disabled) ? option : null;
  // A disabled tab's address (an old link, the last tab used): Casual instead.
  useEffect(() => {
    if (KINDS.some((k) => k.id === option && k.disabled)) nav(`/jugar/${OPEN_KINDS[0].id}`, { replace: true, state: location.state });
  }, [option]);
  const [chosen, setChosen] = useState(wanted);
  const [out, setOut] = useState(false);
  // Duelo unless the player picks otherwise.
  const [size, setSize] = useState(MATCH_SIZES[0].value);
  const [code, setCode] = useState("");
  // Privada: the online friends to invite as soon as the room exists (the game is chosen inside, as always). Hiding the
  // code is this device's own setting (lib/hiddenCode.js), the room's column's "Ocultar".
  const [invites, setInvites] = useState([]);
  const [codeHidden, toggleCodeHidden] = useHiddenCode();
  const [codeFocus, setCodeFocus] = useState(false);
  const [pending, setPending] = useState(null); // what to do once there's a name
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  // What went wrong: on the ticket (searching, creating, the name), or by the code and the friends (joining).
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [note, setNote] = useState("");
  const codeRef = useRef(null);
  const settingsRef = useRef(null);
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
    if (wanted && wanted !== "privada") {
      try {
        localStorage.setItem(PUBLIC_KEY, wanted);
      } catch {}
    }
    if (wanted === chosen) return;
    setError("");
    setJoinError("");
    setNote("");
    setPending(null);
    // Another of Pública's tabs: the same page, no way out and in.
    if (reducedMotion() || (wanted && chosen && pageOf(wanted) === pageOf(chosen))) {
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

  // The name step is in the settings, which phones show under the card: bring it into sight.
  useEffect(() => {
    if (pending) settingsRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [pending]);

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
    setJoinError("");
    try {
      await withSound(() =>
        action.type === "create"
          ? createPrivate(action)
          : action.type === "match"
          ? findMatch(action.kind, action.size)
          : joinRoom(action.code)
      );
      // The room navigator takes the player wherever the room is.
    } catch (err) {
      // This account already plays in that room from another device: CentralOffer asks about this one instead.
      if (err.offer) return;
      const message = err.message || "Algo salió mal, inténtalo otra vez";
      if (action.type === "join") setJoinError(message);
      else setError(message);
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

  // The code is checked first, so a wrong one is said here; a wrong code shakes the cells each time.
  async function submitCode(e) {
    e.preventDefault();
    if (code.length < ROOM_CODE_LENGTH || busy) return;
    setBusy(true);
    try {
      await withSound(() => checkRoom(code), needsName ? "next" : null);
    } catch (err) {
      setJoinError(err.message || "No hay ninguna sala con ese código");
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
    setJoinError("");
    setNote("");
    try {
      const action = await withSound(() => friends.joinFriend(friend.id));
      if (action === "requested") {
        setNote(`Le pediste a ${friend.room?.hostName || "el anfitrión"} unirte. Esperando su respuesta…`);
        setBusy(false);
      }
    } catch (err) {
      if (err.offer) return;
      setJoinError(err.message || "No pudimos entrar a la sala");
      setBusy(false);
    }
  }

  async function cancelJoin(friend) {
    try {
      await friends.cancelJoin(friend.id);
      setNote("");
    } catch (err) {
      setJoinError(err.message || "No se pudo cancelar");
    }
  }

  const match = kind && kind.id !== "privada";
  const isAccount = friends.isAccount;
  const online = (friends.view?.friends || []).filter((f) => f.online);
  // The ticked friends still online.
  const invited = invites.filter((id) => online.slice(0, INVITES_SHOWN).some((f) => f.id === id));
  const mainLabel = pending
    ? busy
      ? "Entrando…"
      : "Continuar"
    : match
    ? busy
      ? "Buscando…"
      : "Buscar partida"
    : busy
    ? "Creando sala…"
    : "Crear sala";
  const mainAction = match ? { type: "match", kind: kind.id, size } : { type: "create", invites: invited };

  // The settings beside the option's card, like a game's "Ajustes". Casual: the kind of match (Competitivo can't be picked
  // for now) and how many play, then what the match will be.
  const matchSettings = (
    <>
      <OptionRow
        label="Tipo de partida"
        hint="Competitivo llegará pronto"
        options={PUBLIC_KINDS.map((k) => ({ value: k.id, label: k.name, disabled: k.disabled }))}
        value={kind?.id}
        onChange={(id) => id !== wanted && nav(`/jugar/${id}`, { replace: true, state: location.state })}
      />
      <OptionRow
        label="Jugadores"
        hint="Duelo es 1 contra 1; Todos contra todos, 5 jugadores"
        options={MATCH_SIZES.map((o) => ({ value: o.value, label: o.label }))}
        value={size}
        onChange={setSize}
      />
      <div className="tv-optrow">
        <span className="tv-optrow-label">Partida</span>
        <dl className="tv-play-fields">
          {/* Keyed by their value, so a number pops when it changes. */}
          <div>
            <dt>Jugadores</dt>
            <dd key={size}>{size}</dd>
          </div>
          <div>
            <dt>Juegos</dt>
            <dd>{MATCH_GAME_COUNT}</dd>
          </div>
          <div>
            <dt>Rondas</dt>
            <dd>{MATCH_ROUNDS}</dd>
          </div>
        </dl>
      </div>
    </>
  );

  // Privada: the room "Crear sala" makes (its code shown or hidden, friends to invite), then joining another one with a
  // code (five cells, the code or the invite link pasted) or through the friends online: the ones in a room can be
  // joined with a tap (or asked, as the host allows). Without an account, how to get them.
  const privateSettings = (
    <>
      <SettingsSection title="Sala nueva">
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
      </SettingsSection>

      <SettingsSection title="Unirse a una sala">
        <form className="tv-join" onSubmit={submitCode}>
          <span className="tv-optrow-label">Entra con un código</span>
          <div className="tv-join-row">
            <label className="tv-sr-only" htmlFor="tv-play-code">
              Código de sala
            </label>
            {/* One box under five cells: the cells show what's written (dots while "Ocultar" is on) and where the next
                letter goes. */}
            <div
              ref={codeRef}
              className={`tv-codecells${codeFocus ? " is-focus" : ""}`}
              aria-invalid={Boolean(joinError) || undefined}
            >
              <input
                id="tv-play-code"
                className="tv-codecells-input"
                value={code}
                onChange={(e) => {
                  setCode(codeFrom(e.target.value));
                  setJoinError("");
                }}
                onFocus={() => setCodeFocus(true)}
                onBlur={() => setCodeFocus(false)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
              />
              {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => (
                <span
                  key={i}
                  className={`tv-codecell${code[i] ? " is-filled" : ""}${i === Math.min(code.length, ROOM_CODE_LENGTH - 1) ? " is-next" : ""}`}
                  aria-hidden="true"
                >
                  {code[i] ? (codeHidden ? "•" : code[i]) : ""}
                </span>
              ))}
            </div>
            <button type="submit" className="tv-btn tv-c-blue tv-join-go" data-sound="none" disabled={busy || code.length < ROOM_CODE_LENGTH}>
              Entrar
              <Icon name="chevron" size={18} strokeWidth={3} />
            </button>
          </div>
          {joinError && (
            <p className="tv-sheet-error" role="alert">
              {joinError}
            </p>
          )}
          {note && !joinError && <p className="tv-play-note">{note}</p>}
        </form>

        <div className="tv-lobby-friends">
          <span className="tv-optrow-label">
            Amigos conectados
            {online.length > 0 && <span className="tv-play-online-count">{online.length}</span>}
          </span>
          {!isAccount ? (
            <div className="tv-lobby-empty">
              <Icon name="users" size={22} strokeWidth={2.4} />
              <p>Con una cuenta ves a tus amigos conectados y entras a sus salas con un toque.</p>
              <Link to="/login" className="tv-btn tv-btn--sm tv-c-violet">
                Crear cuenta
              </Link>
            </div>
          ) : online.length ? (
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
            <div className="tv-lobby-empty">
              <Icon name="users" size={22} strokeWidth={2.4} />
              <p>Ninguno de tus amigos está conectado ahora.</p>
            </div>
          )}
        </div>
      </SettingsSection>
    </>
  );

  // Without an account, the settings give way to the name first (filled in with the one used last time); the card's
  // button then says "Continuar" and does what was asked.
  const nameForm = (
    <form id="tv-play-name-form" className="tv-play-name" onSubmit={submitName}>
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
      <p className="tv-play-account">
        Guarda tus puntos con una cuenta: <Link to="/login">Crear cuenta</Link> · <Link to="/login?mode=login">Iniciar sesión</Link>
      </p>
      <button type="button" className="tv-optrow-action tv-play-name-back" onClick={() => setPending(null)}>
        Volver a los ajustes
      </button>
    </form>
  );

  // The main button: on the option's card, and on phones a bar of its own fixed at the bottom of the screen.
  const mainButton = (className) => (
    <button
      type={pending ? "submit" : "button"}
      form={pending ? "tv-play-name-form" : undefined}
      className={className}
      data-sound={needsName && !pending ? undefined : "none"}
      onClick={pending ? undefined : () => run(mainAction)}
      disabled={busy || (pending ? !name.trim() : false)}
    >
      {!pending && <Icon name={match ? "play" : "plus"} size={22} filled={Boolean(match)} strokeWidth={match ? 1.5 : 3} />}
      {mainLabel}
    </button>
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
                {TILES.map((k, i) => (
                  <button
                    key={k.id}
                    type="button"
                    className={`tv-mode tv-play-tile tv-c-${k.color}`}
                    style={{ "--i": i }}
                    onClick={() => nav(k.path(), { state: { from: "/" } })}
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
          // The option's page, laid out like a game's in a room: its big card in its colour (what it is, how it goes and
          // the main button) beside its settings.
          <div key={pageOf(kind.id)} className={`tv-room-row tv-play-row tv-c-${kind.color}${out ? " is-out" : ""}`}>
            <ModeStage mode={{ name: kind.name, icon: kind.icon, color: kind.color, steps: kind.facts }}>
              {error && (
                <p className="tv-lobby-error" role="alert">
                  {error}
                </p>
              )}
              {mainButton("tv-mstage-start tv-shine tv-play-start")}
            </ModeStage>

            <section ref={settingsRef} className="tv-settings-card tv-settings-panel" aria-labelledby="tv-settings-title">
              <div className="tv-settings-head">
                <h2 id="tv-settings-title" className="tv-settings-title">
                  {pending ? "¿Cómo te llamas?" : "Ajustes"}
                </h2>
              </div>
              <div key={pending ? "name" : "settings"} className="tv-play-settings">
                {pending ? nameForm : match ? matchSettings : privateSettings}
              </div>
            </section>

            <div className="tv-play-cta">
              {error && (
                <p className="tv-lobby-error" role="alert">
                  {error}
                </p>
              )}
              {mainButton("tv-btn tv-btn--block tv-lobby-go tv-shine")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
