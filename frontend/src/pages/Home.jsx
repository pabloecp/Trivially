import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { GAME_MODES, SOON_TILE, findMode } from "../modes/index.js";
import Icon from "../components/home/Icon.jsx";
import TvTopbar from "../components/home/TvTopbar.jsx";
import HowToPlay from "../components/home/HowToPlay.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import PartyPanel from "../components/home/PartyPanel.jsx";
import PlaySheet from "../components/home/PlaySheet.jsx";
import { RoomDock, RoomHeader } from "../components/home/RoomBars.jsx";
import Wordmark from "../components/home/Wordmark.jsx";
import "../styles/home.css";

// A game tile of "Elige el modo de juego", filled with the game's colour. The main mode's is as wide as two. The grey
// "Más modos pronto" tile (SOON_TILE) looks like one, with a lock, and has no "Pronto" tag of its own.
function ModeTile({ mode, index, selected, onPick }) {
  const main = mode.kind === "main";
  return (
    <button
      type="button"
      className={`tv-mode tv-c-${mode.color}${main ? " is-main" : ""}${mode.available ? "" : " is-soon"}${selected ? " is-selected" : ""}`}
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
      <span className="tv-mode-name">{mode.name}</span>
    </button>
  );
}

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
  const { user, room, joinRoom, setGame, kickedNotice, setKickedNotice } = useApp();
  const { code: inviteParam } = useParams();
  const inviteCode = inviteParam?.toUpperCase();
  const nav = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState(null);
  const [sheetJoinCode, setSheetJoinCode] = useState(null);
  const [toast, setToast] = useState(null);
  const playRef = useRef(null);
  const toastTimer = useRef(0);

  const isHost = Boolean(room) && room.hostId === user?.id;
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
    if (picked && !isHost) showToast(`${room.hostName || "El anfitrión"} ha elegido ${picked.name}`, "play");
  }, [game, room?.code]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((text, icon = "lock") => {
    setToast({ id: Date.now(), text, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

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
      showToast(err.message || "No pudimos entrar a esa sala");
      nav("/", { replace: true });
    });
  }, [inviteCode, user?.name]);

  function pickMode(mode, tile) {
    if (mode.placeholder) {
      shake(tile);
      showToast("Pronto habrá más modos de juego");
    } else if (!mode.available) {
      shake(tile);
      showToast(`${mode.name} llega muy pronto`);
    } else if (room.game === mode.id) {
      return;
    } else if (!isHost) {
      shake(tile);
      showToast("Solo el anfitrión elige el modo de juego", "crown");
    } else {
      // Every player's room screen switches to this game right away; nobody changes page.
      setGame(mode.id).catch((err) => showToast(err.message));
    }
  }

  // While the tiles go, the screen still shows the room without its new game (see tilesOut above); while a game's panel
  // goes, it still shows the room in that game.
  const shownGame = shownRoom && !tilesOut ? lobbyOut || shownRoom.game : null;
  const lobbyRoom = lobbyOut ? { ...shownRoom, game: lobbyOut } : shownRoom;
  const roomMode = findMode(shownGame);
  const ModeLobby = roomMode?.Lobby;
  const hostName = shownRoom?.hostName || "El anfitrión";
  // Which panel to show follows the room on screen, not the live one: while the room leaves (`room` is already null) the
  // host keeps seeing their menu instead of the guests' "está eligiendo" panel for the length of the exit.
  const shownIsHost = shownRoom ? shownRoom.hostId === user?.id : false;

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
      {shownRoom && <RoomHeader room={shownRoom} onToast={showToast} />}

      <main className={`tv-main${screen === "room" ? " is-room" : ""}`}>
        {screen === "home" ? (
          <div className={`tv-home is-in-${entry}${leaving ? " is-leaving" : ""}${sheetOpen ? " is-behind" : ""}`}>
            <section className="tv-hero">
              <AppIcon edge />
              <Wordmark />
              <p className="tv-tagline">Trivia rápida para jugar solo o con amigos.</p>
              <button ref={playRef} type="button" className="tv-play tv-shine" aria-haspopup="dialog" onClick={() => openSheet()}>
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
              {roomMode && ModeLobby ? (
                <div key={roomMode.id} className={`tv-room-row is-${enterKind}${lobbyOut ? " is-out" : ""}`}>
                  <ModeLobby room={lobbyRoom} onToast={showToast} />
                </div>
              ) : shownIsHost ? (
                // The games only show up once you're in a room; Jugar is the way in. Picking one swaps this panel
                // for the game's, for every player at once.
                <section className={`tv-picker${tilesOut ? " is-leaving" : ""}`} aria-labelledby="tv-picker-title">
                  <div className="tv-picker-head">
                    <h2 id="tv-picker-title" className="tv-picker-title">Elige el modo de juego</h2>
                  </div>
                  <div className="tv-mode-grid">
                    {GAME_MODES.map((mode, i) => (
                      <ModeTile key={mode.id} mode={mode} index={i} selected={tilesOut === mode.id} onPick={pickMode} />
                    ))}
                    {GAME_MODES.filter((m) => m.kind !== "main").length % 2 === 1 && (
                      <ModeTile mode={SOON_TILE} index={GAME_MODES.length} onPick={pickMode} />
                    )}
                  </div>
                </section>
              ) : (
                <section className={`tv-picker tv-picker--wait${tilesOut ? " is-leaving" : ""}`} aria-live="polite">
                  <div className="tv-wait-blocks" aria-hidden="true">
                    {["music", "culture", "world", "cinema"].map((c, i) => (
                      <span key={c} className={`tv-c-${c}`} style={{ "--i": i }} />
                    ))}
                  </div>
                  <h2 className="tv-picker-title">
                    {hostName} está eligiendo modo de juego
                  </h2>
                  <p className="tv-picker-sub">Cuando lo elija, lo verás aquí al momento con sus ajustes.</p>
                </section>
              )}
            </div>
            <PartyPanel room={shownRoom} onToast={showToast} />
          </div>
        )}
      </main>

      {shownRoom && !leaving && <RoomDock room={shownRoom} onToast={showToast} />}

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
