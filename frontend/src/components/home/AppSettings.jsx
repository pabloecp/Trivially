import { setBlobsStill, useBlobsStillChoice } from "../../lib/ownerView.js";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import Segmented from "./Segmented.jsx";
import { VolumeRows } from "./VolumeMenu.jsx";
import "../../styles/admin.css";

/**
 * "Ajustes", the gear in the top bar, for everyone: the volume and the animations, in the same window as every other
 * panel. Owners also get "Panel de owner" at its foot (`onOwner`), which closes this window and opens the owner panel
 * (AdminPanel.jsx) with their tools.
 */
export default function AppSettings({ open, onClose, onOwner = null }) {
  const still = useBlobsStillChoice();
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
