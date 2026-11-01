import { useEffect, useRef, useState } from "react";
import { useFriends } from "../../lib/friends.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

// What the leader's friends can do from the friends tab, and what each choice means.
const MODES = [
  { value: "abierta", label: "Unirse", hint: "Entran directo" },
  { value: "solicitud", label: "Pedir entrar", hint: "Te piden permiso" },
  { value: "invitacion", label: "Solo invitación", hint: "Solo con el código" },
];

// In "Tu sala", for its leader (when their account has friends): one line, "Tus amigos pueden: Pedir entrar ▾", whose
// menu changes what their friends can do from the friends tab (join the group straight away, ask to join, or only by
// invitation), and the friends who are asking, to let in or turn down. It's set once and rarely touched, so it takes
// little room.
export default function FriendsRoomControls({ group, onToast }) {
  const friends = useFriends();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // The menu closes with a tap outside it or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!friends.isAccount) return null;
  const requests = group.joinRequests || [];
  const current = MODES.find((m) => m.value === (group.joinMode || "solicitud")) || MODES[1];

  async function setMode(mode) {
    setOpen(false);
    if (mode === current.value) return;
    try {
      await friends.setJoinMode(mode);
    } catch (err) {
      onToast?.(err.message || "No se pudo cambiar");
    }
  }

  async function answer(request, accept) {
    try {
      await friends.answerJoin(request.userId, accept);
      onToast?.(accept ? `${request.name} está entrando…` : `Rechazaste a ${request.name}`, accept ? "check" : "lock");
    } catch (err) {
      onToast?.(err.message || "No se pudo responder");
    }
  }

  return (
    <div className="tv-fr-room">
      {requests.map((r) => (
        <div key={r.userId} className="tv-fr-ask" role="group" aria-label={`${r.name} quiere unirse`}>
          <Avatar name={r.name} avatar={r.avatar} />
          <p className="tv-fr-ask-text">
            <strong>{r.name}</strong> quiere unirse
          </p>
          <button type="button" className="tv-btn tv-c-green" onClick={() => answer(r, true)}>
            Aceptar
          </button>
          <button type="button" className="tv-btn tv-c-neutral" onClick={() => answer(r, false)} aria-label={`Rechazar a ${r.name}`}>
            ×
          </button>
        </div>
      ))}
      <div className="tv-fr-mode" ref={rootRef}>
        {/* The whole row is the button: what it is on the left, the choice on the right. */}
        <button
          type="button"
          className={`tv-fr-mode-btn${open ? " is-open" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="tv-fr-mode-label">Tus amigos pueden</span>
          <span className="tv-fr-mode-value">
            {current.label}
            <Icon name="chevron" size={14} strokeWidth={2.8} className="tv-fr-mode-caret" />
          </span>
        </button>
        {open && (
          <ul className="tv-fr-mode-menu" role="listbox" aria-label="Qué pueden hacer tus amigos">
            {MODES.map((m) => (
              <li key={m.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.value === current.value}
                  className={`tv-fr-mode-option${m.value === current.value ? " is-on" : ""}`}
                  onClick={() => setMode(m.value)}
                >
                  <span>
                    <strong>{m.label}</strong>
                    <small>{m.hint}</small>
                  </span>
                  {m.value === current.value && <Icon name="check" size={16} strokeWidth={3} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
