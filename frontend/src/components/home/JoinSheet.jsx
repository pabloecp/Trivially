import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import { useHiddenCode } from "../../lib/hiddenCode.js";
import { withSound } from "../../lib/sounds.js";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";

const ROOM_CODE_LENGTH = 5;

// A room's code out of what was typed or pasted: the code itself, or the invite link (/sala/CODE).
export function codeFrom(text) {
  const link = String(text).match(/\/sala\/([A-Za-z0-9]{5})/);
  return (link ? link[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

// "Unirse", from the group's bar: another group's code (five cells over one box, the code or the invite link pasted)
// and "Entrar". The code is checked first, so a wrong one is said here and the cells shake. `onJoin(code)` goes in (the
// caller asks for a name first when there's none).
export default function JoinSheet({ open, onClose, onJoin }) {
  const { checkRoom } = useApp();
  const [code, setCode] = useState("");
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeHidden] = useHiddenCode();
  const cellsRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setError("");
    setBusy(false);
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (code.length < ROOM_CODE_LENGTH || busy) return;
    setBusy(true);
    setError("");
    try {
      await withSound(() => checkRoom(code), "next");
    } catch (err) {
      setError(err.message || "No hay ningún grupo con ese código");
      setBusy(false);
      cellsRef.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
        { duration: 320, easing: "ease-out" }
      );
      return;
    }
    try {
      await onJoin(code);
    } catch (err) {
      if (!err?.offer) setError(err?.message || "No pudimos entrar a ese grupo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Unirse a un grupo" size="sm">
      <form className="tv-joinform" onSubmit={submit}>
        <label className="tv-section-label" htmlFor="tv-join-code">
          Código del grupo
        </label>
        <div ref={cellsRef} className={`tv-codecells${focus ? " is-focus" : ""}`} aria-invalid={Boolean(error) || undefined}>
          <input
            ref={inputRef}
            id="tv-join-code"
            className="tv-codecells-input"
            value={code}
            onChange={(e) => {
              setCode(codeFrom(e.target.value));
              setError("");
            }}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
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
        <p className="tv-joinform-hint">Escribe el código que te pasaron o pega el enlace de invitación.</p>
        {error && (
          <p className="tv-sheet-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="tv-btn tv-btn--primary tv-btn--block" data-sound="none" disabled={busy || code.length < ROOM_CODE_LENGTH}>
          {busy ? "Entrando…" : "Entrar"}
          <Icon name="chevron" size={18} strokeWidth={3} />
        </button>
      </form>
    </Modal>
  );
}
