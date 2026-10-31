import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";

// A big panel over the page ("¿Qué quieren jugar?", a game's "Ajustes", "Tu sala", "Unirse"): a dark card in the middle
// with the page darkened behind it, and on phones a sheet that takes the whole screen. It comes in and goes out whole,
// like every big panel (--tv-box-in / --tv-box-out). Escape, the X and a tap outside close it. `foot` is a row of
// buttons under what scrolls. While closed it stays mounted when `keep` is set (a game's settings send their summary
// to the card even with the panel closed), only hidden.
export default function Modal({ open, title, onClose, foot = null, size = "md", keep = false, className = "", children }) {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const cardRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      return undefined;
    }
    if (!shown) return undefined;
    setLeaving(true);
    const t = setTimeout(() => {
      setShown(false);
      setLeaving(false);
    }, 300);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (before instanceof HTMLElement) before.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!shown && !keep) return null;

  return createPortal(
    <div className={`tv-modal-root${shown ? "" : " is-hidden"}${leaving ? " is-leaving" : ""}`} hidden={!shown}>
      <div className="tv-modal-scrim" onClick={() => onCloseRef.current?.()} />
      <section
        ref={cardRef}
        className={`tv-modal tv-modal--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="tv-modal-head">
          <h2 id={titleId} className="tv-modal-title">
            {title}
          </h2>
          <button type="button" className="tv-iconbtn" aria-label="Cerrar" data-sound="back" onClick={() => onCloseRef.current?.()}>
            <Icon name="close" size={20} strokeWidth={2.8} />
          </button>
        </header>
        <div className="tv-modal-body">{children}</div>
        {foot && <footer className="tv-modal-foot">{foot}</footer>}
      </section>
    </div>,
    // Inside the app, so its styles (and the site's font) reach what's in it.
    document.querySelector(".tv-app") || document.body
  );
}
