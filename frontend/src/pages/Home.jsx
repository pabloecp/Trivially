import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { useTheme } from "../lib/theme.js";
import { GAME_MODES, roomPath } from "../modes/index.js";
import Icon from "../components/home/Icon.jsx";
import Avatar from "../components/home/Avatar.jsx";
import AppIcon from "../components/home/AppIcon.jsx";
import PartyPanel from "../components/home/PartyPanel.jsx";
import PlaySheet from "../components/home/PlaySheet.jsx";
import Wordmark from "../components/home/Wordmark.jsx";
import "../styles/home.css";

function ProfileChip({ user }) {
  if (!user) {
    return (
      <Link to="/login" className="tv-chip">
        <span className="tv-avatar tv-avatar--empty">
          <Icon name="user" size={18} />
        </span>
        <span className="tv-chip-name">Entrar</span>
      </Link>
    );
  }

  return (
    <Link to="/profile" className="tv-chip" aria-label={`Tu perfil: ${user.name}`}>
      <Avatar name={user.name} avatar={user.avatar} />
      <span className="tv-chip-name">{user.name}</span>
    </Link>
  );
}

function ModeTile({ mode, index, showGo, onPick }) {
  return (
    <button
      type="button"
      className={`tv-mode tv-c-${mode.color}${mode.available ? "" : " is-soon"}`}
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
  const { theme, toggleTheme, canToggle } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetJoinCode, setSheetJoinCode] = useState(null);
  const [toast, setToast] = useState(null);
  const playRef = useRef(null);
  const toastTimer = useRef(0);

  const isHost = Boolean(room) && room.hostId === user?.id;

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((text, icon = "lock") => {
    setToast({ id: Date.now(), text, icon });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  function openSheet(joinCode = null) {
    setSheetJoinCode(joinCode);
    setSheetOpen(true);
  }

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    if (inviteCode) nav("/", { replace: true });
    playRef.current?.focus({ preventScroll: true });
  }, [inviteCode, nav]);

  // Invite links (/sala/XO4K9M) join straight away, asking for a name first if we don't have one.
  useEffect(() => {
    if (!inviteCode || room?.code === inviteCode || sheetOpen) return;
    if (!user?.name) {
      openSheet(inviteCode);
      return;
    }
    joinRoom(inviteCode).catch((err) => {
      showToast(err.message || "No pudimos entrar a esa sala");
      nav("/", { replace: true });
    });
  }, [inviteCode, user?.name]);

  // Only reachable from the mode grid, which is shown once we're in a room.
  function pickMode(mode, tile) {
    if (!mode.available) {
      shake(tile);
      showToast(`${mode.name} llega muy pronto`);
    } else if (room.game === mode.id) {
      nav(roomPath(room));
    } else if (!isHost) {
      shake(tile);
      showToast("Solo el anfitrión elige el juego", "crown");
    } else {
      // Everyone in the room follows (see RoomNavigator in App.jsx).
      setGame(mode.id).catch((err) => showToast(err.message));
    }
  }

  const choosing = Boolean(room) && !room.game;

  return (
    <div className="tv-app">
      <div className="tv-backdrop" aria-hidden="true">
        <span className="tv-blob tv-blob--1" />
        <span className="tv-blob tv-blob--2" />
        <span className="tv-blob tv-blob--3" />
      </div>

      <header className="tv-topbar">
        <ProfileChip user={user} />
        {canToggle && (
          <button
            type="button"
            className="tv-icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={22} />
          </button>
        )}
      </header>

      <main className="tv-main">
        <section className={`tv-hero${room ? " is-compact" : ""}`}>
          <AppIcon />
          <Wordmark />
          {!room && <p className="tv-tagline">Trivia rápida para jugar solo o con amigos.</p>}
        </section>

        {room ? (
          <PartyPanel room={room} onToast={showToast} />
        ) : (
          <button
            ref={playRef}
            type="button"
            className="tv-play"
            aria-haspopup="dialog"
            onClick={() => openSheet()}
          >
            <span className="tv-play-icon">
              <Icon name="play" size={20} filled strokeWidth={1.5} />
            </span>
            Jugar
          </button>
        )}

        {room && (
          <section className="tv-modes" aria-labelledby="tv-modes-title">
            <h2 id="tv-modes-title" className="tv-section-title">
              {choosing ? (isHost ? "Elige el juego" : "Juegos") : "Modos de juego"}
            </h2>
            <div className="tv-mode-grid">
              {GAME_MODES.map((mode, i) => (
                <ModeTile
                  key={mode.id}
                  mode={mode}
                  index={i}
                  showGo={isHost || room.game === mode.id}
                  onPick={pickMode}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <PlaySheet joinCode={sheetJoinCode} open={sheetOpen} onClose={closeSheet} />

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
