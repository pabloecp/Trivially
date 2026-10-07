import Icon from "../../components/home/Icon.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import GeoSettings from "./GeoSettings.jsx";
import { geoConfig } from "./geoInfo.js";
import "../../styles/quiz.css";
import "../../styles/geo.css";

// Geografía's waiting room, inside the room screen on Home: the mode's big card (how it's played and the start
// button) and the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));

  const mode = findMode("mundo");
  const config = geoConfig(room);

  return (
    <>
      <ModeStage room={room} mode={mode}>
        <ModeStart room={room} />
      </ModeStage>

      <SettingsPanel room={room} readOnly={!canEdit}>
        <GeoSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit}>
          {!mode.ready(room) && (
            <p className="tv-playlist-total is-short" role="status">
              <Icon name="lock" size={16} strokeWidth={2.6} />
              {config.kinds.length === 0 ? (
                <span>Elige al menos un tipo de pregunta para empezar.</span>
              ) : (
                <span>
                  Solo hay <strong>{room.questionsReady} preguntas</strong> con estos ajustes para {config.rounds} rondas.
                  Baja las rondas o elige más tipos.
                </span>
              )}
            </p>
          )}
        </GeoSettings>
      </SettingsPanel>
    </>
  );
}
