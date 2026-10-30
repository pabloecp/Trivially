import { useRef, useState } from "react";
import { findMode } from "../../modes/index.js";
import { useHiddenCode } from "../../lib/hiddenCode.js";
import { AUDIENCES } from "../../lib/plan.js";
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

// The bar at the bottom of Inicio and of a match's lobby, in three zones, each with its small label:
//  - TU GRUPO. Without a group, your Blob, "Juegas solo" (choosing a game makes your group: there's no "Crear grupo") and
//    "¿Te invitaron?" with the box for a friend's code ("Unirse"). With one, its faces (yours ringed in yellow and
//    first, dimmed whoever isn't with it now; a tap opens "Tu grupo"), who decides, its code with "Copiar", "Invitar"
//    and the red "Salir del grupo" (the screen asks first: `onLeave` is only the question).
//  - PARTIDA. "Pública" / "Privada" (`onAudience`; read-only without it) and "Vas a jugar" (the game's own card,
//    `.tv-gcard`, the Clásico's in the logo's look, grey "Elige un juego" with no game; a tap opens "¿Qué quieren
//    jugar?"): the game is changed from here.
//  - The screen's one yellow button (JUGAR, EMPEZAR; CANCELAR, grey, while searching; JUGAR grey with a lock until a game
//    is chosen, `action.locked`), or `note` while someone else decides.
// On phones the zones go one under the other. `onJoin(code)` is false when the code didn't work; `canJoin` false while
// searching for a match. `groupError` is said under the group's zone, `error` under the button.
export default function GroupBar({ members = [], meId, inGroup = false, code = "", isLeader = false, canJoin = true, onGroup, onAudience = null, onJoin, onJoinEdit, onLeave, busy = false, inviteBadge = 0, plan, onPlan, planLocked = false, action = null, note = "", error = "", groupError = "" }) {
  const mode = plan.game ? findMode(plan.game) : null;
  const classic = mode?.kind === "classic";
  const faces = [...members].sort((a, b) => (b.id === meId) - (a.id === meId));
  const shown = faces.slice(0, FACES);
  const more = faces.length - shown.length;
  const shownError = groupError || error;
  // Your sala with only you in it: its code to share, "Invitar" (leaving it is the top bar's "Volver").
  const alone = inGroup && members.length <= 1;

  return (
    <div className="tv-gbar" role="region" aria-label="Tu grupo y la partida">
      <div className="tv-gbar-zone tv-gbar-zone--group">
        <span className="tv-gbar-cap">{alone ? "Tu sala · 1" : inGroup ? `Tu grupo · ${members.length}` : "Tu grupo"}</span>
        <div className="tv-gbar-box tv-gbar-group">
          {alone ? (
            <>
              <Avatar className="is-me" />
              <span className="tv-gbar-who">
                <b>Se creó tu sala</b>
                <span>Comparte el código para que entren</span>
              </span>
              <GroupCode code={code} wide />
              <button type="button" className="tv-btn tv-btn--neutral tv-gbar-invite" aria-haspopup="dialog" onClick={onGroup}>
                <Icon name="plus" size={17} strokeWidth={3} />
                Invitar
                {inviteBadge > 0 && <span className="tv-fr-badge">{inviteBadge}</span>}
              </button>
            </>
          ) : inGroup ? (
            <>
              <button type="button" className="tv-gbar-faces" onClick={onGroup} aria-label={`${members.length === 1 ? "1 persona" : `${members.length} personas`} en tu grupo`}>
                {shown.map((p) => (
                  <Avatar key={p.id} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`.trim()} />
                ))}
                {more > 0 && <span className="tv-avatar tv-avatar--empty">+{more}</span>}
              </button>
              <span className="tv-gbar-who">
                <b>{isLeader ? "Eres el líder" : "Estás en un grupo"}</b>
                <span>{isLeader ? "Tú eliges el juego" : "El líder elige el juego"}</span>
              </span>
              <GroupCode code={code} />
              <button type="button" className="tv-btn tv-btn--neutral tv-gbar-invite" aria-haspopup="dialog" onClick={onGroup}>
                <Icon name="plus" size={17} strokeWidth={3} />
                Invitar
                {inviteBadge > 0 && <span className="tv-fr-badge">{inviteBadge}</span>}
              </button>
              <button type="button" className="tv-btn tv-btn--bad tv-gbar-leave" data-sound="back" aria-label="Salir del grupo" onClick={onLeave} disabled={Boolean(busy)}>
                Salir<span className="tv-gbar-leave-more"> del grupo</span>
              </button>
            </>
          ) : (
            <>
              <Avatar className="is-me" />
              <span className="tv-gbar-who">
                <b>Juegas solo</b>
                <span>Al elegir un juego se crea tu sala</span>
              </span>
              <span className="tv-gbar-ask">¿Te invitaron?</span>
              <JoinField onJoin={onJoin} onEdit={onJoinEdit} disabled={!canJoin || Boolean(busy)} invalid={Boolean(groupError)} />
            </>
          )}
        </div>
      </div>

      <div className="tv-gbar-zone tv-gbar-zone--plan">
        <span className="tv-gbar-cap">Partida</span>
        <div className="tv-gbar-box tv-gbar-plan-row">
          <div className="tv-gbar-seg" role="group" aria-label="Para quién es la partida">
            {AUDIENCES.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`tv-gbar-seg-btn${plan.audience === a.value ? " is-on" : ""}`}
                aria-pressed={plan.audience === a.value}
                disabled={!onAudience || planLocked}
                onClick={() => plan.audience !== a.value && onAudience?.(a.value)}
              >
                <Icon name={a.value === "publica" ? "globe" : "lock"} size={16} strokeWidth={2.6} />
                {a.value === "publica" ? "Pública" : "Privada"}
              </button>
            ))}
          </div>
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
              <span className="tv-gcard-name">{mode?.name || "Elige un juego"}</span>
            </span>
            {!planLocked && <Icon name="chevron" size={18} strokeWidth={3} className="tv-gbar-plan-chevron" />}
          </button>
        </div>
      </div>

      <div className="tv-gbar-zone tv-gbar-zone--go">
        {action ? (
          <button
            type="button"
            className={`tv-btn tv-btn--lg tv-gbar-go ${action.neutral || action.locked ? "tv-btn--neutral" : "tv-btn--primary"}`}
            data-sound={action.sound}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.locked && <Icon name="lock" size={18} strokeWidth={2.6} />}
            {action.play && <Icon name="play" size={18} strokeWidth={2.6} filled />}
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

// The group's code on the bar, to share it, with "Copiar" (dots while codes are hidden, for streaming).
function GroupCode({ code, wide = false }) {
  const [codeHidden] = useHiddenCode();
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <span className="tv-gbar-code">
      <span className="tv-gbar-code-text" aria-label="Código del grupo">
        {codeHidden ? "•••••" : code}
      </span>
      {wide ? (
        <button type="button" className="tv-btn tv-btn--neutral tv-gbar-copy" onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </button>
      ) : (
        <button type="button" className="tv-iconbtn tv-iconbtn--sm tv-gbar-copy" aria-label={copied ? "Código copiado" : "Copiar código"} title={copied ? "Copiado" : "Copiar"} onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={17} strokeWidth={2.6} />
        </button>
      )}
    </span>
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
        placeholder="Código"
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
