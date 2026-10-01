import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { GAME_MODES, findMode } from "../modes/index.js";
import Icon from "../components/home/Icon.jsx";
import TvTopbar from "../components/home/TvTopbar.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import PartyPanel from "../components/home/PartyPanel.jsx";
import PlaySheet from "../components/home/PlaySheet.jsx";
import Wordmark from "../components/home/Wordmark.jsx";
import HowToPlay from "../components/home/HowToPlay.jsx";
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
      <button type="button" className="tv-switch-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Cambiar juego
        <Icon name="chevron" size={14} strokeWidth={3} className="tv-switch-icon" />
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

export default function Home() {
  const { user, room, joinRoom, setGame } = useApp();
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

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((text, icon = "lock") => {
    setToast({ id: Date.now(), text, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

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

  // Invite links (/sala/XOYOAV) join straight away, asking for a name first if we don't have one.
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

  const choosing = Boolean(room) && !room.game;
  const roomMode = findMode(room?.game);
  const ModeLobby = roomMode?.Lobby;

  // The site takes the picked game's colour while the room waits in it (see :root[data-mode] in global.css).
  useEffect(() => {
    if (!roomMode) return;
    document.documentElement.setAttribute("data-mode", roomMode.id);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [roomMode?.id]);

  return (
    <div className="tv-app">
      <div className="tv-backdrop" aria-hidden="true">
        <span className="tv-blob tv-blob--1" />
        <span className="tv-blob tv-blob--2" />
        <span className="tv-blob tv-blob--3" />
      </div>

      <TvTopbar />

      <main className="tv-main">
        {room ? (
          <div className="tv-stage has-room">
            <section className="tv-hero is-compact">
              <AppIcon />
              <Wordmark />
            </section>
            <PartyPanel room={room} onToast={showToast} />
          </div>
        ) : (
          <div className="tv-stage">
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
              <h2 className="tv-section-title tv-room-game-title">
                <span className={`tv-badge tv-c-${roomMode.color}`}>
                  <Icon name={roomMode.icon} size={20} />
                </span>
                {roomMode.name}
              </h2>
              {isHost && (
                <ModeMenu
                  current={room.game}
                  onPick={(mode) => mode.id !== room.game && setGame(mode.id).catch((err) => showToast(err.message))}
                />
              )}
            </div>
            <ModeLobby room={room} onToast={showToast} />
          </section>
        )}

        {/* The games only show up once you're in a room; Jugar is the way in. The room screen stays put: picking a
            game swaps the panel above, for every player at once. */}
        {/* Once a game is picked, the host switches it from the menu in its header instead. */}
        {choosing && (
          <section ref={modesRef} className="tv-modes" aria-labelledby="tv-modes-title">
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
