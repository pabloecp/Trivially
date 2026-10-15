import QuizSettings from "../quiz/QuizSettings.jsx";
import MusicSettings from "../music/MusicSettings.jsx";
import GeoSettings from "../mundo/GeoSettings.jsx";
import HistorySettings from "../historia/HistorySettings.jsx";
import MinesSettings from "../minas/MinesSettings.jsx";
import { useApp } from "../../lib/store.jsx";
import { configWithItem, itemConfigFrom } from "./playlistInfo.js";

const SETTINGS = {
  opciones: QuizSettings,
  mundo: GeoSettings,
  historia: HistorySettings,
  minas: MinesSettings,
};

// The settings of one game of the playlist: the game's own settings panel, the same as in its lobby, fed with the
// item's settings instead of the room's. `status` is what the server says about the item (its chips' counts); each
// change goes to `onChange(config)`, which saves the whole playlist and throws when it can't.
export default function ItemSettings({ room, item, status, readOnly, onChange, onToast }) {
  const { catalog } = useApp();
  const itemRoom = { ...room, config: configWithItem(room.config, item), questionCounts: status?.counts };

  async function updateConfig(change) {
    await onChange(itemConfigFrom(item.game, change, item.config));
  }

  if (item.game === "musica") {
    return (
      <MusicSettings
        room={itemRoom}
        catalog={catalog}
        updateConfig={updateConfig}
        onToast={onToast}
        readOnly={readOnly}
        spotify={false}
      />
    );
  }
  const Settings = SETTINGS[item.game];
  return Settings ? <Settings room={itemRoom} updateConfig={updateConfig} onToast={onToast} readOnly={readOnly} /> : null;
}
