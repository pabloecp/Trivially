import { findMode } from "../../modes/index.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import PartyPanel from "./PartyPanel.jsx";
import "../../styles/central.css";
import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";

// The room screen on the room's central device, while the room waits: what everyone looks at before the match. How
// to join (the address and the room's code, big), the game the host picked (or that they're choosing one) with how
// it's played, who's in, and that the match starts from the host's phone. The only thing to tap is "Ocultar" beside the code (for streaming); the host controls the room.
export default function CentralLobby({ room }) {
  const [codeHidden, toggleCode] = useHiddenCode();
  const mode = findMode(room.game);
  const host = room.hostName || "El anfitrión";
  const players = room.players.filter((p) => p.connected);
  const playlist = mode?.kind === "playlist" ? room.playlist : null;

  return (
    <div className="tv-room tv-central-room">
      <div className="tv-room-main">
        <section className="tv-central-lobby" aria-label="Pantalla central">
          <p className="tv-mono-label tv-central-kicker">
            <Icon name="tv" size={16} strokeWidth={2.6} />
            Dispositivo central
          </p>

          <div className="tv-central-join">
            <p className="tv-central-join-text">
              Entra en <strong>{window.location.host}</strong>, toca Jugar y escribe el código
            </p>
            <p className="tv-central-join-code">{shownCode(room.code, codeHidden)}</p>
            <button
              type="button"
              className={`tv-code-eye${codeHidden ? " is-on" : ""}`}
              onClick={toggleCode}
              aria-pressed={codeHidden}
              aria-label={codeHidden ? "Mostrar el código" : "Ocultar el código"}
            >
              <Icon name={codeHidden ? "eye-off" : "eye"} size={16} strokeWidth={2.4} />
              <span>{codeHidden ? "Oculto" : "Ocultar"}</span>
            </button>
          </div>

          {mode ? (
            <div key={mode.id} className={`tv-central-game tv-c-${mode.color}`}>
              <span className="tv-central-game-badge">
                <Icon name={mode.icon} size={34} strokeWidth={2.2} />
              </span>
              <div className="tv-central-game-text">
                <p className="tv-central-game-kicker">{playlist ? "Playlist" : "Juego elegido"}</p>
                <h1 className="tv-central-game-name">{playlist ? playlist.name || "Playlist" : mode.name}</h1>
              </div>
              {playlist ? (
                <ol className="tv-central-steps">
                  {(playlist.items || []).slice(0, 6).map((item, i) => {
                    const game = findMode(item.game);
                    return (
                      <li key={item.id} style={{ "--i": i }}>
                        <Icon name={game?.icon || "play"} size={20} strokeWidth={2.4} />
                        {game?.name || "Juego"}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <ol className="tv-central-steps">
                  {mode.steps.map((s, i) => (
                    <li key={s.text} style={{ "--i": i }}>
                      <Icon name={s.icon} size={20} strokeWidth={2.4} />
                      {s.text}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div className="tv-central-game is-picking">
              <span className="tv-pulse" aria-hidden="true" />
              <p>{host} está eligiendo el juego…</p>
            </div>
          )}

          <ul className="tv-central-faces" aria-label="Jugadores en la sala">
            {players.map((p, i) => (
              <li key={p.id} style={{ "--i": i }}>
                <Avatar name={p.name} avatar={p.avatar} />
                <span>{p.name}</span>
              </li>
            ))}
          </ul>

          <p className="tv-mstage-wait tv-central-wait">
            <Icon name="phone" size={20} strokeWidth={2.4} />
            {mode ? `${host} empieza la partida desde su teléfono` : "Se juega desde los teléfonos: esta pantalla muestra la partida"}
          </p>
        </section>
      </div>
      <PartyPanel room={room} display />
    </div>
  );
}
