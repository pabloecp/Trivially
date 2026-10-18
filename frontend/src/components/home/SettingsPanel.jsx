// The match settings beside the game's card: a title and, for players who can't change them, who does. Each mode
// puts its own settings (and any warning) inside. `actions` go at the end of the title's row (the playlist's small
// switch between its settings and saving). (The room's scoreboard is in the room's column, PartyPanel.)
export default function SettingsPanel({ room, readOnly = false, actions = null, children }) {
  return (
    <section className="tv-settings-card tv-settings-panel" aria-labelledby="tv-settings-title">
      <div className="tv-settings-head">
        <h2 id="tv-settings-title" className="tv-settings-title">
          Ajustes
        </h2>
        {readOnly && <span className="tv-settings-who">Los elige {room.hostName || "el anfitrión"}</span>}
        {actions}
      </div>
      {children}
    </section>
  );
}
