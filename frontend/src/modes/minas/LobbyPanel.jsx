import Icon from "../../components/home/Icon.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import MinesSettings from "./MinesSettings.jsx";
import { MIXED_STEPS, findStyle, minesConfig } from "./minesInfo.js";
import "../../styles/mines.css";

// Campo de minas' waiting room, inside the room screen on Home: the mode's big card (how it's played, by turns or as
// a race, and the start button) and the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));

  const mode = findMode("minas");
  const config = minesConfig(room);
  // The steps of the ticked way, or of both mixed.
  const steps = config.styles.length === 1 ? findStyle(config.styles[0]).steps : MIXED_STEPS;

  return (
    <>
      <ModeStage room={room} mode={{ ...mode, steps }}>
        <ModeStart room={room} />
      </ModeStage>

      <SettingsPanel room={room} readOnly={!canEdit}>
        <MinesSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit}>
          {!mode.ready(room) && (
            <p className="tv-playlist-total is-short" role="status">
              <Icon name="lock" size={16} strokeWidth={2.6} />
              {config.styles.length === 0 ? (
                <span>Elige al menos un modo de juego para empezar.</span>
              ) : config.categories.length === 0 ? (
                <span>Elige al menos una categoría para empezar.</span>
              ) : config.difficulties.length === 0 ? (
                <span>Elige al menos una dificultad para empezar.</span>
              ) : (
                <span>
                  Solo hay <strong>{room.questionsReady} tableros</strong> con estos ajustes para {config.rounds} rondas.
                  Baja las rondas o elige más categorías o dificultades.
                </span>
              )}
            </p>
          )}
        </MinesSettings>
      </SettingsPanel>
    </>
  );
}
