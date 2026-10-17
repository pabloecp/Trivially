import Icon from "../../components/home/Icon.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import RainSettings from "./RainSettings.jsx";
import { MIN_QUESTIONS, rainConfig } from "./rainInfo.js";
import "../../styles/rain.css";

// Lluvia's waiting room, inside the room screen on Home: the mode's big card (how it's played and the start button)
// and the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));

  const mode = findMode("lluvia");
  const config = rainConfig(room);

  return (
    <>
      <ModeStage room={room} mode={mode}>
        <ModeStart room={room} />
      </ModeStage>

      <SettingsPanel room={room} readOnly={!canEdit}>
        <RainSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit}>
          {!mode.ready(room) && (
            <p className="tv-playlist-total is-short" role="status">
              <Icon name="lock" size={16} strokeWidth={2.6} />
              {config.categories.length === 0 ? (
                <span>Elige al menos una categoría para empezar.</span>
              ) : config.difficulties.length === 0 ? (
                <span>Elige al menos una dificultad para empezar.</span>
              ) : (
                <span>
                  Solo hay <strong>{room.questionsReady} preguntas</strong> con estos ajustes y hacen falta al menos{" "}
                  {MIN_QUESTIONS}. Elige más categorías o dificultades.
                </span>
              )}
            </p>
          )}
        </RainSettings>
      </SettingsPanel>
    </>
  );
}
