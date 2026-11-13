import { useState } from "react";
import Icon from "./Icon.jsx";
import { BADGES, badgeProgress } from "../../lib/badges.js";

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

// "Insignias", under the profile's three boxes: the eight badges with what each asks and how far you are (a bar and
// "64 / 100"). The ones you won are tapped to wear them beside your name (the one you wear in the site's blue, "La
// llevas"; tapped again, it comes off); the others are flat and dimmed, with a lock. On someone else's profile only the
// ones they won show, without progress.
export default function BadgesCard({ user, worn = null, own = false, onWear }) {
  const [busy, setBusy] = useState("");
  const all = badgeProgress(user);
  const won = all.filter((b) => b.earned);
  const list = own ? all : won;

  async function wear(id) {
    if (busy) return;
    setBusy(id);
    try {
      await onWear(worn === id ? null : id);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="tv-card tv-pf-badges" aria-labelledby="tv-badges-title">
      <div className="tv-pf-head">
        <h2 id="tv-badges-title" className="tv-pf-title">Insignias</h2>
        <span className="tv-badges-count">
          <b>{won.length}</b> de {BADGES.length}
        </span>
      </div>
      <p className="tv-badges-hint">
        {!own
          ? won.length
            ? "Las que ganó jugando."
            : "Todavía no gana ninguna."
          : won.length
            ? "Toca una de las que ganaste para llevarla junto a tu nombre."
            : "Son difíciles a propósito: cada una pide algo grande. Aquí ves cuánto te falta."}
      </p>
      {list.length > 0 && (
        <div className="tv-badges-grid">
          {list.map((b) => {
            const on = worn === b.id;
            const body = (
              <>
                <span className="tv-badge-top">
                  <BadgeTag badge={b} locked={!b.earned} />
                  {own && b.earned && <span className="tv-badge-state">{on ? "La llevas" : "Ponértela"}</span>}
                </span>
                <span className="tv-badge-how">{b.how}</span>
                {own && (
                  <span className="tv-badge-progress">
                    <span className="tv-badge-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((b.have / b.goal) * 100)}%`, ...(b.earned ? { background: b.color } : {}) }} />
                    </span>
                    <span className="tv-badge-num">
                      {b.earned ? "Ganada" : `${b.have.toLocaleString("es-MX")} / ${b.goal.toLocaleString("es-MX")}${b.unit ? ` ${b.unit}` : ""}`}
                    </span>
                  </span>
                )}
              </>
            );
            return own && b.earned ? (
              <button
                key={b.id}
                type="button"
                className={`tv-badge-item is-earned${on ? " is-on" : ""}`}
                aria-pressed={on}
                disabled={Boolean(busy)}
                onClick={() => wear(b.id)}
              >
                {body}
              </button>
            ) : (
              <div key={b.id} className={`tv-badge-item${b.earned ? " is-earned" : " is-locked"}`}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
