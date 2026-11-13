// Two-or-more option switch with a sliding highlight (used for "Crear cuenta / Iniciar sesión"). An option can be
// `disabled` (greyed, it can't be chosen). Its `label` may be an icon; then `title` names it (on hover and to screen
// readers).
export default function Segmented({ options, value, onChange, label }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className="tv-seg"
      role="tablist"
      aria-label={label}
      style={{ "--count": options.length, "--pos": index }}
    >
      <span className="tv-seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          title={o.title}
          aria-label={o.title}
          className="tv-seg-btn"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
