import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/store.jsx";
import { play } from "../../lib/sounds.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import "../../styles/central.css";

// For the host, on every screen (the room, a match, its results): the players asking to use another device of theirs
// as the room's central device, each as a card pinned under the top bar with Aceptar and an X to turn it down. A new
// one sounds once. The room's column would hide them on a phone, and during a match.
export default function CentralRequests() {
  const { user, room, isCentral, answerCentralRequest } = useApp();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const isHost = Boolean(room) && !isCentral && room.hostId === user?.id;
  const requests = isHost ? room.centralRequests || [] : [];
  const seen = useRef(new Set());

  useEffect(() => {
    const fresh = requests.filter((r) => !seen.current.has(r.id));
    fresh.forEach((r) => seen.current.add(r.id));
    if (fresh.length) play("next");
  }, [requests.map((r) => r.id).join(",")]);

  useEffect(() => {
    if (!err) return undefined;
    const t = setTimeout(() => setErr(""), 3000);
    return () => clearTimeout(t);
  }, [err]);

  if (!requests.length) return null;

  async function answer(request, accept) {
    setBusy(request.id);
    try {
      await answerCentralRequest(request.id, accept);
    } catch (e) {
      setErr(e.message || "No se pudo responder");
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div className="tv-central-requests" role="region" aria-label="Solicitudes de dispositivo central">
      {requests.map((r) => (
        <div key={r.id} className="tv-central-request" role="group" aria-label={`Solicitud de ${r.name}`}>
          <span className="tv-central-request-face">
            <Avatar name={r.name} avatar={r.avatar} />
            <span className="tv-central-spot-badge">
              <Icon name="tv" size={11} strokeWidth={3} />
            </span>
          </span>
          <p>
            <strong>{r.name}</strong> quiere usar otro dispositivo como pantalla central
          </p>
          <span className="tv-central-request-actions">
            <button type="button" className="tv-btn tv-btn--sm tv-c-green" onClick={() => answer(r, true)} disabled={busy === r.id}>
              Aceptar
            </button>
            <button
              type="button"
              className="tv-central-request-no"
              data-sound="back"
              onClick={() => answer(r, false)}
              disabled={busy === r.id}
              aria-label={`Rechazar la solicitud de ${r.name}`}
            >
              <Icon name="close" size={16} strokeWidth={3} />
            </button>
          </span>
        </div>
      ))}
      {err && (
        <p className="tv-central-requests-error" role="alert">
          {err}
        </p>
      )}
    </div>,
    // Outside the screen on show, which a change of page replaces: it sets the site's letter and colour itself.
    document.body
  );
}
