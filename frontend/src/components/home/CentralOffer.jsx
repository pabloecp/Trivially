import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";

// Opening a room this account already plays in, from another device (the store's `centralOffer`): instead of joining,
// this device can be the room's central device, the screen that shows the match while the answers come from the
// phones. The host's account takes it straight away; anyone else asks the host and waits here for the answer. In the
// look of the confirm modals (a card in the middle on wide screens, a sheet from the bottom on phones).
export default function CentralOffer() {
  const { centralOffer, joinAsCentral, requestCentral, dismissCentralOffer } = useApp();
  // The last offer stays on screen while the sheet slides away.
  const [shown, setShown] = useState(centralOffer);
  const [mounted, setMounted] = useState(Boolean(centralOffer));
  const sheetRef = useRef(null);
  const open = Boolean(centralOffer);

  useEffect(() => {
    if (centralOffer) {
      setShown(centralOffer);
      setMounted(true);
    }
  }, [centralOffer]);

  useEffect(() => {
    if (!open || !mounted) return undefined;
    sheetRef.current?.querySelector("button:not([disabled])")?.focus({ preventScroll: true });
    function onKey(e) {
      if (e.key === "Escape") dismissCentralOffer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mounted, shown?.status]);

  if (!mounted || !shown) return null;

  function onAnimationEnd(e) {
    if (!open && e.target === e.currentTarget) setMounted(false);
  }

  const { isHost, hostName, status, error } = shown;
  const busy = status === "sending";
  let title = "Ya estás jugando en esta sala";
  let text = isHost
    ? "Tu cuenta juega en esta sala desde otro dispositivo. Puedes usar este como dispositivo central: mostrará las preguntas, los sonidos y el marcador, y tú respondes desde el otro."
    : `Tu cuenta juega en esta sala desde otro dispositivo. Puedes pedirle a ${hostName} usar este como dispositivo central: mostrará las preguntas, los sonidos y el marcador, y tú respondes desde el otro.`;
  let actions;
  if (status === "waiting") {
    title = `Esperando a ${hostName}`;
    text = `Le pediste a ${hostName} usar este dispositivo como central. En cuanto acepte, aquí se verá la partida.`;
    actions = (
      <button type="button" className="tv-btn tv-c-neutral" data-sound="back" onClick={dismissCentralOffer}>
        Cancelar
      </button>
    );
  } else if (status === "denied") {
    title = "No pudo ser";
    text = error || `${hostName} no aceptó este dispositivo como central.`;
    actions = (
      <button type="button" className="tv-btn tv-c-neutral" data-sound="back" onClick={dismissCentralOffer}>
        Cerrar
      </button>
    );
  } else {
    actions = (
      <>
        <button type="button" className="tv-btn tv-c-neutral" data-sound="back" onClick={dismissCentralOffer} disabled={busy}>
          Ahora no
        </button>
        <button type="button" className="tv-btn tv-c-violet" onClick={isHost ? joinAsCentral : requestCentral} disabled={busy}>
          {busy ? (isHost ? "Entrando…" : "Enviando…") : isHost ? "Entrar como dispositivo central" : "Pedir ser dispositivo central"}
        </button>
      </>
    );
  }

  return createPortal(
    <div className={`tv-sheet-root tv-central-offer ${open ? "is-open" : "is-closing"}`}>
      <div className="tv-sheet-backdrop" onClick={dismissCentralOffer} />
      <div className="tv-sheet-pos tv-sheet-pos--sm">
        <div
          ref={sheetRef}
          className="tv-sheet tv-sheet--confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-central-offer-title"
          aria-describedby="tv-central-offer-text"
          onAnimationEnd={onAnimationEnd}
        >
          <div className="tv-sheet-head">
            <span className="tv-badge tv-c-violet">
              <Icon name="tv" size={26} />
            </span>
            <h2 id="tv-central-offer-title" className="tv-sheet-title">
              {title}
            </h2>
          </div>
          <p id="tv-central-offer-text" className="tv-confirm-text" aria-live="polite">
            {status === "waiting" && <span className="tv-pulse" aria-hidden="true" />}
            {text}
          </p>
          {error && status === "offer" && (
            <p className="tv-sheet-error" role="alert">
              {error}
            </p>
          )}
          <div className={`tv-confirm-actions${status === "waiting" || status === "denied" ? " is-single" : ""}`}>{actions}</div>
        </div>
      </div>
    </div>,
    // Outside the screen on show, which a change of page replaces: it sets the site's letter and colour itself.
    document.body
  );
}
