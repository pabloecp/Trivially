import { setBlobsStill, useBlobsStillChoice } from "../../lib/ownerView.js";
import { setThemeChoice, useThemeChoice } from "../../lib/theme.js";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import Segmented from "./Segmented.jsx";
import { VolumeRows } from "./VolumeMenu.jsx";
import "../../styles/admin.css";

/**
 * "Ajustes", the gear in the top bar, for everyone: the volume, the language (only Spanish for now, English is greyed
 * out), the theme (lib/theme.js) and the animations, in the same window as every other panel. There is no chat filter
 * because the rooms have no chat. Owners also get "Panel de owner" at its foot (`onOwner`), which closes this window and opens the owner panel
 * (AdminPanel.jsx) with their tools.
 */
export default function AppSettings({ open, onClose, onOwner = null }) {
  const still = useBlobsStillChoice();
  const theme = useThemeChoice();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajustes"
      size="sm"
      className="tv-appsettings"
      foot={
        onOwner ? (
          <button type="button" className="tv-btn tv-btn--neutral tv-btn--block" onClick={onOwner}>
            <Icon name="settings" size={18} strokeWidth={2.6} />
            Panel de owner
          </button>
        ) : null
      }
    >
      <div className="tv-admin-block">
        <h3>Volumen</h3>
        <VolumeRows />
      </div>
      <div className="tv-admin-block">
        <h3>Idioma</h3>
        <Segmented
          label="Idioma"
          value="es"
          onChange={() => {}}
          options={[
            { value: "es", label: "Español" },
            { value: "en", label: "English", disabled: true },
          ]}
        />
        <p className="tv-admin-hint">El inglés llegará pronto.</p>
      </div>
      <div className="tv-admin-block">
        <h3>Tema</h3>
        <Segmented
          label="Tema"
          value={theme}
          onChange={setThemeChoice}
          options={[
            { value: "sistema", label: "Sistema" },
            { value: "claro", label: "Claro" },
            { value: "oscuro", label: "Oscuro" },
          ]}
        />
        <p className="tv-admin-hint">{theme === "sistema" ? "Usa el tema de tu dispositivo." : theme === "claro" ? "Fondo claro, siempre." : "Fondo oscuro, siempre."}</p>
      </div>
      <div className="tv-admin-block">
        <h3>Animaciones</h3>
        <Segmented
          label="Animaciones"
          value={still ? "si" : "no"}
          onChange={(v) => setBlobsStill(v === "si")}
          options={[
            { value: "no", label: "Con movimiento" },
            { value: "si", label: "Quietos" },
          ]}
        />
        <p className="tv-admin-hint">{still ? "Los Blobs no saltan ni miran a los lados en esta pantalla." : "Los Blobs saltan en el podio y miran a los lados en los marcadores."}</p>
      </div>
    </Modal>
  );
}
