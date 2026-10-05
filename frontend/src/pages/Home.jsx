import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { GAME_MODES, findMode } from "../modes/index.js";
import Icon from "../components/home/Icon.jsx";
import TvTopbar from "../components/home/TvTopbar.jsx";
import HowToPlay from "../components/home/HowToPlay.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import PartyPanel from "../components/home/PartyPanel.jsx";
import PlaySheet from "../components/home/PlaySheet.jsx";
import Wordmark from "../components/home/Wordmark.jsx";
import "../styles/home.css";

function ModeTile({ mode, index, showGo, selected, onPick }) {
  return (
    <button
      type="button"
      className={`tv-mode tv-c-${mode.color}${mode.available ? "" : " is-soon"}${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      style={{ "--i": index }}
      aria-disabled={mode.available ? undefined : "true"}
      onClick={(e) => onPick(mode, e.currentTarget)}
    >
      <Icon name={mode.icon} size={116} strokeWidth={1.6} className="tv-mode-watermark" />
      <span className="tv-badge tv-mode-badge">
        <Icon name={mode.icon} size={24} />
      </span>
      {!mode.available ? (
        <span className="tv-mode-soon">
          <Icon name="lock" size={12} strokeWidth={3} />
          Pronto
        </span>
      ) : (
        showGo && (
          <span className="tv-mode-go">
            <Icon name="play" size={14} filled strokeWidth={1.5} />
          </span>
        )
      )}
      <span className="tv-mode-name">{mode.name}</span>
    </button>
  );
}

// The host's "Cambiar juego": every game in a little menu, to switch right from the game's header.
function ModeMenu({ current, onPick }) {
  const currentMode = findMode(current);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="tv-mode-menu-wrap">
      <button
        type="button"
        className={`tv-switch-btn tv-c-${currentMode.color}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Juego actual: ${currentMode.name}. Cambiar juego`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tv-switch-badge">
          <Icon name={currentMode.icon} size={20} />
        </span>
        <span className="tv-switch-text">
          <span className="tv-switch-label">Modo de juego</span>
          <span className="tv-switch-name">{currentMode.name}</span>
        </span>
        <span className="tv-switch-icon" aria-hidden="true">
          <Icon name="swap" size={18} strokeWidth={2.6} />
        </span>
      </button>
      {open && (
        <div className="tv-mode-menu" role="menu">
          {GAME_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={mode.id === current}
              className="tv-mode-menu-item"
              disabled={!mode.available}
              onClick={() => {
                setOpen(false);
                onPick(mode);
              }}
            >
              <span className={`tv-badge tv-c-${mode.color}`}>
                <Icon name={mode.icon} size={16} />
              </span>
              <span className="tv-mode-menu-name">{mode.name}</span>
              {mode.id === current ? (
                <Icon name="check" size={16} strokeWidth={3} className="tv-mode-menu-check" />
              ) : (
                !mode.available && (
                  <span className="tv-mode-menu-soon">
                    <Icon name="lock" size={11} strokeWidth={3} />
                    Pronto
                  </span>
                )
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function shake(tile) {
  tile.classList.remove("is-shaking");
  void tile.getBoundingClientRect(); // restart the shake animation
  tile.classList.add("is-shaking");
}

// Where the logo (app icon and wordmark) is on screen. Neither box is moved by its own looping animations, only
// by the entrance pop, which is over by the time anyone has opened a room.
function logoRects(main) {
  const icon = main?.querySelector(".tv-hero .tv-appicon");
  const word = main?.querySelector(".tv-hero .tv-wordmark");
  return icon && word ? [icon.getBoundingClientRect(), word.getBoundingClientRect()] : null;
}

// Moves `el` from the box `from` to where it is now (FLIP). The compact icon also has a CSS `scale`, which applies
// on top of the transform, so the offset is divided by it.
function flyFrom(el, from) {
  const to = el.getBoundingClientRect();
  if (!to.width || !from.width) return;
  const s = parseFloat(getComputedStyle(el).scale) || 1;
  const k = from.width / to.width;
  const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / s;
  const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / s;
  el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: "none" }], {
    duration: 700,
    easing: "cubic-bezier(0.34, 1.3, 0.64, 1)",
  });
}

// How long the game tiles take to fade out after a pick, before the game's panel comes in.
const TILES_OUT_MS = 300;

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
  const modesRef = useRef(null);
  const toastTimer = useRef(0);

  const isHost = Boolean(room) && room.hostId === user?.id;
  const hasRoom = Boolean(room);
  const mainRef = useRef(null);
  const lastLogo = useRef(null);
  const wasInRoom = useRef(hasRoom);
  const game = room?.game ?? null;
  const lastGame = useRef(game);

  // Home ↔ room: the logo flies between the middle of the home screen and the room's header. Going in, the room
  // card and game panel come in right after it; going out, the home screen's own entrance does the rest (the
  // classes in home.css). Opening a /sala link straight away (already in the room on the first render) has
  // nothing to fly from, so it keeps the normal entrance.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (hasRoom === wasInRoom.current) return;
    wasInRoom.current = hasRoom;
    // Coming in with a game already picked is this entrance, not a pick (the effect below).
    lastGame.current = game;
    main.classList.remove("is-logo-flown", "is-entering-room");
    const from = lastLogo.current;
    lastLogo.current = null;
    if (!from || reducedMotion()) return;
    // The class goes on before measuring: it turns off the logo's entrance pop, which would shrink it.
    main.classList.add("is-logo-flown");
    if (hasRoom) main.classList.add("is-entering-room");
    const icon = main.querySelector(".tv-hero .tv-appicon");
    const word = main.querySelector(".tv-hero .tv-wordmark");
    if (icon) flyFrom(icon, from[0]);
    if (word) flyFrom(word, from[1]);
    const t = setTimeout(() => main.classList.remove("is-entering-room"), 1200);
    return () => {
      clearTimeout(t);
      main.classList.remove("is-entering-room");
    };
  }, [hasRoom]);

  // Picking a game from the tiles happens in two beats, for every player at once. First the tiles fade out (the
  // screen keeps showing the room as it was, game-less, for TILES_OUT_MS); then the game's panel comes in: its
  // button drops into place, its cards rise one after another, and the room card grows smoothly to make room for
  // "Comenzar partida" (home.css). A switch from the host's menu has no tiles, so it goes straight to the second
  // beat. is-mode-picked stays until the next pick: taking it off would swap the animations and replay them.
  const [tilesOut, setTilesOut] = useState(null);
  const partyHeight = useRef(0);
  useLayoutEffect(() => {
    const main = mainRef.current;
    const before = lastGame.current;
    lastGame.current = game;
    if (game === before) return;
    main.classList.remove("is-mode-picked");
    setTilesOut(null);
    if (!findMode(game) || !hasRoom || reducedMotion()) return;
    if (before) {
      partyHeight.current = 0;
      main.classList.add("is-mode-picked");
      return;
    }
    partyHeight.current = main.querySelector(".tv-party")?.offsetHeight || 0;
    setTilesOut(game);
    const t = setTimeout(() => setTilesOut(null), TILES_OUT_MS);
    return () => clearTimeout(t);
  }, [game]);

  // The second beat, once the tiles are gone.
  const hadTilesOut = useRef(null);
  useLayoutEffect(() => {
    const main = mainRef.current;
    const wasOut = hadTilesOut.current;
    hadTilesOut.current = tilesOut;
    if (!wasOut || tilesOut || game !== wasOut) return;
    main.classList.add("is-mode-picked");
    const party = main.querySelector(".tv-party");
    const from = partyHeight.current;
    const to = party?.offsetHeight || 0;
    if (!party || !from || from === to) return;
    party.style.overflow = "hidden";
    const anim = party.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 420,
      easing: "cubic-bezier(0.25, 0.8, 0.25, 1)",
    });
    anim.onfinish = anim.oncancel = () => party.style.removeProperty("overflow");
  }, [tilesOut]);

  // Keeps the logo's last position up to date (after its entrance, and on scroll or resize) for the flight above.
  useEffect(() => {
    const measure = () => {
      lastLogo.current = logoRects(mainRef.current);
    };
    const t = setTimeout(measure, 900);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [hasRoom]);

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
    if (!mode.available) {
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

  // While the tiles fade out, the screen still shows the room without its new game (see tilesOut above).
  const shownRoom = room && tilesOut ? { ...room, game: null } : room;
  const choosing = Boolean(room) && !shownRoom.game;
  const roomMode = findMode(shownRoom?.game);
  const ModeLobby = roomMode?.Lobby;

  // The site takes the picked game's colour while the room waits in it (see :root[data-mode] in global.css).
  useEffect(() => {
    if (!roomMode) return;
    document.documentElement.setAttribute("data-mode", roomMode.id);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [roomMode?.id]);

  return (
    <div className="tv-app">

      <TvTopbar />

      <main ref={mainRef} className="tv-main">
        {room ? (
          <div className="tv-stage has-room">
            <section className="tv-hero is-compact">
              <AppIcon />
              <Wordmark />
            </section>
            <PartyPanel room={shownRoom} onToast={showToast} />
          </div>
        ) : (
          <div className="tv-stage is-home">
            <section className="tv-hero">
              <AppIcon />
              <Wordmark />
              <p className="tv-tagline">Trivia rápida para jugar solo o con amigos.</p>
              <button ref={playRef} type="button" className="tv-play" aria-haspopup="dialog" onClick={() => openSheet()}>
                <span className="tv-play-icon">
                  <Icon name="play" size={20} filled strokeWidth={1.5} />
                </span>
                Jugar
              </button>
            </section>
            <HowToPlay />
          </div>
        )}

        {room && ModeLobby && (
          <section key={roomMode.id} className="tv-room-game" aria-label={roomMode.name}>
            <div className="tv-room-game-head">
              {isHost ? (
                <ModeMenu
                  current={room.game}
                  onPick={(mode) => mode.id !== room.game && setGame(mode.id).catch((err) => showToast(err.message))}
                />
              ) : (
                <h2 className="tv-switch-btn tv-room-game-title">
                  <span className="tv-switch-badge">
                    <Icon name={roomMode.icon} size={20} />
                  </span>
                  <span className="tv-switch-text">
                    <span className="tv-switch-label">Modo de juego</span>
                    <span className="tv-switch-name">{roomMode.name}</span>
                  </span>
                </h2>
              )}
            </div>
            <ModeLobby room={room} onToast={showToast} />
          </section>
        )}

        {/* The games only show up once you're in a room; Jugar is the way in. The room screen stays put: picking a
            game swaps the panel above, for every player at once. */}
        {/* Once a game is picked, the host switches it from the menu in its header instead. */}
        {choosing && (
          <section ref={modesRef} className={`tv-modes${tilesOut ? " is-leaving" : ""}`} aria-labelledby="tv-modes-title">
            <h2 id="tv-modes-title" className="tv-section-title">
              {choosing ? (isHost ? "Elige el juego" : "Juegos") : isHost ? "Cambiar de juego" : "Juego"}
            </h2>
            <div className={`tv-mode-grid${roomMode ? " is-compact" : ""}`}>
              {GAME_MODES.map((mode, i) => (
                <ModeTile
                  key={mode.id}
                  mode={mode}
                  index={i}
                  selected={room.game === mode.id}
                  showGo={isHost && room.game !== mode.id}
                  onPick={pickMode}
                />
              ))}
            </div>
          </section>
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
