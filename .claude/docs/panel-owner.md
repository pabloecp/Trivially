# Ajustes and the owner panel (the gear in the top bar)

Two roles only (`auth/roles.js`): "user" and "owner", the account ids in the env var `OWNER_IDS` (a role saved on an account counts for nothing). Every owner power is checked on the socket's **verified** account.

Everyone (not the central device) gets a gear (`TvTopbar.jsx`) opening "Ajustes" (`AppSettings.jsx`, in `Modal`), short on purpose, with no descriptions: the two **volume** bars (`VolumeRows`, no title) and then one list of rows, like a phone's settings, each its icon and name on the left and a small switch on the right (icons when they say it better; each option names itself on hover and to screen readers): **Idioma** ("ES" | "EN", greyed out until the page is translated), **Tema** (a phone, a sun, a moon: "Sistema" | "Claro" | "Oscuro": `lib/theme.js`, saved in `trivially_theme_choice`; `data-theme` on `<html>` switches the tokens of `styles/palettes.css` (dark) and `styles/light.css` (light, loaded last), "Sistema" follows the device) and **Animaciones** (play and pause: "Con movimiento" | "Quietos": `useBlobsStill`, this device). There is no chat filter because the rooms have no chat. Owners (`useIsOwner`) get one more button at the foot of "Ajustes", **"Panel de owner"**, which closes it and opens `AdminPanel.jsx` (styles `styles/admin.css`) with their tools:

- **Vista:** "Owner (debug)" | "Usuario normal" (`trivially_owner_view`). In normal view the owner sees the site like anyone (no "Saltar").
- **Tipo de sonido:** the sets of `lib/sounds.js` (`trivially_sound_pack_v2`); everyone else hears Madera.
- **Letra (Cerradas):** "Normal" (what everyone sees: three lines of lyrics over the four options) or "Opciones grandes" (only the last two lines, so the options are as big as Trivia's), only on the owner's device and in debug view (`useLyricsView`, `trivially_lyrics_view`; the play panel gets `is-big-options`).
- **Bot de prueba:** `room:addTestBot`, private lobby only.
