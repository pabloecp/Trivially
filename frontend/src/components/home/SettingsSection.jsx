// A group of settings inside a tab (SettingsTabs): an optional title, an optional short line (`hint`, only when
// something isn't obvious), and its settings (OptionRows). `sub` gives it a smaller title.
// `toggle` ({ on, onChange, label }) adds a switch at the end of the title: off, the group's settings are greyed out
// and can't be tapped (Adivina la canción's catalog).
export default function SettingsSection({ title, hint, sub = false, toggle = null, children }) {
  const off = Boolean(toggle && !toggle.on);
  return (
    <section className={`tv-setsec${sub ? " is-sub" : ""}${off ? " is-off" : ""}`} aria-label={title || undefined}>
      <div className="tv-setsec-head">
        <div className="tv-setsec-text">
          {title && <h3 className="tv-setsec-title">{title}</h3>}
          {hint && <p className="tv-setsec-hint">{hint}</p>}
        </div>
        {toggle && (
          <button
            type="button"
            className="tv-switch"
            role="switch"
            aria-checked={toggle.on}
            aria-label={toggle.label || title}
            onClick={() => toggle.onChange(!toggle.on)}
          >
            <span className="tv-switch-knob" aria-hidden="true" />
          </button>
        )}
      </div>
      {children && (
        <fieldset className="tv-setsec-body" disabled={off}>
          {children}
        </fieldset>
      )}
    </section>
  );
}
