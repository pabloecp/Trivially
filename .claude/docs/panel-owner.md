# Ajustes and the owner panel (the gear in the top bar)

Two roles only (`auth/roles.js`): "user" and "owner", the account ids in the env var `OWNER_IDS` (a role saved on an account counts for nothing). Every owner power is checked on the socket's **verified** account.

Everyone (not the central device) gets a gear (`TvTopbar.jsx`) opening "Ajustes" (`AppSettings.jsx`, in `Modal`): **Volumen** (`VolumeRows`) and **Animaciones** ("Con movimiento" | "Quietos": `useBlobsStill`, any player, this device). Language, light/dark theme and chat filter are not there yet (the site only has Spanish and a dark theme). Owners (`useIsOwner`) get one more button at the foot of "Ajustes", **"Panel de owner"**, which closes it and opens `AdminPanel.jsx` (styles `styles/admin.css`) with their tools:

- **Vista:** "Owner (debug)" | "Usuario normal" (`trivially_owner_view`). In normal view the owner sees the site like anyone (no "Saltar").
- **Tipo de sonido:** the sets of `lib/sounds.js` (`trivially_sound_pack_v2`); everyone else hears Madera.
- **Pantalla de resultados** and **Marcador:** look variants only for the owner in debug view (`useResultsLook`, `useScoreboardLook`); everyone else sees the defaults: results "Barras" + "En color", scoreboard "Insignia" with a crown (`useScoreboardBadge`, its own setting apart from the results tone).
- **Letra (Cerradas):** "Normal" (what everyone sees: three lines of lyrics over the four options) or "Opciones grandes" (only the last two lines, so the options are as big as Trivia's), only on the owner's device and in debug view (`useLyricsView`, `trivially_lyrics_view`; the play panel gets `is-big-options`).
- **Bot de prueba:** `room:addTestBot`, private lobby only.
