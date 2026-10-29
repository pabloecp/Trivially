import { useRef, useState } from "react";
import { findMode } from "../../modes/index.js";
import { useHiddenCode } from "../../lib/hiddenCode.js";
import { audienceOf } from "../../lib/plan.js";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

const FACES = 5;
const CODE_LENGTH = 5;

// A group's code out of what was typed or pasted: the code itself, or its invite link (/grupo/CODE; /sala/CODE from
// older links).
function codeFrom(text) {
  const link = String(text).match(/\/(?:grupo|sala)\/([A-Za-z0-9]{5})/);
  return (link ? link[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

// The bar at the bottom of Inicio and of a match's lobby. On the left, without a group, "Crear grupo" (makes it straight
// away) and the box to join a friend's group with its code ("Unirse"); with one, the red "Salir del grupo" (the screen
// asks first, `onLeave` is only the question), then "Tu grupo" (its faces, yours ringed in yellow and first, dimmed
// whoever isn't with it now) and "+" to invite (the group's code is only in that window). On the right, one grey box
// with who the match is for ("Partida pública" or "Partida privada", with its icon, as plain text) and "Vas a jugar"
// (the game's own card, `.tv-gcard`, always the same width, the Clásico's in the logo's look; a tap opens "¿Qué quieren
// jugar?"), and the screen's one
// yellow button (JUGAR, EMPEZAR; CANCELAR, grey, while searching). On phones the group's side, the box and the button
// go one under the other.
// `action` is { label, onClick, disabled, neutral }; without it (waiting for the leader or the host) `note` takes its
// place. `onGroup` opens "Tu grupo"; `onCreate()`, `onJoin(code)` (false when the code didn't work) and `onLeave()` do
// what they say (`canCreate` false while searching for a match: no creating or joining then; `busy` is what is being
// done, "group" while creating it). `groupError` is said under the group's side, `error` under the button.
export default function GroupBar({ members = [], meId, inGroup = false, canCreate = true, onGroup, onCreate, onJoin, onJoinEdit, onLeave, busy = false, inviteBadge = 0, plan, onPlan, planLocked = false, action = null, note = "", error = "", groupError = "" }) {
  const mode = findMode(plan.game);
  const classic = mode?.kind === "classic";
  const audience = audienceOf(plan.audience);
  const faces = [...members].sort((a, b) => (b.id === meId) - (a.id === meId));
  const shown = faces.slice(0, FACES);
  const more = faces.length - shown.length;
  const shownError = groupError || error;

  return (
    <div className="tv-gbar" role="region" aria-label="Tu grupo y la partida">
      <div className="tv-gbar-group">
        {inGroup ? (
          <>
            <button type="button" className="tv-btn tv-btn--bad tv-gbar-leave" data-sound="back" aria-label="Salir del grupo" onClick={onLeave} disabled={Boolean(busy)}>
              <Icon name="logout" size={17} strokeWidth={2.4} />
              <span>
                Salir<span className="tv-gbar-leave-more"> del grupo</span>
              </span>
            </button>
            <span className="tv-gbar-label">Tu grupo</span>
            <button type="button" className="tv-gbar-faces" onClick={onGroup} aria-label={`${members.length === 1 ? "1 persona" : `${members.length} personas`} en tu grupo`}>
              {shown.map((p) => (
                <Avatar key={p.id} name={p.name} avatar={p.avatar} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`.trim()} />
              ))}
              {more > 0 && <span className="tv-avatar tv-avatar--empty">+{more}</span>}
            </button>
            <button type="button" className="tv-iconbtn tv-iconbtn--sm" aria-label="Invitar a tu grupo" aria-haspopup="dialog" onClick={onGroup}>
              <Icon name="plus" size={18} strokeWidth={3} />
              {inviteBadge > 0 && <span className="tv-fr-badge">{inviteBadge}</span>}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="tv-btn tv-btn--neutral tv-gbar-create" data-sound="none" onClick={onCreate} disabled={!canCreate || Boolean(busy)}>
              <Icon name="users" size={18} strokeWidth={2.6} />
              {busy === "group" ? "Creando…" : "Crear grupo"}
            </button>
            <JoinField onJoin={onJoin} onEdit={onJoinEdit} disabled={!canCreate || Boolean(busy)} invalid={Boolean(groupError)} />
          </>
        )}
      </div>

      <div className="tv-gbar-play">
        <div className="tv-gbar-plan-row">
          <span className="tv-gbar-audience">
            <Icon name={audience.icon} size={18} strokeWidth={2.6} />
            {audience.label}
          </span>
          <button type="button" className={`tv-gcard tv-gbar-plan ${classic ? "is-classic" : `tv-c-${mode?.color || "neutral"}`}`} aria-haspopup="dialog" onClick={onPlan} disabled={planLocked}>
            {classic ? (
              <AppIcon small />
            ) : (
              <>
                <Icon name={mode?.icon || "grid"} size={84} strokeWidth={1.6} className="tv-gcard-mark" />
                <span className="tv-gcard-badge" aria-hidden="true">
                  <Icon name={mode?.icon || "grid"} size={22} strokeWidth={2.4} />
                </span>
              </>
            )}
            <span className="tv-gcard-text">
              <span className="tv-gcard-sub">Vas a jugar</span>
              <span className="tv-gcard-name">{mode?.name}</span>
            </span>
            {!planLocked && <Icon name="chevron" size={18} strokeWidth={3} className="tv-gbar-plan-chevron" />}
          </button>
        </div>
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
      {shownError && (
        <p className={`tv-gbar-error${groupError ? " tv-gbar-error--group" : ""}`} role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}

// "Unirse": the code of a friend's group (or its invite link pasted) in one box ("Código del grupo" as its placeholder)
// and the white button. A code that opens no group rings the box in red and shakes it (`invalid`, the message is the bar's).
// Hidden codes (for streaming) show as dots.
function JoinField({ onJoin, onEdit, disabled, invalid }) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [codeHidden] = useHiddenCode();
  const boxRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (code.length < CODE_LENGTH || joining || disabled) return;
    setJoining(true);
    const ok = await onJoin(code);
    setJoining(false);
    if (ok === false) {
      boxRef.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
        { duration: 320, easing: "ease-out" }
      );
    }
  }

  return (
    <form ref={boxRef} className="tv-gbar-join" onSubmit={submit}>
      <input
        className={`tv-gbar-join-input${codeHidden ? " is-hidden" : ""}`}
        value={code}
        onChange={(e) => {
          setCode(codeFrom(e.target.value));
          onEdit?.();
        }}
        placeholder="Código del grupo"
        aria-label="Código del grupo de un amigo"
        aria-invalid={invalid || undefined}
        disabled={disabled && !joining}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck="false"
      />
      <button type="submit" className="tv-btn tv-btn--white tv-gbar-join-go" data-sound="none" disabled={disabled || joining || code.length < CODE_LENGTH}>
        {joining ? "Entrando…" : "Unirse"}
      </button>
    </form>
  );
}
