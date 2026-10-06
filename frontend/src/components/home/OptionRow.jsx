// One setting of the settings panel: its name, then its choices side by side; the chosen one is filled in.
// `options` are { value, label }. With `multi`, `value` is a list and every chosen option is filled in. `children`
// go after the choices (the music mode's Spotify button). Inside a disabled fieldset nothing can be tapped.
export default function OptionRow({ label, options, value, onChange, multi = false, wrap = false, children }) {
  const isOn = (v) => (multi ? value.includes(v) : value === v);
  return (
    <div className="tv-optrow" role="group" aria-label={label}>
      <span className="tv-optrow-label">{label}</span>
      <div className={`tv-optrow-opts${wrap ? " is-wrap" : ""}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="tv-optrow-btn"
            aria-pressed={isOn(o.value)}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
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
