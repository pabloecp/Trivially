import { createContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { findMode } from "../../modes/index.js";
import { audienceName, audienceOf } from "../../lib/plan.js";
import { formatElo } from "../../lib/gameStats.js";
import { useApp } from "../../lib/store.jsx";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { useT } from "../../lib/i18n.js";

import { translate as tr } from "../../lib/i18n.js";
/** What the group's box beside the game's card (ModeStage's SocialBox) needs, from HomeFrame:
 *  `{ canCreate, busy, onInvite, onMakeGroup, onGroup, onLeave, inviteBadge }`. */
export const GroupBoxContext = createContext(null);

// The bar at the bottom of Inicio and of a match's lobby, in three zones, each with its small label:
//  - RETO DEL DÍA (DailyZone): today's challenge. The group is beside the game's card (ModeStage's SocialBox: you and
//    who is with you, "Invitar", and your friends online).
//  - PARTIDA. "Vas a jugar": the game's own card (`.tv-gcard`, the Clásico's in the logo's look, grey "Elige un juego"
//    in a private match with no game yet), with who it's for ("Partida pública" / "Partida privada") over the game's
//    name. A tap opens "¿Qué quieren jugar?": public or private and the game are both changed there, nowhere else.
//  - The screen's one yellow button (JUGAR, public or private; CANCELAR, red, while searching), or `note` while someone
//    else decides.
// On phones the challenge stays beside the card and a group, once there is one, goes up to the top bar, very short
// (GroupMenu: the faces and how many, a tap opens "Tu grupo"), and the rest stays at the foot of the screen, always in
// sight: "Vas a jugar", the whole width, and the yellow button under it.
export default function GroupBar({ members = [], meId, inGroup = false, onGroup, onInvite, onLeave, inviteOff = false, busy = "", inviteBadge = 0, plan, onPlan, planLocked = false, action = null, note = "" }) {
  const t = useT();
  const mode = plan.game ? findMode(plan.game) : null;
  const classic = mode?.kind === "classic";
  const { user } = useApp();
  const faces = [...members].sort((a, b) => (b.id === meId) - (a.id === meId));
  const phone = useNarrow();
  const cap = inGroup ? t("Tu grupo · {n}", { n: members.length }) : t("Tu grupo");

  return (
    <div className="tv-gbar" role="region" aria-label={t("Reto del día y la partida")}>
      {phone ? (
        <GroupMenu members={faces} count={members.length} inGroup={inGroup} meId={meId} myAvatar={user?.avatar} onGroup={onGroup} onInvite={onInvite} onLeave={onLeave} inviteOff={inviteOff} busy={busy} cap={cap} badge={inviteBadge} />
      ) : (
        <DailyZone daily={user?.daily} />
      )}

      <div className="tv-gbar-zone tv-gbar-zone--plan">
        <span className="tv-gbar-cap">{t("Partida")}</span>
        <div className="tv-gbar-box tv-gbar-plan-row">
          <button
            type="button"
            className={`tv-gcard tv-gbar-plan ${classic ? "is-classic" : `tv-c-${mode?.color || "neutral"}`}`}
            aria-haspopup="dialog"
            aria-label={`${audienceName(plan.audience)}: ${mode?.name ? t(mode.name) : t("elige un juego")}`}
            onClick={onPlan}
            disabled={planLocked}
          >
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
              {/* Who the match is for, changed in "¿Qué quieren jugar?" with the game. */}
              <span className="tv-gcard-sub tv-gbar-plan-aud">
                <Icon name={plan.audience === "publica" ? "globe" : "lock"} size={13} strokeWidth={2.8} />
                {audienceOf(plan.audience).short}
              </span>
              <span className="tv-gcard-name">{mode?.name ? t(mode.name) : t("Elige un juego")}</span>
            </span>
            {!planLocked && <Icon name="chevron" size={18} strokeWidth={3} className="tv-gbar-plan-chevron" />}
          </button>
        </div>
      </div>

      <div className="tv-gbar-zone tv-gbar-zone--go">
        {/* Hidden on phones and desktop alike: it only keeps the button level with the boxes beside it. */}
        <span className="tv-gbar-cap" aria-hidden="true">{t("Partida")}</span>
        {action ? (
          <button
            type="button"
            className={`tv-btn tv-btn--lg tv-gbar-go ${action.bad ? "tv-btn--bad" : action.neutral ? "tv-btn--neutral" : "tv-btn--primary"}${action.waiting ? " is-waiting" : ""}`}
            data-sound={action.sound}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.play && <Icon name="play" size={18} strokeWidth={2.6} filled />}
            {t(action.label)}
          </button>
        ) : (
          <p className="tv-gbar-note">{note}</p>
        )}
      </div>
    </div>
  );
}

// "Reto del día" in the bar: the flame, today's goal over its bar, and how far it is. Guests have none: one line says
// what an account gives.
function DailyZone({ daily }) {
  const t = useT();
  const done = Boolean(daily?.done);
  const target = daily?.target || 1;
  const progress = Math.min(target, daily?.progress || 0);
  return (
    <div className="tv-gbar-zone tv-gbar-zone--group">
      <span className="tv-gbar-cap">{t("Reto del día")}</span>
      <div className={`tv-gbar-box tv-gbar-daily${done ? " is-done" : ""}`}>
        <span className="tv-stage-daily-icon">
          <Icon name={done ? "check" : "flame"} size={20} strokeWidth={2.4} />
        </span>
        {daily ? (
          <>
            <span className="tv-gbar-daily-text">
              <strong title={t(daily.goal)}>{t(daily.goal)}</strong>
              <span className="tv-stage-daily-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={progress} aria-label={t("Avance del reto")}>
                <i style={{ width: `${Math.round((progress / target) * 100)}%` }} />
              </span>
            </span>
            <span className="tv-stage-daily-count">
              {formatElo(progress)}/{formatElo(target)}
            </span>
          </>
        ) : (
          <span className="tv-gbar-daily-text">
            <span className="tv-stage-friends-empty">{t("Con una cuenta tienes un reto distinto cada día y llevas la cuenta de los que completas.")}</span>
          </span>
        )}
      </div>
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

// Phones: your group in the top bar (its slot, `.tv-topbar-sala` in TvTopbar), top left: the container "Grupo" (the
// title, and with a group its faces, yours first, and how many are in it; a tap opens "Tu grupo", GroupSheet, `onGroup`:
// who is in it, the code to invite) and "Invitar" beside it (as the box beside the card's: with a group it opens that
// window, without one it makes the group first). Once someone else is in the group "Invitar" is only a "+", and the
// container moves left to give room to "Salir del grupo" (`onLeave`, asks first), the same size and place as the
// top bar's "Volver" on the other screens.
function GroupMenu({ members, count, inGroup, meId, myAvatar, onGroup, onInvite, onLeave, inviteOff, busy, cap, badge }) {
  const t = useT();
  const [slot, setSlot] = useState(null);
  const together = inGroup && count > 1;

  useEffect(() => {
    setSlot(document.querySelector(".tv-topbar-sala"));
  }, []);

  if (!slot) return null;
  return createPortal(
    <div className="tv-sala">
      {together && (
        <button type="button" className="tv-chip tv-chip--leave tv-sala-leave" data-sound="back" aria-label={t("Salir del grupo")} title={t("Salir del grupo")} onClick={() => onLeave?.()} disabled={Boolean(busy)}>
          <span className="tv-avatar tv-avatar--empty">
            <Icon name="logout" size={20} strokeWidth={2.6} />
          </span>
        </button>
      )}
      {/* The container opens "Tu grupo"; with no group yet it does what "Invitar" does (makes it, then opens it). */}
      <button
        type="button"
        className="tv-chip tv-chip--sala"
        aria-haspopup="dialog"
        aria-label={inGroup ? t("{cap}: ver tu grupo", { cap }) : t("Grupo: abrir tu grupo")}
        data-sound="none"
        onClick={() => (inGroup ? onGroup?.() : onInvite?.())}
        disabled={!inGroup && (!onInvite || inviteOff || Boolean(busy))}
      >
        <span className="tv-sala-title">{t("Grupo")}</span>
        <span className="tv-sala-faces">
          {inGroup ? (
            members.slice(0, 3).map((p) => (
              <Avatar key={p.id} avatar={p.avatar} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`.trim()} />
            ))
          ) : (
            <Avatar avatar={myAvatar} className="is-me" />
          )}
        </span>
        {count > 1 && <b className="tv-sala-count">{count}</b>}
        <Icon name="chevron" size={14} strokeWidth={3} className="tv-sala-chevron" />
        {badge > 0 && <span className="tv-fr-badge">{badge}</span>}
      </button>
      {onInvite && (
        <button
          type="button"
          className={`tv-btn tv-btn--neutral tv-sala-invite${together ? " is-plus" : ""}`}
          aria-haspopup="dialog"
          aria-label={t("Invitar")}
          title={tr("Invitar")}
          data-sound="none"
          onClick={onInvite}
          disabled={!inGroup && (inviteOff || Boolean(busy))}
        >
          <Icon name="plus" size={together ? 18 : 15} strokeWidth={3} />
          {!together && (busy === "group" ? "Creando…" : tr("Invitar"))}
        </button>
      )}
    </div>,
    slot
  );
}
