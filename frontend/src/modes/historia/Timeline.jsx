import { useRef } from "react";

// How close (in % of the line) two names can sit on the same row at the reveal before one moves to the next row.
const LABEL_GAP = 16;
// How close (in % of the line) a year of the scale can be to the right year's label at the reveal and still show.
const SCALE_GAP = 11;

/**
 * The players' marks at the reveal, from left to right, each on the first row (of two, above the line) where its name
 * doesn't run into the one before.
 */
function stackMarks(marks, pct) {
  const ends = [];
  return [...marks]
    .sort((a, b) => a.year - b.year || Number(a.isMe) - Number(b.isMe))
    .map((m) => {
      const p = pct(m.year);
      let row = ends.findIndex((end) => p - end >= LABEL_GAP);
      if (row === -1) row = ends.length < 2 ? ends.length : ends.indexOf(Math.min(...ends));
      ends[row] = p;
      return { ...m, p, row };
    });
}

/**
 * Historia's timeline: the round's range of years (`min`–`max`, null during the countdown: an empty line) with a tick
 * every tenth. While a round is open, a tap or a drag puts this player's year (`value`) on it; `onChoose(year)` for
 * every move and `onRelease()` when the finger or the mouse lets go. The years after today show greyed out and can't be
 * chosen; year 0 doesn't exist. The keys are handled by the game screen. At the reveal, `answer` (the event's year) is
 * marked in green and `marks` are everyone's years ({ id, year, color, label, isMe }).
 */
export default function Timeline({ min, max, value, onChoose, onRelease, disabled, answer = null, marks = [], format, label }) {
  const railRef = useRef(null);
  const dragging = useRef(false);
  const ready = min != null && max != null;
  const span = ready ? max - min : 1;
  const step = span / 10;
  const today = new Date().getFullYear();
  const limit = ready ? Math.min(max, today) : 0;
  const pct = (year) => ((year - min) / span) * 100;
  const revealing = answer != null;

  function yearAt(clientX) {
    const rect = railRef.current.getBoundingClientRect();
    const raw = min + Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * span;
    let year = Math.round(raw);
    if (year === 0) year = raw < 0 ? -1 : 1;
    return Math.min(limit, Math.max(min, year));
  }

  function onPointerDown(e) {
    if (disabled || !ready || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = true;
    onChoose(yearAt(e.clientX));
  }

  function onPointerMove(e) {
    if (dragging.current) onChoose(yearAt(e.clientX));
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    onRelease?.();
  }

  const ticks = ready ? Array.from({ length: 11 }, (_, i) => min + i * step) : [];
  const stacked = revealing ? stackMarks(marks, pct) : [];
  const mine = stacked.find((m) => m.isMe);
  const shown = value != null && !revealing;

  return (
    <div
      className={`tv-hist-line${ready ? "" : " is-empty"}${disabled ? "" : " is-open"}${revealing ? " is-reveal" : ""}`}
      role="slider"
      tabIndex={disabled || !ready ? -1 : 0}
      aria-label={label}
      aria-valuemin={ready ? min : undefined}
      aria-valuemax={ready ? limit : undefined}
      aria-valuenow={shown ? value : undefined}
      aria-valuetext={shown ? format(value) : "Ningún año elegido"}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="tv-hist-rail" ref={railRef}>
        {ready && max > today && (
          <span className="tv-hist-future" style={{ left: `${pct(today)}%` }}>
            <span className="tv-hist-today">Hoy</span>
          </span>
        )}
        {ticks.map((year, i) => (
          <span key={year} className={`tv-hist-tick${i % 5 === 0 ? " is-major" : ""}`} style={{ left: `${(i / 10) * 100}%` }} />
        ))}

        {mine && answer !== mine.year && (
          <span
            className="tv-hist-gap"
            style={{ left: `${Math.min(mine.p, pct(answer))}%`, width: `${Math.abs(mine.p - pct(answer))}%` }}
            aria-hidden="true"
          />
        )}

        {shown && (
          <span key="thumb" className="tv-hist-thumb" style={{ left: `${pct(value)}%` }} aria-hidden="true">
            <span className="tv-hist-thumb-dot" />
          </span>
        )}

        {revealing && (
          <span className="tv-hist-answer" style={{ left: `${pct(answer)}%` }}>
            <span className="tv-hist-answer-stem" />
            <span className="tv-hist-answer-flag">{format(answer)}</span>
          </span>
        )}

        {stacked.map((m) => (
          <span
            key={m.id}
            className={`tv-hist-mark is-row-${m.row}${m.isMe ? " is-me" : ""}`}
            style={{ left: `${m.p}%`, "--mark": m.color }}
            title={`${m.label}: ${format(m.year)}`}
          >
            <span className="tv-hist-mark-stem" />
            <span className="tv-hist-mark-dot" />
            <span className="tv-hist-mark-name">{m.label}</span>
          </span>
        ))}
      </div>

      {/* The scale: both ends always, every second tick on a computer, the middle one on a phone. */}
      <div className="tv-hist-scale" aria-hidden="true">
        {ticks.map((year, i) => {
          if (i % 2 && i !== 5) return null;
          const kind = i === 0 || i === 10 ? " is-end" : i === 5 ? " is-mid" : " is-wide";
          const covered = revealing && Math.abs(i * 10 - pct(answer)) < SCALE_GAP;
          return (
            <span key={year} className={`tv-hist-label${kind}${covered ? " is-hidden" : ""}`} style={{ left: `${(i / 10) * 100}%` }}>
              {/* There is no year 0: the tick where the eras meet reads as the first year after Christ. */}
              {format(year === 0 ? 1 : year)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
