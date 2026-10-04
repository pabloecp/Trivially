import Avatar from "../../components/home/Avatar.jsx";
import Icon from "../../components/home/Icon.jsx";
import { useApp } from "../../lib/store.jsx";
import GeoSettings from "./GeoSettings.jsx";
import { KINDS, findDifficulty, geoConfig, matchMinutes } from "./geoInfo.js";
import "../../styles/quiz.css";
import "../../styles/geo.css";

// Geografía's waiting room, inside the room screen on Home: the match settings and a summary of the match. The start
// button lives in PartyPanel (./StartButton.jsx).
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const connected = room.players.filter((p) => p.connected);

  const config = geoConfig(room);
  const level = findDifficulty(config.difficulty);
  const kinds = KINDS.filter((k) => config.kinds.includes(k.id));
  const short = room.questionsReady != null && room.questionsReady < config.rounds;

  return (
    <div className="tv-lobby-grid has-settings">
      <GeoSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit} />

      <section className="tv-card tv-match" aria-label="Resumen de la partida">
        <h2 className="tv-card-title">Resumen de la partida</h2>
        <div className="tv-match-preview tv-geo-preview">
          <div className="tv-geo-preview-kinds" aria-hidden="true">
            {kinds.map((k, i) => (
              <span key={k.id} className="tv-badge tv-c-world" style={{ "--i": i }}>
                <Icon name={k.icon} size={26} />
              </span>
            ))}
          </div>
          <p className="tv-match-title">
            <strong>{config.rounds}</strong> rondas
          </p>
          <div className="tv-match-chips">
            {kinds.map((k) => (
              <span key={k.id} className="tv-match-chip">
                <Icon name={k.icon} size={14} strokeWidth={2.6} />
                {k.label}
              </span>
            ))}
            <span className={`tv-match-chip tv-diff-chip tv-c-${level.color}`}>Dificultad {level.label.toLowerCase()}</span>
            <span className="tv-match-chip">≈ {matchMinutes(config)} min</span>
          </div>
          <p className="tv-hint tv-geo-tiebreak-note">
            Si al final hay empate en el primer puesto, se juega un desempate en el mapa: gana el primero que encuentre el
            país.
          </p>
          <div className="tv-match-players">
            <span className="tv-avatar-stack" aria-hidden="true">
              {connected.slice(0, 5).map((p) => (
                <Avatar key={p.id} name={p.name} avatar={p.avatar} />
              ))}
            </span>
            {connected.length === 1 ? "1 jugador en la sala" : `${connected.length} jugadores en la sala`}
          </div>
        </div>
        {short && (
          <p className="tv-playlist-total is-short" role="status">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Solo hay <strong>{room.questionsReady} preguntas</strong> con estos ajustes para {config.rounds} rondas. Baja
              las rondas o elige más tipos.
            </span>
          </p>
        )}
      </section>
    </div>
  );
}
