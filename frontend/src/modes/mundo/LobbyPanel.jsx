import Icon from "../../components/home/Icon.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import GeoSettings from "./GeoSettings.jsx";
import { KINDS, findDifficulty, geoConfig, matchMinutes } from "./geoInfo.js";
import "../../styles/quiz.css";
import "../../styles/geo.css";

// Geografía's waiting room, inside the room screen on Home: the mode's big card (summary of the match and the start
// button) and the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));

  const config = geoConfig(room);
  const level = findDifficulty(config.difficulty);
  const kinds = KINDS.filter((k) => config.kinds.includes(k.id));
  const short = room.questionsReady != null && room.questionsReady < config.rounds;

  return (
    <>
      <ModeStage
        room={room}
        mode={findMode("mundo")}
        chips={[
          ...kinds.map((k) => k.label),
          `${config.rounds} rondas`,
          `Dificultad ${level.label.toLowerCase()}`,
          `≈ ${matchMinutes(config)} min`,
        ]}
        extra={
          <span className="tv-mstage-kinds" aria-hidden="true">
            {kinds.map((k) => (
              <Icon key={k.id} name={k.icon} size={26} strokeWidth={2.2} />
            ))}
          </span>
        }
      >
        <ModeStart room={room} ready={!short} />
      </ModeStage>

      <GeoSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit}>
        {short && (
          <p className="tv-playlist-total is-short" role="status">
            <Icon name="lock" size={16} strokeWidth={2.6} />
            <span>
              Solo hay <strong>{room.questionsReady} preguntas</strong> con estos ajustes para {config.rounds} rondas. Baja
              las rondas o elige más tipos.
            </span>
          </p>
        )}
        <p className="tv-settings-note">
          <Icon name="info" size={16} strokeWidth={2.2} />
          Si al final hay empate en el primer puesto, se juega un desempate en el mapa.
        </p>
      </GeoSettings>
    </>
  );
}
