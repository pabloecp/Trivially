import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// A small modal that asks before something that can't be taken back, in the Jugar sheet's look (a card in the middle
// on wide screens, a sheet from the bottom on phones). Focus starts on the safe answer, `cancelLabel`; Escape and a
// tap outside answer it too.
export default function ConfirmDialog({ open, title, text, icon = "logout", cancelLabel, confirmLabel, onCancel, onConfirm }) {
  const [mounted, setMounted] = useState(open);
  const sheetRef = useRef(null);
  const cancelRef = useRef(null);
  // The parent re-renders about once a second during a match: the keyboard handler must not be rebuilt (and the focus
  // moved back to the safe answer) every time.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return undefined;
    cancelRef.current?.focus({ preventScroll: true });

    function onKey(e) {
      if (e.key === "Escape") {
        onCancelRef.current();
      } else if (e.key === "Tab") {
        // Focus stays on the two buttons.
        const items = sheetRef.current.querySelectorAll("button");
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
  }, [open, mounted]);

  if (!mounted) return null;

  function onAnimationEnd(e) {
    if (!open && e.target === e.currentTarget) setMounted(false);
  }

  return (
    <div className={`tv-sheet-root ${open ? "is-open" : "is-closing"}`}>
      <div className="tv-sheet-backdrop" onClick={onCancel} />
      <div className="tv-sheet-pos tv-sheet-pos--sm">
        <div
          ref={sheetRef}
          className="tv-sheet tv-sheet--confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="tv-confirm-title"
          aria-describedby="tv-confirm-text"
          onAnimationEnd={onAnimationEnd}
        >
          <div className="tv-sheet-head">
            <span className="tv-badge tv-badge--bad">
              <Icon name={icon} size={26} />
            </span>
            <h2 id="tv-confirm-title" className="tv-sheet-title">{title}</h2>
          </div>
          <p id="tv-confirm-text" className="tv-confirm-text">{text}</p>
          <div className="tv-confirm-actions">
            <button ref={cancelRef} type="button" className="tv-btn tv-c-neutral" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className="tv-btn tv-btn--bad" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
