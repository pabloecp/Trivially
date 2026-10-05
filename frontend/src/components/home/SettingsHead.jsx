// The top of every game's settings panel: the title, and on the right who can change them.
export default function SettingsHead({ id, room, readOnly }) {
  return (
    <div className="tv-settings-head">
      <h2 id={id} className="tv-settings-title">Ajustes de la partida</h2>
      <span className="tv-settings-who">
        {readOnly ? `Solo lectura · los elige ${room.hostName || "el anfitrión"}` : "Puedes cambiarlos tú"}
      </span>
    </div>
  );
}
