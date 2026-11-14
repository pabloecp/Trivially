import { useEffect, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";

import { translate as tr } from "../../lib/i18n.js";
// Opening a room this account already plays in, from another device (the store's `centralOffer`): instead of joining,
// this device can be the room's central device, the screen that shows the match while the answers come from the
// phones. The host's account takes it straight away; anyone else asks the host and waits here for the answer. In the
// same panel as every other one (Modal): what it is in one line, what it does in another, and its buttons at the foot.
export default function CentralOffer() {
  const { centralOffer, joinAsCentral, requestCentral, dismissCentralOffer } = useApp();
  // The last offer stays on screen while the panel goes out.
  const [shown, setShown] = useState(centralOffer);
  const open = Boolean(centralOffer);

  useEffect(() => {
    if (centralOffer) setShown(centralOffer);
  }, [centralOffer]);

  if (!shown) return null;

  const { isHost, hostName, status, error } = shown;
  const busy = status === "sending";
  let title = tr("Ya estás en esta partida");
  let text = isHost
    ? tr("Tu cuenta ya juega aquí desde otro dispositivo. Usa este como pantalla de la partida (preguntas, sonidos y marcador) y responde desde el otro.")
    : tr("Tu cuenta ya juega aquí desde otro dispositivo. Pídele a {hostName} usar este como pantalla de la partida (preguntas, sonidos y marcador) y responde desde el otro.", { hostName });
  let foot;
  if (status === "waiting") {
    title = tr("Esperando a {hostName}", { hostName });
    text = tr("Le pediste a {hostName} usar este dispositivo como central. En cuanto acepte, aquí se verá la partida.", { hostName: hostName });
    foot = (
      <button type="button" className="tv-btn tv-btn--neutral tv-central-offer-go" data-sound="back" onClick={dismissCentralOffer}>
        {tr("Cancelar")}
      </button>
    );
  } else if (status === "denied") {
    title = tr("No pudo ser");
    text = error || tr("{hostName} no aceptó este dispositivo como central.", { hostName: hostName });
    foot = (
      <button type="button" className="tv-btn tv-btn--neutral tv-central-offer-go" data-sound="back" onClick={dismissCentralOffer}>
        {tr("Cerrar")}
      </button>
    );
  } else {
    foot = (
      <>
        <button type="button" className="tv-btn tv-btn--neutral" data-sound="back" onClick={dismissCentralOffer} disabled={busy}>
          {tr("Ahora no")}
        </button>
        <button type="button" className="tv-btn tv-btn--primary tv-central-offer-go" onClick={isHost ? joinAsCentral : requestCentral} disabled={busy}>
          {busy ? (isHost ? "Entrando…" : "Enviando…") : isHost ? tr("Ser dispositivo central") : tr("Pedir ser dispositivo central")}
        </button>
      </>
    );
  }

  return (
    <Modal open={open} onClose={dismissCentralOffer} title={title} size="sm" className="tv-central-offer" foot={foot}>
      <p className="tv-central-offer-text" aria-live="polite">
        {status === "waiting" ? <span className="tv-pulse" aria-hidden="true" /> : <Icon name="tv" size={22} strokeWidth={2.4} />}
        <span>{text}</span>
      </p>
      {error && status === "offer" && (
        <p className="tv-sheet-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
