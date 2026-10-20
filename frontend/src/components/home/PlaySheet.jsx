import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AVATAR_COLORS, savedGuest, useApp } from "../../lib/store.jsx";
import { withSound } from "../../lib/sounds.js";
import { findMode } from "../../modes/index.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import Segmented from "./Segmented.jsx";
import { MATCH_GAMES, MATCH_KINDS, MATCH_ROUNDS, MATCH_SIZES, gamesText } from "./matchInfo.js";
import "../../styles/match.css";

// A room's code is five letters and numbers (ROOM_CODE_LENGTH on the server).
const ROOM_CODE_LENGTH = 5;

const DISMISS_DISTANCE = 90;
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";
// The three ways to play, each opening in place under its row: the public matches (pick the length, then search) and
// "Privada" (create a room or join one with a code).
const PLAY_KINDS = [
  MATCH_KINDS.casual,
  MATCH_KINDS.competitivo,
  { id: "privada", name: "Privada", color: "blue", icon: "lock", blurb: "Crea una sala o entra con un código" },
];

// A row's panel is only reachable (tab, screen reader) while it's open.
const inertUnless = (shown) => (el) => {
  if (el) el.inert = !shown;
};

const TITLES = {
  menu: "¿Cómo quieres jugar?",
  code: "Escribe el código",
  name: "¿Cómo te llamas?",
};

// Bottom sheet to create or join a room. With `mode`, a new room goes straight into that game; without it the
// room starts on Home so the host can pick. With `joinCode` (an invite link opened by someone with no name yet)
// it asks for a name and then joins that room. Without an account, creating or joining always asks for the name
// first, already filled in with the one used last time (and its colour), so a guest can keep it with one tap.
export default function PlaySheet({ mode, joinCode, open, onClose }) {
  const { user, saveGuest, createRoom, joinRoom, checkRoom, findMatch } = useApp();
  // Which of the three rows is open (null: none), and the length picked for a public match.
  const [kind, setKind] = useState(null);
  const [rounds, setRounds] = useState(MATCH_ROUNDS[0]);
  const [size, setSize] = useState(MATCH_SIZES[1].value);
  const sheetRef = useRef(null);
  const dragStart = useRef(null);
  const [mounted, setMounted] = useState(open);
  const [dragY, setDragY] = useState(0);
  const [step, setStep] = useState("menu");
  const [pending, setPending] = useState(null); // action to run once we have a name
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const rootRef = useRef(null);
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDragY(0);
      setBusy(false);
      setError("");
      setCode(joinCode || "");
      setPending(joinCode ? { type: "join", code: joinCode } : null);
      setStep(joinCode ? "name" : "menu");
      setKind(null);
      const last = user?.isGuest ? { name: user.name, avatar: user.avatar } : savedGuest();
      setName(last.name || "");
      setColor(AVATAR_COLORS.includes(last.avatar) ? last.avatar : AVATAR_COLORS[0]);
    }
  }, [open]);

  // On phones the keyboard doesn't resize the page: it covers the bottom of it, and that's where this sheet sits.
  // Keep the sheet inside the part of the screen the keyboard leaves visible.
  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!open || !mounted || !vv || !root) return undefined;
    function fit() {
      root.style.setProperty("--tv-vv-h", `${vv.height}px`);
      root.style.setProperty("--tv-vv-top", `${vv.offsetTop}px`);
    }
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open || !mounted) return;
    const sheet = sheetRef.current;
    (sheet.querySelector(".tv-sheet-body input") || sheet.querySelector(`.tv-sheet-body :is(${FOCUSABLE})`))?.focus({
      preventScroll: true,
    });
  }, [open, mounted, step]);

  useEffect(() => {
    if (!open || !mounted) return;
    const sheet = sheetRef.current;

    function onKey(e) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Tab") {
        const items = sheet.querySelectorAll(FOCUSABLE);
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, mounted, onClose]);

  if (!mounted) return null;

  function onPointerDown(e) {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  }

  function onPointerUp() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY > DISMISS_DISTANCE) onClose();
    else setDragY(0);
  }

  function onAnimationEnd(e) {
    if (!open && e.target === e.currentTarget) setMounted(false);
  }

  function goTo(next) {
    setError("");
    setStep(next);
  }

  function run(action) {
    if (!user?.name || user.isGuest) {
      setPending(action);
      goTo("name");
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
          ? createRoom("multi", {}, mode?.id ?? null)
          : action.type === "match"
          ? findMatch(action.kind, action.rounds, action.size)
          : joinRoom(action.code)
      );
      onClose(); // the room navigator takes the player wherever the room is
    } catch (err) {
      // This account already plays in that room from another device: CentralOffer asks about this one instead.
      if (err.offer) {
        onClose();
        return;
      }
      setError(err.message || "Algo salió mal, inténtalo otra vez");
      setBusy(false);
    }
  }

  async function submitName(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await withSound(() => saveGuest(name, color), null);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    if (pending) {
      perform(pending);
    } else {
      setBusy(false);
      goTo("menu");
    }
  }

  // The code is checked first, so a wrong one is said here and not after writing a name. The message stays while
  // it's checked again (so nothing jumps), and a wrong code shakes the box each time.
  async function submitCode(e) {
    e.preventDefault();
    if (code.length < ROOM_CODE_LENGTH || busy) return;
    const asksName = !user?.name || user.isGuest;
    setBusy(true);
    try {
      await withSound(() => checkRoom(code), asksName ? "next" : null);
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

  const dragging = dragStart.current !== null;

  return (
    <div ref={rootRef} className={`tv-sheet-root ${open ? "is-open" : "is-closing"}`}>
      <div className="tv-sheet-backdrop" onClick={onClose} />
      <div
        className={`tv-sheet-pos${dragging ? " is-dragging" : ""}`}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div
          ref={sheetRef}
          className="tv-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-sheet-title"
          onAnimationEnd={onAnimationEnd}
        >
          <div
            className="tv-sheet-grab"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="tv-sheet-handle" />
            <div className="tv-sheet-head">
              {/* Back to the menu: a square arrow button at the start of the head (it stops the drag from starting). */}
              {step !== "menu" && (
                <button
                  type="button"
                  className="tv-sheet-back"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => goTo("menu")}
                  disabled={busy}
                  aria-label="Atrás"
                >
                  <Icon name="back" size={24} strokeWidth={2.6} />
                </button>
              )}
              <span className={`tv-badge tv-c-${mode?.color || "yellow"}`}>
                <Icon name={mode?.icon || "play"} size={26} />
              </span>
              <div>
                <p className="tv-sheet-kicker">{mode?.name || "Jugar"}</p>
                <h2 id="tv-sheet-title" className="tv-sheet-title">{TITLES[step]}</h2>
              </div>
            </div>
          </div>

          <div className="tv-sheet-body">
            {step === "menu" && (
              <nav className="tv-sheet-options tv-pm-list" aria-label="Formas de jugar">
                {PLAY_KINDS.map((k, i) => {
                  const expanded = kind === k.id;
                  const match = k.id !== "privada";
                  return (
                    <div
                      key={k.id}
                      className={`tv-pm${expanded ? " is-open" : ""}${kind && !expanded ? " is-dim" : ""}`}
                      style={{ "--i": i }}
                    >
                      <button
                        type="button"
                        className={`tv-option tv-pm-head tv-c-${k.color}`}
                        aria-expanded={expanded}
                        aria-controls={`tv-pm-${k.id}`}
                        onClick={() => setKind((cur) => (cur === k.id ? null : k.id))}
                        disabled={busy}
                      >
                        <span className={`tv-badge tv-c-${k.color}`}>
                          <Icon name={k.icon} size={24} filled={k.icon !== "lock"} strokeWidth={k.icon === "lock" ? 2.4 : 1.6} />
                        </span>
                        <span className="tv-option-text">
                          <strong>{k.name}</strong>
                          <span>{k.blurb}</span>
                        </span>
                        <Icon name="chevron" size={22} className="tv-option-chevron" />
                      </button>
                      <div id={`tv-pm-${k.id}`} className="tv-pm-panel" ref={inertUnless(expanded)}>
                        <div className="tv-pm-inner">
                          {match ? (
                            <div className="tv-pm-body">
                              <div className="tv-pm-facts">
                                <span className="tv-pm-games" aria-label="Trivia, Rango y Campo de minas">
                                  {MATCH_GAMES.map((id) => {
                                    const m = findMode(id);
                                    return (
                                      <span key={id} className={`tv-pm-game tv-c-${m.color}`}>
                                        <Icon name={m.icon} size={15} strokeWidth={2.4} />
                                      </span>
                                    );
                                  })}
                                </span>
                                <span className="tv-pm-detail">{k.detail}</span>
                              </div>
                              <Segmented
                                label="Rondas"
                                value={rounds}
                                onChange={setRounds}
                                options={MATCH_ROUNDS.map((n) => ({
                                  value: n,
                                  label: (
                                    <span className="tv-pm-round">
                                      <b>{n} rondas</b>
                                      <small>{gamesText(n)}</small>
                                    </span>
                                  ),
                                }))}
                              />
                              <Segmented
                                label="Jugadores"
                                value={size}
                                onChange={setSize}
                                options={MATCH_SIZES.map((o) => ({
                                  value: o.value,
                                  label: (
                                    <span className="tv-pm-round">
                                      <b>{o.label}</b>
                                      <small>{o.hint}</small>
                                    </span>
                                  ),
                                }))}
                              />
                              <button
                                type="button"
                                className={`tv-btn tv-btn--block tv-c-${k.color} tv-shine tv-pm-go`}
                                data-sound={!user?.name || user.isGuest ? undefined : "none"}
                                onClick={() => run({ type: "match", kind: k.id, rounds, size })}
                                disabled={busy}
                              >
                                <Icon name="play" size={18} filled strokeWidth={1.5} />
                                {busy ? "Buscando…" : "Buscar partida"}
                              </button>
                            </div>
                          ) : (
                            <div className="tv-pm-body tv-pm-private">
                              <button
                                type="button"
                                className="tv-option tv-pm-sub"
                                data-sound={!user?.name || user.isGuest ? undefined : "none"}
                                onClick={() => run({ type: "create" })}
                                disabled={busy}
                              >
                                <span className="tv-badge tv-c-violet">
                                  <Icon name="users" size={20} />
                                </span>
                                <span className="tv-option-text">
                                  <strong>{busy ? "Creando sala…" : "Crear sala"}</strong>
                                  <span>{mode ? "Juega solo o invita a tus amigos" : "Invita a tus amigos y elijan el juego"}</span>
                                </span>
                                <Icon name="chevron" size={20} className="tv-option-chevron" />
                              </button>
                              <button type="button" className="tv-option tv-pm-sub" onClick={() => goTo("code")} disabled={busy}>
                                <span className="tv-badge tv-c-coral">
                                  <Icon name="hash" size={20} />
                                </span>
                                <span className="tv-option-text">
                                  <strong>Tengo un código</strong>
                                  <span>Entra a la sala de un amigo</span>
                                </span>
                                <Icon name="chevron" size={20} className="tv-option-chevron" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </nav>
            )}

            {step === "code" && (
              <form className="tv-sheet-form" onSubmit={submitCode}>
                <label className="tv-sr-only" htmlFor="tv-code">
                  Código de sala
                </label>
                <input
                  ref={codeRef}
                  id="tv-code"
                  className="tv-field tv-field--code"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? "tv-sheet-error" : undefined}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH));
                    setError("");
                  }}
                  placeholder="YOAVH"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                />
                <button type="submit" className="tv-btn tv-btn--block tv-c-yellow" data-sound="none" disabled={busy || code.length < ROOM_CODE_LENGTH}>
                  Entrar a la sala
                </button>
              </form>
            )}

            {step === "name" && (
              <form className="tv-sheet-form" onSubmit={submitName}>
                {/* The avatar beside the name box, and its colours in a row under both, as wide as the sheet. */}
                <div className="tv-name-row">
                  <Avatar name={name.trim() || "?"} avatar={color} className="tv-avatar--lg" />
                  <div className="tv-name-fields">
                    <label className="tv-sr-only" htmlFor="tv-name">
                      Tu nombre
                    </label>
                    <input
                      id="tv-name"
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
                <button type="submit" className="tv-btn tv-btn--block tv-c-yellow" data-sound="none" disabled={busy || !name.trim()}>
                  {busy ? "Entrando…" : "Continuar"}
                </button>
                {/* Without an account nothing is kept: one quiet line, with its two ways in. */}
                <div className="tv-sheet-account">
                  <span>Guarda tus puntos con una cuenta</span>
                  <span className="tv-sheet-account-links">
                    <Link to="/login" className="tv-sheet-account-btn is-main" onClick={onClose}>
                      Crear cuenta
                    </Link>
                    <Link to="/login?mode=login" className="tv-sheet-account-btn" onClick={onClose}>
                      Iniciar sesión
                    </Link>
                  </span>
                </div>
              </form>
            )}

            {error && (
              <p id="tv-sheet-error" className="tv-sheet-error" role="alert">
                {error}
              </p>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
