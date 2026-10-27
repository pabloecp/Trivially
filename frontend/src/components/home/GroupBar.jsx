import { findMode } from "../../modes/index.js";
import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

const FACES = 5;

// The bar at the bottom of Inicio and of the group's room: "Tu grupo" (its faces, yours ringed in yellow and first, "+"
// to invite, the group's code with a button to copy the invite link, and "Unirse" to go into another group's), then
// "Vas a jugar" (the game and who it's for; a tap opens "¿Qué quieren jugar?") and the screen's one yellow button
// (JUGAR, EMPEZAR; CANCELAR, grey, while searching). On phones the group's row, the box and the button go one under
// the other.
// `action` is { label, onClick, disabled, neutral }; without it (players waiting for the host) `note` takes its place.
export default function GroupBar({ members, meId, code = null, copied = false, onCopy, onInvite, inviteBadge = 0, onJoin, plan, planText, onPlan, planLocked = false, action = null, note = "", error = "" }) {
  const [codeHidden] = useHiddenCode();
  const mode = findMode(plan.game);
  const faces = [...members].sort((a, b) => (b.id === meId) - (a.id === meId));
  const shown = faces.slice(0, FACES);
  const more = faces.length - shown.length;

  return (
    <div className="tv-gbar" role="region" aria-label="Tu grupo y la partida">
      <div className="tv-gbar-group">
        <span className="tv-gbar-label">Tu grupo</span>
        <button type="button" className="tv-gbar-faces" onClick={onInvite} aria-label={`${members.length === 1 ? "1 persona" : `${members.length} personas`} en tu grupo`}>
          {shown.map((p) => (
            <Avatar key={p.id} name={p.name} avatar={p.avatar} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`.trim()} />
          ))}
          {more > 0 && <span className="tv-avatar tv-avatar--empty">+{more}</span>}
        </button>
        <button type="button" className="tv-iconbtn tv-iconbtn--sm" aria-label="Invitar a tu grupo" aria-haspopup="dialog" onClick={onInvite}>
          <Icon name="plus" size={18} strokeWidth={3} />
          {inviteBadge > 0 && <span className="tv-fr-badge">{inviteBadge}</span>}
        </button>
        {code && (
          <span className="tv-gbar-code">
            <span className={codeHidden ? "is-hidden" : ""}>{shownCode(code, codeHidden)}</span>
            <button type="button" className="tv-iconbtn tv-iconbtn--sm tv-iconbtn--quiet" aria-label={copied ? "Enlace copiado" : "Copiar el enlace de invitación"} onClick={onCopy}>
              <Icon name={copied ? "check" : "copy"} size={17} strokeWidth={2.6} />
            </button>
          </span>
        )}
        {onJoin && (
          <button type="button" className="tv-btn tv-btn--neutral tv-btn--sm tv-gbar-join" aria-haspopup="dialog" onClick={onJoin}>
            Unirse
          </button>
        )}
      </div>

      <div className="tv-gbar-play">
        <button type="button" className="tv-gbar-plan" aria-haspopup="dialog" onClick={onPlan} disabled={planLocked}>
          <span className={`tv-gbar-plan-icon tv-c-${mode?.color || "neutral"}`} aria-hidden="true">
            <Icon name={plan.audience === "publica" ? "globe" : mode?.icon || "grid"} size={20} strokeWidth={2.4} />
          </span>
          <span className="tv-gbar-plan-text">
            <small>Vas a jugar</small>
            <strong>{planText}</strong>
          </span>
          {!planLocked && <Icon name="chevron" size={18} strokeWidth={3} className="tv-gbar-plan-chevron" />}
        </button>
        {action ? (
          <button
            type="button"
            className={`tv-btn tv-btn--lg tv-gbar-go ${action.neutral ? "tv-btn--neutral" : "tv-btn--primary"}`}
            data-sound={action.sound}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ) : (
          <p className="tv-gbar-note">{note}</p>
        )}
      </div>
      {error && (
        <p className="tv-gbar-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
