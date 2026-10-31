import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findMode } from "../../modes/index.js";
import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";
import { AUDIENCES } from "../../lib/plan.js";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";
import { codeFromText, useInvite } from "./useInvite.js";

const FACES = 5;
const CODE_LENGTH = 5;

// The bar at the bottom of Inicio and of a match's lobby, in three zones, each with its small label:
//  - TU GRUPO. Without a group, your Blob, "Juegas solo" (choosing a game makes your group: there's no "Crear grupo") and
//    "¿Te invitaron?" with the box for a friend's code ("Unirse"). With one, its faces (yours ringed in yellow and
//    first, dimmed whoever isn't with it now; a tap opens "Tu sala"), who decides, its code with "Copiar", "Invitar"
//    and the red "Salir de la sala" (the screen asks first: `onLeave` is only the question).
//  - PARTIDA. "Pública" / "Privada" (`onAudience`; read-only without it) and "Vas a jugar" (the game's own card,
//    `.tv-gcard`, the Clásico's in the logo's look, grey "Elige un juego" with no game; a tap opens "¿Qué quieren
//    jugar?"): the game is changed from here.
//  - The screen's one yellow button (JUGAR, public or private; CANCELAR, grey, while searching; JUGAR grey with a lock until a game
//    is chosen, `action.locked`), or `note` while someone else decides.
// On phones TU GRUPO goes up to the top bar, very short (SalaMenu: the faces and how many, a tap opens the whole zone like
// the volume's panel; beside them the sala's code, a tap copies it), and the rest stays at the foot of the screen, always
// in sight: "Pública" / "Privada" (only their icons) with "Vas a jugar", and the yellow button under them. `onJoin(code)` is false when the code didn't work; `canJoin` false while
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

  // Your Blob in your colour.
  const myAvatar = useApp().user?.avatar;
  const phone = useNarrow();
  const cap = alone ? "Tu sala · 1" : inGroup ? `Tu sala · ${members.length}` : "Tu sala";
  const groupBox = (
        <div className="tv-gbar-box tv-gbar-group">
          {alone ? (
            <>
              <Avatar className="is-me" avatar={myAvatar} />
              <GroupCode code={code} wide />
              <button type="button" className="tv-btn tv-btn--neutral tv-gbar-invite" aria-haspopup="dialog" onClick={onGroup}>
                <Icon name="plus" size={17} strokeWidth={3} />
                Invitar
                {inviteBadge > 0 && <span className="tv-fr-badge">{inviteBadge}</span>}
              </button>
            </>
          ) : inGroup ? (
            <>
              <button type="button" className="tv-gbar-faces" onClick={onGroup} aria-label={`${members.length === 1 ? "1 persona" : `${members.length} personas`} en tu sala`}>
                {shown.map((p) => (
                  <Avatar key={p.id} avatar={p.avatar} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`.trim()} />
                ))}
                {more > 0 && <span className="tv-avatar tv-avatar--empty">+{more}</span>}
              </button>
              <GroupCode code={code} />
              <button type="button" className="tv-btn tv-btn--neutral tv-gbar-invite" aria-haspopup="dialog" onClick={onGroup}>
                <Icon name="plus" size={17} strokeWidth={3} />
                Invitar
                {inviteBadge > 0 && <span className="tv-fr-badge">{inviteBadge}</span>}
              </button>
              <button type="button" className="tv-iconbtn tv-iconbtn--sm tv-gbar-leave" data-sound="back" aria-label="Salir de la sala" title="Salir de la sala" onClick={onLeave} disabled={Boolean(busy)}>
                <Icon name="logout" size={17} strokeWidth={2.6} />
              </button>
            </>
          ) : (
            <>
              <Avatar className="is-me" avatar={myAvatar} />
              <JoinField onJoin={onJoin} onEdit={onJoinEdit} disabled={!canJoin || Boolean(busy)} invalid={Boolean(groupError)} />
            </>
          )}
        </div>
  );

  return (
    <div className="tv-gbar" role="region" aria-label="Tu sala y la partida">
      {phone ? (
        <SalaMenu members={shown} count={members.length} inGroup={inGroup} code={code} meId={meId} onGroup={onGroup} cap={inGroup ? cap : "Unirse a una sala"} badge={inviteBadge} error={groupError}>
          {inGroup ? (
            groupBox
          ) : (
            // No game chosen means no sala yet: here only the way into a friend's.
            <div className="tv-gbar-box tv-gbar-group">
              <span className="tv-sala-hint">Escribe el código o pega el enlace de la sala de un amigo. Si eliges un juego, se crea la tuya.</span>
              <JoinField onJoin={onJoin} onEdit={onJoinEdit} disabled={!canJoin || Boolean(busy)} invalid={Boolean(groupError)} />
            </div>
          )}
        </SalaMenu>
      ) : (
        <div className="tv-gbar-zone tv-gbar-zone--group">
          <span className="tv-gbar-cap">{cap}</span>
          {groupBox}
        </div>
      )}

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
                aria-label={a.value === "publica" ? "Partida pública" : "Partida privada"}
                title={a.value === "publica" ? "Partida pública" : "Partida privada"}
                disabled={!onAudience || planLocked}
                onClick={() => plan.audience !== a.value && onAudience?.(a.value)}
              >
                <Icon name={a.value === "publica" ? "globe" : "lock"} size={16} strokeWidth={2.6} />
                {/* Phones show only the icon (look.css): the button still says which it is. */}
                <span className="tv-gbar-seg-label">{a.value === "publica" ? "Pública" : "Privada"}</span>
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
            className={`tv-btn tv-btn--lg tv-gbar-go ${action.neutral || action.locked ? "tv-btn--neutral" : "tv-btn--primary"}${action.waiting ? " is-waiting" : ""}`}
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
      {(phone ? error : shownError) && (
        <p className={`tv-gbar-error${groupError ? " tv-gbar-error--group" : ""}`} role="alert">
          {phone ? error : shownError}
        </p>
      )}
    </div>
  );
}

// Whether the screen is as narrow as a phone's (where the bar's zones split up, look.css).
export function useNarrow() {
  const query = "(max-width: 760px)";
  const [narrow, setNarrow] = useState(() => Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const onChange = () => setNarrow(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

// Phones: your sala in the top bar (its slot, `.tv-topbar-sala` in TvTopbar), very short: its faces (yours first) and how
// many are in it, whose tap opens "Tu sala" (GroupSheet, `onGroup`: the code, who is in it, "Salir de la sala"). Without
// one (no game chosen yet, so no sala) it's only "Unirse", for a friend's code, whose tap opens a small panel under it
// like the volume's; a tap outside or Escape closes it. A code that didn't work (`error`) is said in it.
function SalaMenu({ members, count, inGroup, code, meId, onGroup, cap, badge, error, children }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    setSlot(document.querySelector(".tv-topbar-sala"));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!slot) return null;
  return createPortal(
    <div className="tv-sala" ref={rootRef}>
      <button
        type="button"
        className="tv-chip tv-chip--sala"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={inGroup ? `${cap}: ver tu sala` : "Unirse a la sala de un amigo"}
        onClick={() => (inGroup ? onGroup?.() : setOpen((v) => !v))}
      >
        {inGroup ? (
          <>
            <span className="tv-sala-faces">
              {members.slice(0, 3).map((p) => (
                <Avatar key={p.id} avatar={p.avatar} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`.trim()} />
              ))}
            </span>
            {count > 1 && <b className="tv-sala-count">{count}</b>}
          </>
        ) : (
          <>
            <Icon name="link" size={18} strokeWidth={2.6} />
            <span className="tv-chip-name">Unirse</span>
          </>
        )}
        <Icon name="chevron" size={14} strokeWidth={3} className={`tv-sala-chevron${open ? " is-open" : ""}`} />
        {badge > 0 && <span className="tv-fr-badge">{badge}</span>}
      </button>
      {inGroup && code && <SalaCode code={code} />}
      {open && (
        <div className="tv-sala-panel" role="dialog" aria-label={cap}>
          <span className="tv-gbar-cap">{cap}</span>
          {children}
          {error && (
            <p className="tv-gbar-error tv-gbar-error--group" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>,
    slot
  );
}

// Phones, in the top bar beside the sala's faces: its code with a link icon, always in sight; a tap copies the invite
// link (/sala/CODE, green for a moment). Dots while codes are hidden, for streaming (the real link is still copied).
function SalaCode({ code }) {
  const [codeHidden] = useHiddenCode();
  const { copied, copy } = useInvite(code);
  return (
    <button type="button" className={`tv-chip tv-chip--code${copied ? " is-copied" : ""}`} data-sound="none" aria-label={copied ? "Enlace copiado" : `Copiar el enlace de la sala, ${codeHidden ? "código oculto" : code}`} onClick={copy}>
      <Icon name={copied ? "check" : "link"} size={16} strokeWidth={2.6} />
      <span className="tv-chip-code">{shownCode(code, codeHidden)}</span>
      <span className="tv-sr-only" aria-live="polite">{copied ? "Enlace copiado" : ""}</span>
    </button>
  );
}

// The group's code on the bar, to share it, with "Copiar" (dots while codes are hidden, for streaming).
function GroupCode({ code, wide = false }) {
  const [codeHidden, toggleCode] = useHiddenCode();
  const { copied, copy } = useInvite(code);
  if (!code) return null;
  return (
    <span className="tv-gbar-code">
      <span className="tv-gbar-code-text" aria-label="Código de la sala">
        {shownCode(code, codeHidden)}
      </span>
      {/* Hides the code on this device's screens, for streaming. */}
      <button type="button" className={`tv-iconbtn${wide ? "" : " tv-iconbtn--sm"} tv-gbar-copy`} aria-pressed={codeHidden} aria-label={codeHidden ? "Mostrar el código" : "Ocultar el código"} title={codeHidden ? "Mostrar el código" : "Ocultar el código"} onClick={toggleCode}>
        <Icon name={codeHidden ? "eye-off" : "eye"} size={wide ? 22 : 17} strokeWidth={2.6} />
      </button>
      {wide ? (
        <button type="button" className="tv-iconbtn tv-gbar-copy" aria-label={copied ? "Enlace copiado" : "Copiar enlace de la sala"} title={copied ? "Copiado" : "Copiar enlace"} onClick={copy}>
          <Icon name={copied ? "check" : "link"} size={22} strokeWidth={2.6} />
        </button>
      ) : (
        <button type="button" className="tv-iconbtn tv-iconbtn--sm tv-gbar-copy" aria-label={copied ? "Enlace copiado" : "Copiar enlace de la sala"} title={copied ? "Copiado" : "Copiar"} onClick={copy}>
          <Icon name={copied ? "check" : "link"} size={17} strokeWidth={2.6} />
        </button>
      )}
    </span>
  );
}

// "Unirse": the code of a friend's group (or its invite link pasted) in one box ("Código de la sala" as its placeholder)
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
          setCode(codeFromText(e.target.value, CODE_LENGTH));
          onEdit?.();
        }}
        placeholder="Código"
        aria-label="Código de la sala de un amigo"
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
