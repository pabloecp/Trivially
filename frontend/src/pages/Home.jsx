import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { GAME_MODES, SOON_TILE, dockModes, findMode } from "../modes/index.js";
import Icon from "../components/home/Icon.jsx";
import TvTopbar from "../components/home/TvTopbar.jsx";
import HowToPlay from "../components/home/HowToPlay.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import PageDecor from "../components/home/PageDecor.jsx";
import PartyPanel from "../components/home/PartyPanel.jsx";
import PlaySheet from "../components/home/PlaySheet.jsx";
import Wordmark from "../components/home/Wordmark.jsx";
import "../styles/home.css";

// A big game tile of "Elige el juego", filled with the game's colour. The grey "Más juegos pronto" tile (SOON_TILE)
// looks like one, with a lock, and has no "Pronto" tag of its own.
function ModeTile({ mode, index, selected, onPick }) {
  return (
    <button
      type="button"
      className={`tv-mode tv-c-${mode.color}${mode.available ? "" : " is-soon"}${selected ? " is-selected" : ""}`}
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

// The row under the picked game's panel: the most popular games (and the picked one), so the host can switch
// straight away; every game is back in "Elige el juego" (the card's back button). The rest only see which one is on.
function ModeDock({ current, isHost, onPick }) {
  const modes = dockModes(current);
  const items = modes.length % 2 === 1 ? [...modes, SOON_TILE] : modes;
  return (
    <nav className="tv-dock" aria-label="Juegos populares">
      {items.map((mode) => {
        const on = mode.id === current;
        return (
          <button
            key={mode.id}
            type="button"
            className={`tv-dock-item tv-c-${mode.color}${on ? " is-on" : ""}${!isHost && !on && !mode.placeholder ? " is-dim" : ""}${
              mode.placeholder ? " is-placeholder" : ""
            }`}
            aria-pressed={mode.placeholder ? undefined : on}
            aria-label={mode.available || mode.placeholder ? mode.name : `${mode.name} (pronto)`}
            onClick={(e) => onPick(mode, e.currentTarget)}
          >
            <span className="tv-dock-icon">
              <Icon name={mode.icon} size={22} strokeWidth={2.2} />
            </span>
            <span className="tv-dock-name">{mode.short || mode.name}</span>
            {!mode.available && !mode.placeholder && <Icon name="lock" size={13} strokeWidth={3} className="tv-dock-lock" />}
          </button>
        );
      })}
    </nav>
  );
}

function shake(tile) {
  tile.classList.remove("is-shaking");
  void tile.getBoundingClientRect(); // restart the shake animation
  tile.classList.add("is-shaking");
}

// How long a screen takes to leave (home ↔ room) before the next one comes in, and how long the game tiles take
// to go after a pick, before the game's panel comes in. Both match the exit animations in home.css.
const SCREEN_OUT_MS = 360;
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

  // Home ↔ room: the screen on show leaves first (home zooms away, the room's cards sink and slide off), then the
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
    const t = setTimeout(swap, SCREEN_OUT_MS);
    return () => clearTimeout(t);
  }, [hasRoom]);
  const shownRoom = screen === "room" ? room || lastRoom.current : null;

  // Picking a game from the tiles happens in two beats, for every player at once: first the tiles (or the guests'
  // "está eligiendo" panel) go, for TILES_OUT_MS; then the game's big card grows in, its settings slide in from the
  // right and the game dock rises under them. Switching from the dock skips the first beat and only swaps the
  // panel's contents.
  const [tilesOut, setTilesOut] = useState(null);
  const [enterKind, setEnterKind] = useState("pick");
  const lastGame = useRef({ code: room?.code, game });
  useLayoutEffect(() => {
    const before = lastGame.current;
    lastGame.current = { code: room?.code, game };
    if (before.code !== room?.code || before.game === game) return undefined;
    // Everyone but the host hears about it, like the host's choice popping up on their screen.
    const picked = findMode(game);
    if (picked && !isHost) showToast(`${room.hostName || "El anfitrión"} ha elegido ${picked.name}`, "play");
    setTilesOut(null);
    if (!picked || reducedMotion()) return undefined;
    if (before.game) {
      setEnterKind("switch");
      return undefined;
    }
    setEnterKind("pick");
    setTilesOut(game);
    const t = setTimeout(() => setTilesOut(null), TILES_OUT_MS);
    return () => clearTimeout(t);
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
      showToast("Pronto habrá más juegos");
    } else if (!mode.available) {
      shake(tile);
      showToast(`${mode.name} llega muy pronto`);
    } else if (room.game === mode.id) {
      return;
    } else if (!isHost) {
      shake(tile);
      showToast("Solo el anfitrión elige el juego", "crown");
    } else {
      // Every player's room screen switches to this game right away; nobody changes page.
      setGame(mode.id).catch((err) => showToast(err.message));
    }
  }

  // While the tiles go, the screen still shows the room without its new game (see tilesOut above).
  const shownGame = shownRoom && !tilesOut ? shownRoom.game : null;
  const roomMode = findMode(shownGame);
  const ModeLobby = roomMode?.Lobby;
  const hostName = shownRoom?.hostName || "El anfitrión";

  // The site takes the picked game's colour while the room waits in it (see :root[data-mode] in global.css).
  useEffect(() => {
    if (!roomMode) return;
    document.documentElement.setAttribute("data-mode", roomMode.id);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [roomMode?.id]);

  return (
    <div className="tv-app">
      <PageDecor />

      <TvTopbar />

      <main className={`tv-main${screen === "room" ? " is-room" : ""}`}>
        {screen === "home" ? (
          <div className={`tv-home is-in-${entry}${leaving ? " is-leaving" : ""}${sheetOpen ? " is-behind" : ""}`}>
            <section className="tv-hero">
              <AppIcon />
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
                <>
                  <div key={roomMode.id} className={`tv-room-row is-${enterKind}`}>
                    <ModeLobby room={shownRoom} onToast={showToast} />
                  </div>
                  <ModeDock current={shownRoom.game} isHost={isHost} onPick={pickMode} />
                </>
              ) : isHost ? (
                // The games only show up once you're in a room; Jugar is the way in. Picking one swaps this panel
                // for the game's, for every player at once.
                <section className={`tv-picker${tilesOut ? " is-leaving" : ""}`} aria-labelledby="tv-picker-title">
                  <div className="tv-picker-head">
                    <h2 id="tv-picker-title" className="tv-picker-title">Elige el juego</h2>
                    <span className="tv-picker-sub">Todos verán el cambio al instante</span>
                  </div>
                  <div className="tv-mode-grid">
                    {GAME_MODES.map((mode, i) => (
                      <ModeTile key={mode.id} mode={mode} index={i} selected={tilesOut === mode.id} onPick={pickMode} />
                    ))}
                    {GAME_MODES.length % 2 === 1 && <ModeTile mode={SOON_TILE} index={GAME_MODES.length} onPick={pickMode} />}
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
                    {hostName} está eligiendo juego
                  </h2>
                  <p className="tv-picker-sub">Cuando lo elija, lo verás aquí al momento con sus ajustes.</p>
                </section>
              )}
            </div>
            <PartyPanel room={shownRoom} onToast={showToast} />
          </div>
        )}
      </main>

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
