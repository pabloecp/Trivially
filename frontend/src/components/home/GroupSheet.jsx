import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import PartyPanel from "./PartyPanel.jsx";
import { useInvite } from "./useInvite.js";

// "Tu grupo", from the group's bar ("+" or the faces): the group's code with "Copiar código" and "Copiar enlace", then
// everyone in it (each with their menu: host, settings permission, kick…), your friends online to invite and the chat
// (PartyPanel's).
export default function GroupSheet({ open, onClose, room, onToast }) {
  const [codeHidden, toggleCode] = useHiddenCode();
  const link = useInvite(room?.code, onToast);
  const code = useInvite(room?.code, onToast, { what: "code" });
  if (!room) return null;

  return (
    <Modal open={open} onClose={onClose} title="Tu grupo" size="md" className="tv-groupsheet">
      <div className="tv-codebox">
        <div className="tv-codebox-head">
          <span className="tv-section-label">Código del grupo</span>
          {/* Hides the code on this device's screens, for streaming. */}
          <button
            type="button"
            className={`tv-textbtn${codeHidden ? " is-on" : ""}`}
            onClick={toggleCode}
            aria-pressed={codeHidden}
            aria-label={codeHidden ? "Mostrar el código" : "Ocultar el código"}
          >
            <Icon name={codeHidden ? "eye-off" : "eye"} size={16} strokeWidth={2.4} />
            {codeHidden ? "Oculto" : "Ocultar"}
          </button>
        </div>
        <p className={`tv-codebox-code${codeHidden ? " is-hidden" : ""}`}>{shownCode(room.code, codeHidden)}</p>
        <div className="tv-codebox-actions">
          <button type="button" className="tv-btn tv-btn--neutral" onClick={code.copy}>
            <Icon name={code.copied ? "check" : "copy"} size={18} strokeWidth={2.6} />
            {code.copied ? "¡Copiado!" : "Copiar código"}
          </button>
          <button type="button" className="tv-btn tv-btn--neutral" onClick={link.copy}>
            <Icon name={link.copied ? "check" : "link"} size={18} strokeWidth={2.6} />
            {link.copied ? "¡Copiado!" : "Copiar enlace"}
          </button>
        </div>
      </div>
      <PartyPanel room={room} onToast={onToast} group className="tv-party--sheet" />
    </Modal>
  );
}
