import Icon from "./Icon.jsx";

// A number setting with − and + buttons (the room settings of each game). `limits` is { min, max, step }.
export default function Stepper({ label, value, unit, limits, onChange }) {
  const { min, max, step } = limits;
  return (
    <div className="tv-stepper" role="group" aria-label={label}>
      <span className="tv-label">{label}</span>
      <div className="tv-stepper-row">
        <button
          type="button"
          className="tv-stepper-btn"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`Menos ${label.toLowerCase()}`}
        >
          <Icon name="chevron" size={22} strokeWidth={3} className="tv-stepper-down" />
        </button>
        <span key={value} className="tv-stepper-value" aria-live="polite">
          {value}
          {unit && <small>{unit}</small>}
        </span>
        <button
          type="button"
          className="tv-stepper-btn"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={`Más ${label.toLowerCase()}`}
        >
          <Icon name="chevron" size={22} strokeWidth={3} className="tv-stepper-up" />
        </button>
      </div>
      <span className="tv-stepper-range">
        de {min} a {max}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
