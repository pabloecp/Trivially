import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { GAME_MODES, findMode, isGameTile } from "../../modes/index.js";
import { useHiddenCode } from "../../lib/hiddenCode.js";
import { useFriends } from "../../lib/friends.jsx";
import { useMatchVotes, voteSlots } from "../../lib/matchVotes.js";
import { AVATAR_COLORS, savedGuest, useApp } from "../../lib/store.jsx";
import { withSound } from "../../lib/sounds.js";
import Avatar from "./Avatar.jsx";
import { JoinButton, statusOf } from "./FriendsSheet.jsx";
import Icon from "./Icon.jsx";
import Logo, { logoIncoming } from "./Logo.jsx";
import OptionRow from "./OptionRow.jsx";
import { RankCard } from "./PlaySide.jsx";
import VoteBoard, { VoteTokens } from "./VoteBoard.jsx";

import { MATCH_KINDS, MATCH_ROUNDS, MATCH_SIZES, gamesText } from "./matchInfo.js";
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

// What each option's page shows (Pública's two tabs and Privada), each with its address (/jugar/casual...). `kicker`
// and `facts` are its ticket's (the card with the main button).
const KINDS = [
  {
    ...MATCH_KINDS.casual,
    kicker: "Partida pública",
    facts: [
      { icon: "sun", text: "Sin presión: no cuenta para tu rango" },
      { icon: "play", text: "Entra y juega en segundos" },
    ],
  },
  {
    ...MATCH_KINDS.competitivo,
    kicker: "Partida pública",
    facts: [{ icon: "crown", text: "Cada victoria te sube de rango" }],
  },
  {
    id: "privada",
    name: "Privada",
    color: "blue",
    icon: "lock",
    blurb: "Crea una sala o entra con un código",
    kicker: "Sala privada",
    facts: [
      { icon: "grid", text: "Tú eliges el juego y sus ajustes" },
      { icon: "users", text: "Invita a tus amigos con el código" },
    ],
  },
];

// Pública's tabs.
const PUBLIC_KINDS = KINDS.filter((k) => k.id !== "privada");
const pageOf = (kindId) => (kindId === "privada" ? "privada" : "publica");

// Pública opens on the tab it was left on last time (this device only).
const PUBLIC_KEY = "trivially_public_kind";
function lastPublicKind() {
  try {
    const saved = localStorage.getItem(PUBLIC_KEY);
    return PUBLIC_KINDS.some((k) => k.id === saved) ? saved : PUBLIC_KINDS[0].id;
  } catch {
    return PUBLIC_KINDS[0].id;
  }
}

// Inicio's two tiles: Pública (Casual and Competitivo inside, as tabs) and Privada.
const TILES = [
  {
    id: "publica",
    name: "Pública",
    color: "site",
    icon: "globe",
    blurb: "Casual o competitiva, con gente de todas partes",
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
// makes the tiles sink away and that option come in: its own panel beside its ticket, a narrower card in its colour
// with what kind of match it is and the main button ("Buscar partida", "Crear sala").
// The ticket is on the left, the tabs and the panel on the right.
// Pública is Casual and Competitivo, as two tabs at the top (/jugar/casual, /jugar/competitivo: switching replaces the
// address, so "Volver" still goes to Inicio, and the page stays: only its colour and its ticket change). Both have how
// many play (two big buttons) and how long on the panel, then "Elegir juegos (opcional)" (VoteBoard, folded away; one set
// of votes per format, lib/matchVotes.js); the ticket sums it up, votes included and, in Competitivo, has the rank. Privada (/jugar/privada): joining with a code
// and the friends online on the panel, the room "Crear sala" makes (its code shown or hidden, friends to invite) on the
// ticket. The top bar's "Volver" (the only way back) and the browser's Back go to Inicio. Leaving a room comes back to
// the option it came from (exitPath in TvTopbar.jsx). Without an account, the ticket asks for the name first (filled in
// with the one used last time), then does what was asked. Once in a room, RoomNavigator takes the player there.
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
  // Duelo and 1 juego unless the player picks otherwise.
  const [rounds, setRounds] = useState(MATCH_ROUNDS[0]);
  const [size, setSize] = useState(MATCH_SIZES[0].value);
  const votes = useMatchVotes(size, rounds);
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
  const ticketRef = useRef(null);
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

  // The name step is on the ticket, which phones show last: bring it into sight.
  useEffect(() => {
    if (pending) ticketRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
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
          ? findMatch(action.kind, action.rounds, action.size, action.votes)
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
  const games = voteSlots(rounds);
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
  const mainAction = match ? { type: "match", kind: kind.id, rounds, size, votes: votes.votes } : { type: "create", invites: invited };

  // Casual and Competitivo: how many play and how long, then the votes.
  const matchPanel = (
    <>
      <div className="tv-lobby-format">
        <SizePick value={size} onChange={setSize} />
        <FormatPick
          label="Duración"
          blocks
          options={MATCH_ROUNDS.map((n) => ({ value: n, label: gamesText(n), hint: `${n} rondas`, pips: voteSlots(n) }))}
          value={rounds}
          onChange={setRounds}
        />
      </div>
      <VoteBoard votes={votes} />
    </>
  );

  // Privada: joining with a code (five cells, the code or the invite link pasted), then the friends online: the ones in
  // a room can be joined with a tap (or asked, as the host allows). Without an account, how to get them.
  const privatePanel = (
    <>
      <form className="tv-join" onSubmit={submitCode}>
        <span className="tv-join-text">
          <h2 className="tv-lobby-title">Entra con un código</h2>
          <p className="tv-lobby-sub">Escribe el código de la sala o pega el enlace que te mandaron</p>
        </span>
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
        <span className="tv-lobby-label">
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

      {/* What a room can play, only to read: the game is chosen inside. */}
      <div className="tv-lobby-games">
        <span className="tv-lobby-label">Juegos de las salas privadas</span>
        <ul className="tv-lobby-gamechips">
          {GAME_MODES.filter(isGameTile).map((m) => (
            <li key={m.id} className={`tv-lobby-gamechip tv-c-${m.color}`}>
              <span className="tv-lobby-gamechip-icon" aria-hidden="true">
                <Icon name={m.icon} size={20} strokeWidth={2.4} />
              </span>
              {m.name}
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  // The ticket under its stub: the name first when it's missing; otherwise what this match is (Casual, Competitivo) or
  // the room "Crear sala" makes (Privada). Nothing on Inicio.
  const ticketBody = !kind ? null : pending ? (
    <form id="tv-play-name-form" className="tv-ticket-form" onSubmit={submitName}>
      <span className="tv-lobby-label">¿Cómo te llamas?</span>
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
      <p className="tv-ticket-account">
        Guarda tus puntos con una cuenta: <Link to="/login">Crear cuenta</Link> · <Link to="/login?mode=login">Iniciar sesión</Link>
      </p>
    </form>
  ) : match ? (
    <>
      <dl className="tv-ticket-fields">
        {/* Keyed by their value, so a number pops when it changes. */}
        <div>
          <dt>Jugadores</dt>
          <dd key={size}>{size}</dd>
        </div>
        <div>
          <dt>Juegos</dt>
          <dd key={games}>{games}</dd>
        </div>
        <div>
          <dt>Rondas</dt>
          <dd key={rounds}>{rounds}</dd>
        </div>
      </dl>
      {/* Both tabs' parts are always drawn, one over the other, and only the chosen one shows: the ticket is as tall as
          the taller of them, so switching tab never makes it grow or shrink. */}
      <div className="tv-ticket-layers">
        {PUBLIC_KINDS.map((k) => {
          const active = k.id === kind.id;
          return (
            <div key={`${k.id}-${active}`} className={`tv-ticket-layer${active ? "" : " is-off"}`} aria-hidden={!active || undefined} inert={active ? undefined : ""}>
              {k.id === "competitivo" &&
                (isAccount ? (
                  <RankCard rank={user?.rank} card />
                ) : (
                  <p className="tv-ticket-guest">
                    Juegas como invitado: tu rango no se guarda. <Link to="/login">Crear cuenta</Link>
                  </p>
                ))}
              <TicketFacts facts={k.facts} />
            </div>
          );
        })}
      </div>
      <VoteTokens votes={votes} />
    </>
  ) : (
    <>
      <TicketFacts facts={kind.facts} />
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
          <div className="tv-lobby">
            <div key={pageOf(kind.id)} className={`tv-lobby-row tv-c-${kind.color}${match ? " has-tabs" : ""}${out ? " is-out" : ""}`}>
              {/* Pública's two tabs, Casual and Competitivo: a selector, the chosen one on a lighter pill that slides to
                  it; each with its icon in its colour, its name and what it is. */}
              {match && (
                <nav className="tv-lobby-tabs" aria-label="Tipo de partida pública">
                  {PUBLIC_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={`tv-lobby-tab tv-c-${k.color}`}
                      aria-current={k.id === kind.id ? "page" : undefined}
                      onClick={() => k.id !== wanted && nav(`/jugar/${k.id}`, { replace: true, state: location.state })}
                    >
                      <span className="tv-lobby-tab-badge" aria-hidden="true">
                        <Icon name={k.icon} size={22} strokeWidth={2.4} />
                      </span>
                      <span className="tv-lobby-tab-text">
                        <strong>{k.name}</strong>
                        <small>{k.blurb}</small>
                      </span>
                      <Icon name={k.icon} size={96} strokeWidth={1.6} className="tv-lobby-tab-mark" />
                    </button>
                  ))}
                </nav>
              )}
              <section className="tv-lobby-panel" aria-label={match ? "Partida" : "Unirme a una sala"}>
                {match ? matchPanel : privatePanel}
              </section>

              {/* The ticket: the option's stub in its colour, a perforated line, what the match or room will be, and
                  (a separate piece, so it can stay in sight on phones) the main button. */}
              <aside ref={ticketRef} className={`tv-ticket tv-c-${kind.color}`} aria-labelledby="tv-ticket-name">
                <div className="tv-ticket-stub">
                  <span className="tv-ticket-top">
                    <span className="tv-ticket-kicker">{kind.kicker}</span>
                    <span className="tv-ticket-badge tv-rise" key={kind.id} aria-hidden="true">
                      <Icon name={kind.icon} size={26} strokeWidth={2.4} />
                    </span>
                  </span>
                  <h1 id="tv-ticket-name" key={kind.id} className="tv-ticket-name tv-rise">
                    {kind.name}
                  </h1>
                  <p className="tv-ticket-blurb">{kind.blurb}</p>
                </div>
                <div className="tv-ticket-body">
                  {ticketBody}
                  {error && (
                    <p className="tv-sheet-error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              </aside>
              <div className={`tv-ticket-cta tv-c-${kind.color}`}>
                <button
                  type={pending ? "submit" : "button"}
                  form={pending ? "tv-play-name-form" : undefined}
                  className="tv-btn tv-btn--block tv-lobby-go tv-shine"
                  data-sound={needsName && !pending ? undefined : "none"}
                  onClick={pending ? undefined : () => run(mainAction)}
                  disabled={busy || (pending ? !name.trim() : false)}
                >
                  {!pending && <Icon name={match ? "play" : "plus"} size={26} filled={Boolean(match)} strokeWidth={match ? 1.5 : 3} />}
                  {mainLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// "Jugadores", the first choice and the one that stands out: Duelo and Todos contra todos as two real buttons, each with
// its icon on a square of its own (like the game tiles). The chosen one takes the option's colour, its icon's square
// turning white.
function SizePick({ value, onChange }) {
  return (
    <div className="tv-lobby-pick" role="radiogroup" aria-label="Jugadores">
      <span className="tv-lobby-label">Jugadores</span>
      <div className="tv-lobby-size">
        {MATCH_SIZES.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="tv-lobby-size-btn" onClick={() => onChange(o.value)}>
            <span className="tv-lobby-size-badge" aria-hidden="true">
              <Icon name={o.icon} size={30} strokeWidth={2.4} />
            </span>
            <span className="tv-lobby-pick-text">
              <strong>{o.label}</strong>
              <small>{o.value === 2 ? "1 contra 1" : o.hint}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// "Duración": its two choices side by side, right under the players' two buttons and just like them (the same buttons,
// the same size), each with how many games it means drawn as blocks on its square.
function FormatPick({ label, options, value, onChange, blocks = false }) {
  return (
    <div className="tv-lobby-pick" role="radiogroup" aria-label={label}>
      <span className="tv-lobby-label">{label}</span>
      <div className="tv-lobby-size">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="tv-lobby-size-btn" onClick={() => onChange(o.value)}>
            <span className="tv-lobby-size-badge" aria-hidden="true">
              <span className={`tv-pips${blocks ? " is-blocks" : ""}`}>
                {Array.from({ length: o.pips }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            </span>
            <span className="tv-lobby-pick-text">
              <strong>{o.label}</strong>
              <small>{o.hint}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TicketFacts({ facts }) {
  return (
    <ul className="tv-ticket-facts">
      {facts.map((f, i) => (
        <li key={f.text} className="tv-rise" style={{ "--i": i }}>
          <Icon name={f.icon} size={20} strokeWidth={2.4} />
          {f.text}
        </li>
      ))}
    </ul>
  );
}
