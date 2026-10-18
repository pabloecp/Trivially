import QuizSettings from "./QuizSettings.jsx";
import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import "../../styles/home.css";
import "../../styles/quiz.css";

// "Trivia" waiting room, shown inside the room screen on Home once the host picks this game: the mode's big
// card (how it's played and the start button) and the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();

  const me = room.players.find((p) => p.id === user?.id);
  const isHost = room.hostId === user?.id;
  const canEditConfig = isHost || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const mode = findMode("opciones");
  // A list with nothing ticked: what to tick.

  return (
    <>
      <ModeStage room={room} mode={mode}>
        <ModeStart room={room} />
      </ModeStage>

      <SettingsPanel room={room} readOnly={!canEditConfig}>
        <QuizSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEditConfig}>
        </QuizSettings>
      </SettingsPanel>
    </>
  );
}
