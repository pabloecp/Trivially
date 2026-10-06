import RoomBoard from "./RoomBoard.jsx";

// The match settings beside the game's card: a title and, for players who can't change them, who does. Each mode
// puts its own settings (and any warning) inside; the room's scoreboard closes the panel.
export default function SettingsPanel({ room, readOnly = false, children }) {
  return (
    <section className="tv-settings-card tv-settings-panel" aria-labelledby="tv-settings-title">
      <div className="tv-settings-head">
        <h2 id="tv-settings-title" className="tv-settings-title">
          Ajustes
        </h2>
        {readOnly && <span className="tv-settings-who">Los elige {room.hostName || "el anfitrión"}</span>}
      </div>
      {children}
      <RoomBoard room={room} />
    </section>
  );
}
