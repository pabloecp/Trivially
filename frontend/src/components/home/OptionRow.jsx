import Icon from "./Icon.jsx";

// One setting of the settings panel: its name, then its choices side by side; the chosen one is filled in.
// `options` are { value, label, title?, count?, disabled? }: `count` shows small after the label (how many questions
// that choice has) and `disabled` greys it out. With `multi`, `value` is a list, every chosen option is filled in and
// each choice has a little box, ticked or empty, so it reads as "pick as many as you like". `onSetAll(list)` adds
// a small button beside the setting's name: "Seleccionar todos" ticks every choice, or "Deseleccionar todos" when they
// already are. `children` go after the choices (the music mode's Spotify button). Inside a disabled fieldset nothing
// can be tapped.
export default function OptionRow({ label, options, value, onChange, multi = false, wrap = false, onSetAll = null, children }) {
  const isOn = (v) => (multi ? value.includes(v) : value === v);
  const allOn = multi && options.every((o) => value.includes(o.value));
  return (
    <div className="tv-optrow" role="group" aria-label={label}>
      <div className="tv-optrow-head">
        <span className="tv-optrow-label">{label}</span>
        {multi && onSetAll && (
          <button type="button" className="tv-optrow-action" onClick={() => onSetAll(allOn ? [] : options.map((o) => o.value))}>
            {allOn ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
        )}
      </div>
      <div className={`tv-optrow-opts${wrap ? " is-wrap" : ""}${multi ? " is-multi" : ""}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="tv-optrow-btn"
            aria-pressed={isOn(o.value)}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {multi && (
              <span className="tv-optrow-box" aria-hidden="true">
                {isOn(o.value) && <Icon name="check" size={12} strokeWidth={3.6} />}
              </span>
            )}
            {o.label}
            {o.count != null && <small className="tv-optrow-count">{o.count}</small>}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}

/** The values from `min` to `max` in steps of `step`, as options ("15 s" with a `unit`). */
export function rangeOptions({ min, max, step }, unit = "") {
  const out = [];
  for (let v = min; v <= max; v += step) out.push({ value: v, label: unit ? `${v} ${unit}` : String(v) });
  return out;
}
