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
import { RankCard } from "./PlaySide.jsx";
import OptionRow from "./OptionRow.jsx";

import { MATCH_GAME_COUNT, MATCH_KINDS, MATCH_ROUNDS, MATCH_SIZES, sizeName } from "./matchInfo.js";
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
  // Not playable yet (`soon`): it can be picked to see it, but its button says "Próximamente" (the server refuses it too).
  {
    ...MATCH_KINDS.competitivo,
    soon: true,
    facts: MATCH_KINDS.competitivo.steps,
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
      { icon: "crown", text: "Eres el anfitrión de la sala" },
    ],
  },
];

// Privada's other way in, "Unirme": its steps on the card instead of creating a room's.
const JOIN_FACTS = [
  { icon: "hash", text: "Pide el código a quien creó la sala" },
  { icon: "link", text: "Escríbelo o pega el enlace que te mandaron" },
  { icon: "play", text: "Entra y juega con ellos" },
];

// Pública's two kinds; its tile opens the first one that can be played unless another was used last.
const PUBLIC_KINDS = KINDS.filter((k) => k.id !== "privada");
const OPEN_KINDS = PUBLIC_KINDS.filter((k) => !k.soon);
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
// Pública is Casual and Competitivo (/jugar/casual, /jugar/competitivo), picked as big cards with their logo beside the
// card ("Elige tu partida"; switching swaps the card with a sweep of light), with how many play; every match is two
// games, and a third when they end one each. Competitivo can be looked at but not searched for yet ("Próximamente"). Privada (/jugar/privada), the
// same way: "Crear sala" or "Unirme" as big cards (the card on the left swapping), then the room "Crear sala" makes (its
// code shown or hidden, friends to invite), or joining another with a code or through the friends online. The top bar's "Volver" (the only way back) and the
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
  const wanted = KINDS.some((k) => k.id === option) ? option : null;
  const [chosen, setChosen] = useState(wanted);
  const [out, setOut] = useState(false);
  // Uno contra Uno unless the player picks otherwise; Privada starts on creating a room.
  const [size, setSize] = useState(MATCH_SIZES[0].value);
  const [privMode, setPrivMode] = useState("crear");
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
  async function joinWithCode() {
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
  // Privada: creating a room, or joining one ("Unirme") with a code or through a friend.
  const joining = Boolean(kind) && !match && privMode === "unirme";
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
    : joining
    ? busy
      ? "Entrando…"
      : "Entrar a la sala"
    : busy
    ? "Creando sala…"
    : "Crear sala";
  const mainAction = match ? { type: "match", kind: kind.id, size } : { type: "create", invites: invited };
  // Competitivo can be looked at, not searched for yet.
  const soon = Boolean(kind?.soon) && !pending;

  // Beside the option's card, what makes the match, as big cards with their logo rather than plain settings: the kind
  // (switching it swaps the card on the left, ModeStage's `swapKey`) and how many play, then
  // what the match will be.
  const matchSettings = (
    <>
      <BigChoice
        label="Tipo de partida"
        value={kind?.id}
        onChange={(id) => id !== wanted && nav(`/jugar/${id}`, { replace: true, state: location.state })}
        options={PUBLIC_KINDS.map((k) => ({
          value: k.id,
          color: k.color,
          icon: k.icon,
          label: k.name,
          hint: k.blurb,
          tag: k.soon ? "Pronto" : null,
        }))}
      />
      <BigChoice
        label="Jugadores"
        value={size}
        onChange={setSize}
        options={MATCH_SIZES.map((o) => ({
          value: o.value,
          color: kind?.color,
          icon: o.icon,
          label: o.label,
          hint: o.hint,
        }))}
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
      {/* Competitivo: the account's rank under the match (it moves with each competitive match). Without an account,
          a quiet note on how to get one instead, like Adivina la canción's (Casual's says what it keeps). */}
      {kind?.id === "competitivo" && isAccount && (
        <div key="rank" className="tv-optrow tv-play-rankrow">
          <span className="tv-optrow-label">Tu rango</span>
          <div className="tv-play-rankbox">
            <RankCard rank={user?.rank} />
          </div>
        </div>
      )}
      {!isAccount && <AccountNote>{kind?.id === "competitivo" ? "para tener rango y subirlo con cada victoria." : "para guardar tus puntos y estadísticas."}</AccountNote>}
    </>
  );

  // Privada, like Casual: first what to do, as big cards (switching swaps the card on the left), then only what that
  // needs, in the middle of the panel. Creating: the code shown or hidden, and friends online to invite. Joining: the
  // code (five cells, the code or the invite link pasted; the card's button enters) and the friends online, the ones in
  // a room joined with a tap (or asked, as the host allows). Without an account, a quiet note on how to get one.
  const privateSettings = (
    <>
      <BigChoice
        label="¿Qué quieres hacer?"
        value={privMode}
        onChange={(v) => {
          setPrivMode(v);
          setJoinError("");
          setError("");
        }}
        options={[
          { value: "crear", color: kind?.color, icon: "plus", label: "Crear sala", hint: "Tú eliges el juego" },
          { value: "unirme", color: kind?.color, icon: "hash", label: "Unirme", hint: "Con el código de un amigo" },
        ]}
      />
      <div key={privMode} className="tv-play-mode">
        {privMode === "crear" ? (
          <>
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
            {!isAccount && <AccountNote>para invitar a tus amigos al crearla.</AccountNote>}
          </>
        ) : (
          <>
            <form
              className="tv-join"
              onSubmit={(e) => {
                e.preventDefault();
                joinWithCode();
              }}
            >
              <span className="tv-optrow-label">Código de sala</span>
              <label className="tv-sr-only" htmlFor="tv-play-code">
                Código de sala
              </label>
              {/* One box under five cells: the cells show what's written (dots while "Ocultar" is on) and where the
                  next letter goes. */}
              <div ref={codeRef} className={`tv-codecells${codeFocus ? " is-focus" : ""}`} aria-invalid={Boolean(joinError) || undefined}>
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
                  autoFocus
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
                <AccountNote>para ver a tus amigos conectados y entrar a sus salas con un toque.</AccountNote>
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
          </>
        )}
      </div>
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
      <AccountNote>para guardar tus puntos.</AccountNote>
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
      className={`${className}${soon ? " is-soon" : ""}`}
      data-sound={needsName && !pending ? undefined : "none"}
      onClick={pending ? undefined : joining ? joinWithCode : () => run(mainAction)}
      disabled={busy || soon || (pending ? !name.trim() : joining && code.length < ROOM_CODE_LENGTH)}
    >
      {!pending && (
        <Icon
          name={soon ? "lock" : match ? "play" : joining ? "chevron" : "plus"}
          size={22}
          filled={Boolean(match) && !soon}
          strokeWidth={soon ? 2.6 : match ? 1.5 : 3}
        />
      )}
      {soon ? "Próximamente" : mainLabel}
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
          <div key={pageOf(kind.id)} className={`tv-room-row tv-play-row tv-c-${kind.color}${match ? "" : " is-private"}${out ? " is-out" : ""}`}>
            <ModeStage
              mode={{ name: kind.name, icon: joining ? "hash" : kind.icon, color: kind.color, steps: joining ? JOIN_FACTS : kind.facts }}
              swapKey={match ? kind.id : privMode}
              extra={
                match ? (
                  <span key={size} className="tv-mstage-chip">
                    <Icon name={size === 2 ? "user" : "users"} size={18} strokeWidth={2.6} />
                    {sizeName(size)}
                  </span>
                ) : (
                  <span key={privMode} className="tv-mstage-chip">
                    <Icon name={joining ? "hash" : "plus"} size={18} strokeWidth={2.6} />
                    {joining ? "Unirme a una sala" : "Sala nueva"}
                  </span>
                )
              }
            >
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
                  {pending ? "¿Cómo te llamas?" : match ? "Elige tu partida" : "Elige tu sala"}
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

// A choice that matters, not a plain setting: big cards side by side, each a real button (its edge under it) with its
// logo on a square, its name and a line under it. The chosen one fills with
// its colour, its logo's square turning white; its logo pops in each time it's chosen.
function BigChoice({ label, options, value, onChange }) {
  return (
    <div className="tv-bigpick" role="radiogroup" aria-label={label}>
      <span className="tv-optrow-label">{label}</span>
      <div className="tv-bigpick-row">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              className={`tv-bigpick-card tv-c-${o.color}`}
              onClick={() => !on && onChange(o.value)}
            >
              <span key={on ? "on" : "off"} className="tv-bigpick-logo" aria-hidden="true">
                <Icon name={o.icon} size={30} strokeWidth={2.4} />
              </span>
              <span className="tv-bigpick-text">
                <strong>{o.label}</strong>
                <small>{o.hint}</small>
              </span>
              {o.tag && <span className="tv-bigpick-tag">{o.tag}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Without an account: how to get one, quietly, like Adivina la canción's note (an ⓘ and one text, "Crear cuenta o
// Iniciar sesión" as its links, then what for), in the option's colour.
function AccountNote({ children }) {
  return (
    <p className="tv-play-account-note">
      <Icon name="info" size={16} strokeWidth={2.6} />
      <span>
        <Link to="/login">Crear cuenta</Link> o <Link to="/login?mode=login">Iniciar sesión</Link> {children}
      </span>
    </p>
  );
}
