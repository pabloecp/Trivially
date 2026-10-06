import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AVATAR_COLORS, useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

const DISMISS_DISTANCE = 90;
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";
const TITLES = {
  menu: "¿Cómo quieres jugar?",
  code: "Escribe el código",
  name: "¿Cómo te llamas?",
};

// Bottom sheet to create or join a room. With `mode`, a new room goes straight into that game; without it the
// room starts on Home so the host can pick. With `joinCode` (an invite link opened by someone with no name yet)
// it asks for a name and then joins that room.
export default function PlaySheet({ mode, joinCode, open, onClose }) {
  const { user, saveGuest, createRoom, joinRoom } = useApp();
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

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDragY(0);
      setBusy(false);
      setError("");
      setCode(joinCode || "");
      setPending(joinCode ? { type: "join", code: joinCode } : null);
      setStep(joinCode ? "name" : "menu");
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
    if (!user?.name) {
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
      if (action.type === "create") await createRoom("multi", {}, mode?.id ?? null);
      else await joinRoom(action.code);
      onClose(); // the room navigator takes the player wherever the room is
    } catch (err) {
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
      await saveGuest(name, color);
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

  function submitCode(e) {
    e.preventDefault();
    if (code.length < 4) return;
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
              <span className={`tv-badge tv-c-${mode?.color || "yellow"}`}>
                <Icon name={mode?.icon || "users"} size={26} />
              </span>
              <div>
                <p className="tv-sheet-kicker">{mode?.name || "Multijugador"}</p>
                <h2 id="tv-sheet-title" className="tv-sheet-title">{TITLES[step]}</h2>
              </div>
            </div>
          </div>

          <div className="tv-sheet-body">
            {step === "menu" && (
              <nav className="tv-sheet-options" aria-label="Formas de jugar">
                <button
                  type="button"
                  className="tv-option"
                  style={{ "--i": 0 }}
                  onClick={() => run({ type: "create" })}
                  disabled={busy}
                >
                  <span className="tv-badge tv-c-pink">
                    <Icon name="users" size={24} />
                  </span>
                  <span className="tv-option-text">
                    <strong>{busy ? "Creando sala…" : "Crear sala"}</strong>
                    <span>{mode ? "Juega solo o invita a tus amigos" : "Invita a tus amigos y elijan modo de juego"}</span>
                  </span>
                  <Icon name="chevron" size={22} className="tv-option-chevron" />
                </button>
                <button
                  type="button"
                  className="tv-option"
                  style={{ "--i": 1 }}
                  onClick={() => goTo("code")}
                  disabled={busy}
                >
                  <span className="tv-badge tv-c-blue">
                    <Icon name="hash" size={24} />
                  </span>
                  <span className="tv-option-text">
                    <strong>Tengo un código</strong>
                    <span>Entra a la sala de un amigo</span>
                  </span>
                  <Icon name="chevron" size={22} className="tv-option-chevron" />
                </button>
              </nav>
            )}

            {step === "code" && (
              <form className="tv-sheet-form" onSubmit={submitCode}>
                <label className="tv-sr-only" htmlFor="tv-code">
                  Código de sala
                </label>
                <input
                  id="tv-code"
                  className="tv-field tv-field--code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
                    setError("");
                  }}
                  placeholder="XOTRIV"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                />
                <button type="submit" className="tv-btn tv-btn--block tv-c-yellow" disabled={busy || code.length < 4}>
                  {busy ? "Entrando…" : "Entrar a la sala"}
                </button>
              </form>
            )}

            {step === "name" && (
              <form className="tv-sheet-form" onSubmit={submitName}>
                <div className="tv-name-row">
                  <Avatar name={name.trim() || "?"} avatar={color} className="tv-avatar--lg" />
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
                    maxLength={20}
                    autoComplete="nickname"
                  />
                </div>
                <div className="tv-swatches" role="group" aria-label="Color de tu avatar">
                  {AVATAR_COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      className="tv-swatch"
                      style={{ background: c }}
                      aria-pressed={color === c}
                      aria-label={`Color ${i + 1}`}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
                <button type="submit" className="tv-btn tv-btn--block tv-c-yellow" disabled={busy || !name.trim()}>
                  {busy ? "Entrando…" : "Continuar"}
                </button>
                <p className="tv-sheet-note">
                  ¿Tienes cuenta? <Link to="/login">Inicia sesión</Link> para guardar tus puntos.
                </p>
              </form>
            )}

            {error && (
              <p className="tv-sheet-error" role="alert">
                {error}
              </p>
            )}

            {step !== "menu" && (
              <button type="button" className="tv-link-btn" onClick={() => goTo("menu")} disabled={busy}>
                <Icon name="back" size={18} />
                Atrás
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
