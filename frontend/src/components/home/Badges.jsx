import { useState } from "react";
import Icon from "./Icon.jsx";
import { BADGES, badgeProgress } from "../../lib/badges.js";

import { translate as tr } from "../../lib/i18n.js";
// A badge as a tag, like "Owner": its icon and name on its colour. A locked one is grey with a lock.
export function BadgeTag({ badge, locked = false }) {
  return (
    <span
      className={`tv-tag tv-badge-tag${locked ? " is-locked" : ""}`}
      style={locked ? undefined : { "--badge": badge.color, "--badge-ink": badge.ink }}
    >
      <Icon name={locked ? "lock" : badge.icon} size={13} strokeWidth={2.8} />
      {badge.name}
    </span>
  );
}

const fmt = (n) => n.toLocaleString("es-MX");

// "Insignias", the profile's third column: the ten badges in two columns of small boxes, each its tag and, on your own
// profile, how far you are (a thin bar and "608 / 1,000"), or "Ganada" / "La llevas". Any box is tapped to read at the
// foot what it asks (the foot keeps the height of two lines, whatever it says); one you won is also worn with that tap beside your name (the one you wear in the site's blue;
// tapped again, it comes off). Someone else's profile shows the same boxes without the progress; a guest sees them all
// locked, and the foot says to make an account.
export default function BadgesCard({ user, worn = null, own = false, guest = false, onWear }) {
  const [asked, setAsked] = useState(null);
  const [busy, setBusy] = useState("");
  const all = badgeProgress(guest ? null : user);
  const won = all.filter((b) => b.earned);
  const shown = all.find((b) => b.id === asked) || null;
  const mine = own && !guest;

  async function tap(b) {
    setAsked(b.id);
    if (!mine || !b.earned || busy) return;
    setBusy(b.id);
    try {
      await onWear(worn === b.id ? null : b.id);
    } finally {
      setBusy("");
    }
  }

  let note;
  if (shown) {
    const state = !mine && shown.earned ? tr(" La ganó.") : "";
    note = (
      <>
        <b>{shown.name}</b> · {shown.how}
        {state}
      </>
    );
  } else if (guest) {
    note = tr("Crea una cuenta para ganar insignias.");
  } else if (mine) {
    note = won.length ? tr("Toca una para ver qué pide. Las que ganaste se llevan junto a tu nombre.") : tr("Son difíciles a propósito. Toca una para ver qué pide.");
  } else {
    note = tr("Toca una para ver qué pide.");
  }

  return (
    <section className="tv-card tv-pf-card tv-pf-badges" aria-labelledby="tv-badges-title">
      <div className="tv-pf-head">
        <h2 id="tv-badges-title" className="tv-pf-title">{tr("Insignias")}</h2>
        <span className="tv-badges-count">
          <b>{won.length}</b> de {BADGES.length}
        </span>
      </div>
      <div className="tv-badges-grid">
        {all.map((b) => {
          const on = worn === b.id;
          return (
            <button
              key={b.id}
              type="button"
              className={`tv-badge-item${b.earned ? " is-earned" : " is-locked"}${on ? " is-on" : ""}${asked === b.id ? " is-asked" : ""}`}
              aria-pressed={mine && b.earned ? on : undefined}
              aria-label={`${b.name}${b.earned ? "" : " (bloqueada)"}`}
              disabled={Boolean(busy)}
              onClick={() => tap(b)}
            >
              <BadgeTag badge={b} locked={!b.earned} />
              {mine &&
                (b.earned ? (
                  <span className="tv-badge-state">{on ? tr("La llevas") : tr("Ganada")}</span>
                ) : (
                  <span className="tv-badge-progress">
                    <span className="tv-badge-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((b.have / b.goal) * 100)}%` }} />
                    </span>
                    <span className="tv-badge-num">
                      {fmt(b.have)} / {fmt(b.goal)}
                    </span>
                  </span>
                ))}
            </button>
          );
        })}
      </div>
      <p className="tv-badges-note" aria-live="polite">
        {note}
      </p>
    </section>
  );
}
