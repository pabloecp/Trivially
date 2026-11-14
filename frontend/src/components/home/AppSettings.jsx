import { setBlobsStill, useBlobsStillChoice } from "../../lib/ownerView.js";
import { setThemeChoice, useThemeChoice } from "../../lib/theme.js";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import { useLang, useT } from "../../lib/i18n.js";
import Segmented from "./Segmented.jsx";
import { VolumeRows } from "./VolumeMenu.jsx";
import "../../styles/admin.css";

// One setting as a row, like the settings of a phone: its icon and name on the left, its choice (a small switch, with
// icons when they say it better than words) on the right.
function SettingRow({ icon, label, children }) {
  return (
    <div className="tv-setting-row">
      <span className="tv-setting-name">
        <Icon name={icon} size={18} strokeWidth={2.4} />
        {label}
      </span>
      {children}
    </div>
  );
}

const ICON = (name) => <Icon name={name} size={17} strokeWidth={2.5} />;

/**
 * "Ajustes", the gear in the top bar, for everyone: the volume (the songs' and the sounds' bars), then a list of rows:
 * the language (ES and EN, lib/i18n.js), the theme (system, light or dark, as icons; lib/theme.js) and the
 * animations (moving or still, as play and pause). No descriptions: each choice says its name when hovered and to screen
 * readers. There is no chat filter because the rooms have no chat. Owners also get "Panel de owner" at its foot
 * (`onOwner`), which closes this window and opens the owner panel (AdminPanel.jsx) with their tools.
 */
export default function AppSettings({ open, onClose, onOwner = null }) {
  const still = useBlobsStillChoice();
  const theme = useThemeChoice();
  const t = useT();
  const [lang, setLang] = useLang();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Ajustes")}
      size="sm"
      className="tv-appsettings"
      foot={
        onOwner ? (
          <button type="button" className="tv-btn tv-btn--neutral tv-btn--block" onClick={onOwner}>
            <Icon name="settings" size={18} strokeWidth={2.6} />
            {t("Panel de owner")}
          </button>
        ) : null
      }
    >
      <div className="tv-admin-block">
        <VolumeRows />
      </div>
      <div className="tv-admin-block tv-setting-list">
        <SettingRow icon="globe" label={t("Idioma")}>
          <Segmented
            label={t("Idioma")}
            value={lang}
            onChange={setLang}
            options={[
              { value: "es", label: "ES", title: "Español" },
              { value: "en", label: "EN", title: "English" },
            ]}
          />
        </SettingRow>
        <SettingRow icon={theme === "claro" ? "sun" : theme === "oscuro" ? "moon" : "phone"} label={t("Tema")}>
          <Segmented
            label={t("Tema")}
            value={theme}
            onChange={setThemeChoice}
            options={[
              { value: "sistema", label: ICON("phone"), title: t("Como tu dispositivo") },
              { value: "claro", label: ICON("sun"), title: t("Claro") },
              { value: "oscuro", label: ICON("moon"), title: t("Oscuro") },
            ]}
          />
        </SettingRow>
        <SettingRow icon="bolt" label={t("Animaciones")}>
          <Segmented
            label={t("Animaciones")}
            value={still ? "si" : "no"}
            onChange={(v) => setBlobsStill(v === "si")}
            options={[
              { value: "no", label: ICON("play"), title: t("Con movimiento") },
              { value: "si", label: ICON("pause"), title: t("Quietos") },
            ]}
          />
        </SettingRow>
      </div>
    </Modal>
  );
}
