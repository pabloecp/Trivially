import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { useFriends } from "../lib/friends.jsx";
import { GAME_MODES, SOON_TILE, findMode } from "../modes/index.js";
import Icon from "../components/home/Icon.jsx";
import TvTopbar from "../components/home/TvTopbar.jsx";
import HowToPlay from "../components/home/HowToPlay.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import CentralLobby from "../components/home/CentralLobby.jsx";
import MatchIntro from "../components/home/MatchIntro.jsx";
import MatchLobby from "../components/home/MatchLobby.jsx";
import PartyPanel from "../components/home/PartyPanel.jsx";
import PlayPage from "../components/home/PlayPage.jsx";
import PlaySheet from "../components/home/PlaySheet.jsx";
import { RoomDock, RoomHeader } from "../components/home/RoomBars.jsx";
import Wordmark from "../components/home/Wordmark.jsx";
import "../styles/home.css";
import { resolveCode } from "../lib/hiddenCode.js";

// A game tile of "Elige el juego", filled with the game's colour. The main game's is as wide as two. The grey
// "Más juegos pronto" tile (SOON_TILE) looks like one, with a lock, and has no "Pronto" tag of its own.
// `watched`: the host is pointing at it right now (guests see it live). `onPoint` tells the room which tile the host
// is on (hover, focus or touch).
function ModeTile({ mode, index, selected, watched, suggestable, onPick, onPoint }) {
  const main = mode.kind === "main";
  return (
    <button
      type="button"
      className={`tv-mode tv-c-${mode.color}${main ? " is-main" : ""}${mode.available ? "" : " is-soon"}${selected ? " is-selected" : ""}${watched ? " is-watched" : ""}`}
      onPointerEnter={onPoint && mode.available ? () => onPoint(mode.id) : undefined}
      onPointerDown={onPoint && mode.available ? () => onPoint(mode.id) : undefined}
      onFocus={onPoint && mode.available ? () => onPoint(mode.id) : undefined}
      aria-pressed={mode.placeholder ? undefined : selected}
      style={{ "--i": index }}
      aria-disabled={mode.available ? undefined : "true"}
      onClick={(e) => onPick(mode, e.currentTarget)}
    >
      <Icon name={mode.icon} size={150} strokeWidth={1.5} className="tv-mode-watermark" />
      <span className="tv-mode-badge">
        <Icon name={mode.icon} size={28} strokeWidth={2.2} />
      </span>
      {!mode.available && !mode.placeholder && (
        <span className="tv-mode-soon">
          <Icon name="lock" size={12} strokeWidth={3} />
          Pronto
        </span>
      )}
      {suggestable && mode.available && !watched && (
        <span className="tv-mode-suggest">
          <Icon name="bulb" size={13} strokeWidth={2.4} />
          Sugerir
        </span>
      )}
      {watched && (
        <span className="tv-mode-eye" aria-label="El anfitrión lo está viendo">
          <Icon name="crown" size={13} strokeWidth={2.4} filled />
          <span className="tv-mode-eye-text">Lo está viendo</span>
        </span>
      )}
      <span className="tv-mode-name">{mode.name}</span>
    </button>
  );
}

// "Crear una playlist", under the games. A playlist isn't one more game but several of them in a row, so it isn't a
// tile: a dark bar with a dashed outline and a small stack of the games' colours (styles/playlist.css). It points and
// picks like a tile (`mode` is its entry of GAME_MODES): guests see when the host is on it, and can suggest it.
function PlaylistEntry({ mode, selected, watched, suggestable, onPick, onPoint }) {
  const point = onPoint ? () => onPoint(mode.id) : undefined;
  return (
    <button
      type="button"
      className={`tv-pl-entry${selected ? " is-selected" : ""}${watched ? " is-watched" : ""}`}
      onPointerEnter={point}
      onPointerDown={point}
      onFocus={point}
      aria-pressed={selected}
      onClick={(e) => onPick(mode, e.currentTarget)}
    >
      <span className="tv-pl-entry-stack" aria-hidden="true">
        {GAME_MODES.filter((m) => m.kind !== "playlist").map((m, i) => (
          <span key={m.id} className={`tv-c-${m.color}`} style={{ "--i": i }}>
            <Icon name={m.icon} size={15} strokeWidth={2.6} />
          </span>
        ))}
      </span>
      <span className="tv-pl-entry-text">
        <span className="tv-pl-entry-title">Crear una playlist</span>
        <span className="tv-pl-entry-sub">Varios juegos seguidos, cada uno con sus ajustes</span>
      </span>
      {watched ? (
        <span className="tv-pl-entry-tag is-watched" aria-label="El anfitrión lo está viendo">
          <Icon name="crown" size={13} strokeWidth={2.4} filled />
          <span className="tv-pl-entry-tag-text">Lo está viendo</span>
        </span>
      ) : suggestable ? (
        <span className="tv-pl-entry-tag">
          <Icon name="bulb" size={13} strokeWidth={2.4} />
          <span className="tv-pl-entry-tag-text">Sugerir</span>
        </span>
      ) : (
        <Icon name="chevron" size={22} strokeWidth={3} className="tv-pl-entry-arrow" />
      )}
    </button>
  );
}

// How a choice of the menu reads in a sentence: "Trivia", or "una playlist" (it isn't a game).
const choiceName = (mode) => (mode?.kind === "playlist" ? "una playlist" : mode?.name || "un juego");

function shake(tile) {
  tile.classList.remove("is-shaking");
  void tile.getBoundingClientRect(); // restart the shake animation
  tile.classList.add("is-shaking");
}

// How long a screen takes to leave before the next one comes in: the room (its panels sink and slide off) before the
// home screen, and the home screen (a quick fade, behind the sheet that is closing) before the room; and how long the
// game tiles take to go after a pick, before the game's panel comes in. All match the exit animations in home.css.
const SCREEN_OUT_MS = 360;
const HOME_OUT_MS = 180;
const TILES_OUT_MS = 320;

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Home() {
  const { user, room, isCentral, joinRoom, setGame, previewGame, suggestGame, kickedNotice, setKickedNotice } = useApp();
  const { code: inviteParam } = useParams();
  // An address with "oculta" (the code hidden, lib/hiddenCode.js) is this tab's room.
  const inviteCode = resolveCode(inviteParam, room)?.toUpperCase();
  const nav = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState(null);
  const [sheetJoinCode, setSheetJoinCode] = useState(null);
  const [toast, setToast] = useState(null);
  const playRef = useRef(null);
  const toastTimer = useRef(0);

  // The room's central device is never the host, even with the host's account: it only shows the room.
  const isHost = Boolean(room) && room.hostId === user?.id && !isCentral;
  const hasRoom = Boolean(room);
  const game = room?.game ?? null;

  // Home ↔ room: the screen on show leaves first (home fades away, the room's cards sink and slide off), then the
  // other one comes in. While the room leaves, it keeps showing the room as it last was.
  const lastRoom = useRef(room);
  if (room) lastRoom.current = room;
  const [screen, setScreen] = useState(hasRoom ? "room" : "home");
  const [leaving, setLeaving] = useState(false);
  // How the screen on show came in: "intro" (first load), "fwd" (into the room) or "back" (back home).
  const [entry, setEntry] = useState("intro");
  useEffect(() => {
    const want = hasRoom ? "room" : "home";
    if (want === screen) {
      setLeaving(false);
      return undefined;
    }
    const swap = () => {
      setScreen(want);
      setEntry(want === "room" ? "fwd" : "back");
      setLeaving(false);
    };
    if (reducedMotion()) {
      swap();
      return undefined;
    }
    setLeaving(true);
    const t = setTimeout(swap, want === "room" ? HOME_OUT_MS : SCREEN_OUT_MS);
    return () => clearTimeout(t);
  }, [hasRoom]);
  const shownRoom = screen === "room" ? room || lastRoom.current : null;
  // "¿Cómo quieres jugar?" is a page of its own (/jugar, PlayPage). While Home gives way to the room it keeps showing
  // it (the address is already the room's).
  const { pathname } = useLocation();
  const onPlayPath = pathname === "/jugar" || pathname.startsWith("/jugar/");
  const playShown = useRef(onPlayPath);
  // Back from /jugar to Inicio, its panels sink first (`playOut`, SCREEN_OUT_MS), the way they came up; then Inicio.
  // Coming back from a room, the page shown is just the address's (no exit to play).
  const [playOut, setPlayOut] = useState(false);
  const lastScreen = useRef(screen);
  if (screen === "home" && !leaving) {
    if (lastScreen.current !== "home" || onPlayPath) playShown.current = onPlayPath;
  }
  lastScreen.current = screen;
  useEffect(() => {
    // Anything but /jugar → Inicio (going into a room, whose address can change a moment before the room arrives, or
    // coming back to /jugar) clears it, so the page never stays sunk.
    if (screen !== "home" || leaving || onPlayPath || !playShown.current) {
      setPlayOut(false);
      return undefined;
    }
    setPlayOut(true);
    const t = setTimeout(() => {
      playShown.current = false;
      setPlayOut(false);
    }, reducedMotion() ? 0 : SCREEN_OUT_MS);
    return () => clearTimeout(t);
  }, [onPlayPath, screen, leaving]);

  // Picking a game from the tiles happens in two beats, for every player at once: first the tiles (or the guests'
  // "está eligiendo" panel) go, for TILES_OUT_MS; then the game's big card grows in and "Cómo se juega" slides in
  // from the right. Switching straight from one game to another skips the first beat and only swaps the contents.
  // Going back to the menu is the same in reverse: the game's card and settings go first (`lobbyOut`, the game that is
  // leaving), then the menu grows in.
  const [tilesOut, setTilesOut] = useState(null);
  const [lobbyOut, setLobbyOut] = useState(null);
  const [enterKind, setEnterKind] = useState("pick");
  // The change is read while rendering, not in an effect: an effect would run after the first render with the new
  // game, which would show its panel for a frame and remount the tiles (they'd replay their intro).
  const [seen, setSeen] = useState({ code: room?.code, game });
  if (seen.code !== room?.code || seen.game !== game) {
    setSeen({ code: room?.code, game });
    setTilesOut(null);
    setLobbyOut(null);
    if (seen.code === room?.code && !reducedMotion()) {
      if (findMode(game)) {
        if (seen.game) {
          setEnterKind("switch");
        } else {
          setEnterKind("pick");
          setTilesOut(game);
        }
      } else if (findMode(seen.game)) {
        setLobbyOut(seen.game);
      }
    }
  }
  useEffect(() => {
    if (!tilesOut && !lobbyOut) return undefined;
    const t = setTimeout(() => {
      setTilesOut(null);
      setLobbyOut(null);
    }, TILES_OUT_MS);
    return () => clearTimeout(t);
  }, [tilesOut, lobbyOut]);

  // Everyone but the host hears about it, like the host's choice popping up on their screen.
  const lastGame = useRef({ code: room?.code, game });
  useEffect(() => {
    const before = lastGame.current;
    lastGame.current = { code: room?.code, game };
    if (before.code !== room?.code || before.game === game) return;
    const picked = findMode(game);
    // A public match has no host: its games come from the roulette, which says so itself.
    if (picked && !isHost && !room.matchmaking) {
      const host = room.hostName || "El anfitrión";
      showToast(picked.kind === "playlist" ? `${host} está preparando una playlist` : `${host} ha elegido ${picked.name}`, "play");
    }
  }, [game, room?.code]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((text, icon = "lock") => {
    setToast({ id: Date.now(), text, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // The host hears about each friend who asks to join (the room card has the Aceptar button).
  const askedBefore = useRef(new Set());
  useEffect(() => {
    if (!isHost) return;
    for (const r of room?.joinRequests || []) {
      const key = `${r.userId}:${r.at}`;
      if (askedBefore.current.has(key)) continue;
      askedBefore.current.add(key);
      showToast(`${r.name} quiere unirse a tu sala`, "users");
    }
  }, [room?.joinRequests, isHost]);

  // A friend let you in, or turned you down.
  const friendsNotice = useFriends().notice;
  useEffect(() => {
    if (friendsNotice) showToast(friendsNotice.text, friendsNotice.icon);
  }, [friendsNotice]);

  useEffect(() => {
    if (!kickedNotice) return;
    showToast(kickedNotice, "logout");
    setKickedNotice("");
  }, [kickedNotice]);

  function openSheet(mode = null, joinCode = null) {
    setSheetMode(mode);
    setSheetJoinCode(joinCode);
    setSheetOpen(true);
  }

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    if (inviteCode) nav("/", { replace: true });
    playRef.current?.focus({ preventScroll: true });
  }, [inviteCode, nav]);

  // Invite links (/sala/XOTRIV) join straight away, asking for a name first if we don't have one.
  useEffect(() => {
    if (!inviteCode || room?.code === inviteCode || sheetOpen) return;
    if (!user?.name) {
      openSheet(null, inviteCode);
      return;
    }
    joinRoom(inviteCode).catch((err) => {
      // Already playing in it from another device: CentralOffer asks whether this one is its central device.
      if (!err.offer) showToast(err.message || "No pudimos entrar a esa sala");
      nav("/", { replace: true });
    });
  }, [inviteCode, user?.name]);

  function pickMode(mode, tile) {
    if (mode.placeholder) {
      shake(tile);
      showToast("Pronto habrá más juegos");
    } else if (!mode.available) {
      shake(tile);
      showToast(`${mode.name} llega muy pronto`);
    } else if (room.game === mode.id) {
      return;
    } else if (!isHost) {
      // Players can't pick, but they can suggest it to the host (once every 5 s).
      suggestGame(mode.id)
        .then(() => showToast(`Le sugeriste ${choiceName(mode)} al anfitrión`, "play"))
        .catch((err) => showToast(err.message));
    } else {
      // Every player's room screen switches to this game right away; nobody changes page.
      setGame(mode.id).catch((err) => showToast(err.message));
    }
  }

  // Suggestions from the other players, for the host: a card each with an Accept button (or dismissed with the X).
  const [dismissed, setDismissed] = useState(() => new Set());
  const suggestions = (room?.suggestions || []).filter((s) => findMode(s.game)?.available && !dismissed.has(`${s.userId}:${s.at}`));
  const seenSuggestions = useRef(new Set());
  useEffect(() => {
    if (!isHost) return;
    for (const s of room?.suggestions || []) {
      const key = `${s.userId}:${s.at}`;
      if (seenSuggestions.current.has(key)) continue;
      seenSuggestions.current.add(key);
      showToast(`${s.name} sugiere ${choiceName(findMode(s.game))}`, "play");
    }
  }, [room?.suggestions, isHost]);

  // While the tiles go, the screen still shows the room without its new game (see tilesOut above); while a game's panel
  // goes, it still shows the room in that game.
  const shownGame = shownRoom && !tilesOut ? lobbyOut || shownRoom.game : null;
  const lobbyRoom = lobbyOut ? { ...shownRoom, game: lobbyOut } : shownRoom;
  const roomMode = findMode(shownGame);
  const ModeLobby = roomMode?.Lobby;
  const hostName = shownRoom?.hostName || "El anfitrión";
  // Which panel to show follows the room on screen, not the live one: while the room leaves (`room` is already null) the
  // host keeps seeing their menu instead of the guests' "está eligiendo" panel for the length of the exit.
  const shownIsHost = shownRoom ? shownRoom.hostId === user?.id && !isCentral : false;
  // On the room's central device the room screen is the big waiting screen (CentralLobby): nothing to pick or change.
  const centralScreen = isCentral && screen === "room";

  // The site takes the picked game's colour while the room waits in it (see :root[data-mode] in global.css).
  useEffect(() => {
    if (!roomMode) return;
    document.documentElement.setAttribute("data-mode", roomMode.id);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [roomMode?.id]);

  return (
    <div className="tv-app">

      <TvTopbar />
      {/* Phones: the room's own bars, pinned to the top and the bottom (home.css hides them on wider screens). */}
      {shownRoom && !isCentral && <RoomHeader room={shownRoom} onToast={showToast} />}

      <main className={`tv-main${screen === "room" ? " is-room" : screen === "home" && playShown.current ? " is-room is-playpage" : ""}${centralScreen ? " is-central" : ""}`}>
        {/* The site's address, at the top in plain letters but faint (phones): on the room screen, not on Home without a
            room. */}
        {!centralScreen && screen === "room" && <p className="tv-site-url">playtrivially.com</p>}
        {centralScreen ? (
          <CentralLobby room={shownRoom} />
        ) : screen === "home" && playShown.current ? (
          <PlayPage leaving={leaving || playOut} />
        ) : screen === "home" ? (
          <div className={`tv-home is-in-${entry}${leaving ? " is-leaving" : ""}${sheetOpen ? " is-behind" : ""}`}>
            <section className="tv-hero">
              <AppIcon edge />
              <Wordmark />
              <p className="tv-tagline">Trivia rápida para jugar solo o con amigos.</p>
              <button ref={playRef} type="button" className="tv-play tv-shine" onClick={() => nav("/jugar", { state: { from: "/" } })}>
                <span className="tv-play-icon">
                  <Icon name="play" size={20} filled strokeWidth={1.5} />
                </span>
                Jugar
              </button>
            </section>
            <HowToPlay />
          </div>
        ) : (
          <div className={`tv-room${leaving ? " is-leaving" : ""}`}>
            <div className="tv-room-main">
              {shownRoom.matchmaking ? (
                // A public match waiting for players (nobody picks a game, it starts by itself once full), and before each
                // of its games, the roulette and how it's played.
                shownRoom.phase === "intro" ? (
                  <MatchIntro room={shownRoom} />
                ) : (
                  <MatchLobby room={shownRoom} />
                )
              ) : roomMode && ModeLobby ? (
                <div key={roomMode.id} className={`tv-room-row is-${enterKind}${lobbyOut ? " is-out" : ""}`}>
                  <ModeLobby room={lobbyRoom} onToast={showToast} />
                </div>
              ) : (
                // The games only show up once you're in a room; Jugar is the way in. Everyone sees the menu: the
                // host picks, the others watch the tile the host is on, and picking swaps this panel for the
                // game's, for every player at once.
                <section
                  className={`tv-picker${shownIsHost ? "" : " is-watching"}${shownRoom.preview ? " has-preview" : ""}${tilesOut ? " is-leaving" : ""}`}
                  aria-labelledby="tv-picker-title"
                  aria-live={shownIsHost ? undefined : "polite"}
                  onPointerLeave={shownIsHost ? () => previewGame(null) : undefined}
                  onBlur={shownIsHost ? (e) => !e.currentTarget.contains(e.relatedTarget) && previewGame(null) : undefined}
                >
                  <div className="tv-picker-head">
                    <h2 id="tv-picker-title" className="tv-picker-title">
                      {shownIsHost ? "Elige el juego" : `${hostName} está eligiendo el juego`}
                    </h2>
                    {!shownIsHost && (
                      <p className="tv-picker-lock">
                        <Icon name="crown" size={15} strokeWidth={2.4} filled />
                        <span>
                          Solo <strong>{hostName}</strong> elige el juego. Toca uno para sugerírselo.
                        </span>
                      </p>
                    )}
                  </div>
                  {shownIsHost && suggestions.length > 0 && (
                    <ul className="tv-ideas" aria-label="Sugerencias de los jugadores">
                      {suggestions.map((s) => {
                        const m = findMode(s.game);
                        return (
                          <li key={`${s.userId}:${s.at}`} className="tv-idea">
                            <span className={`tv-badge tv-c-${m.color}`} aria-hidden="true">
                              <Icon name={m.icon} size={18} />
                            </span>
                            <p className="tv-idea-text">
                              <strong>{s.name}</strong> sugiere <strong>{choiceName(m)}</strong>
                            </p>
                            <button
                              type="button"
                              className="tv-btn tv-btn--sm tv-c-green"
                              onClick={() => setGame(m.id).catch((err) => showToast(err.message))}
                            >
                              Aceptar
                            </button>
                            <button
                              type="button"
                              className="tv-idea-x"
                              aria-label={`Descartar la sugerencia de ${s.name}`}
                              onClick={() => setDismissed((d) => new Set(d).add(`${s.userId}:${s.at}`))}
                            >
                              <Icon name="close" size={16} strokeWidth={3} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="tv-mode-grid">
                    {GAME_MODES.filter((m) => m.kind !== "playlist").map((mode, i) => (
                      <ModeTile
                        key={mode.id}
                        mode={mode}
                        index={i}
                        selected={tilesOut === mode.id}
                        watched={!shownIsHost && shownRoom.preview === mode.id}
                        suggestable={!shownIsHost}
                        onPick={pickMode}
                        onPoint={shownIsHost ? previewGame : undefined}
                      />
                    ))}
                    {GAME_MODES.filter((m) => m.kind === "extra").length % 2 === 1 && (
                      <ModeTile mode={SOON_TILE} index={GAME_MODES.length} onPick={pickMode} />
                    )}
                  </div>
                  {/* Not one more game: several of them in a row, so it goes apart, under the games. */}
                  {GAME_MODES.filter((m) => m.kind === "playlist").map((mode) => (
                    <PlaylistEntry
                      key={mode.id}
                      mode={mode}
                      selected={tilesOut === mode.id}
                      watched={!shownIsHost && shownRoom.preview === mode.id}
                      suggestable={!shownIsHost}
                      onPick={pickMode}
                      onPoint={shownIsHost ? previewGame : undefined}
                    />
                  ))}
                </section>
              )}
            </div>
            <PartyPanel room={shownRoom} onToast={showToast} scores={Boolean(shownRoom.matchmaking) && shownRoom.phase !== "lobby"} />
          </div>
        )}
      </main>

      {shownRoom && !leaving && !isCentral && !shownRoom.matchmaking && <RoomDock room={shownRoom} onToast={showToast} />}

      <PlaySheet mode={sheetMode} joinCode={sheetJoinCode} open={sheetOpen} onClose={closeSheet} />

      <div className="tv-toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="tv-toast">
            <Icon name={toast.icon} size={16} strokeWidth={2.8} />
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
