// Two-or-more option switch with a sliding highlight (used for "Crear cuenta / Iniciar sesión").
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
          className="tv-seg-btn"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
