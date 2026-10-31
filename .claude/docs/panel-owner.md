# Owner panel (the gear in the top bar)

Two roles only (`auth/roles.js`): "user" and "owner", the account ids in the env var `OWNER_IDS` (a role saved on an account counts for nothing). Every owner power is checked on the socket's **verified** account.

Owners get a gear (`TvTopbar.jsx`, `useIsOwner` in `lib/ownerView.js`) opening `AdminPanel.jsx` (styles `styles/admin.css`):

- **Vista:** "Owner (debug)" | "Usuario normal" (`trivially_owner_view`). In normal view the owner sees the site like anyone (no "Saltar", forced games not sent).
- **Tipo de sonido:** the sets of `lib/sounds.js` (`trivially_sound_pack_v2`); everyone else hears Madera.
- **Reducir movimiento:** the Blobs stay still (no jumps nor looks) on the owner's device (`useBlobsStill`); nobody else can turn their animations off.
- **Estilo de los Blobs:** "Plano", "Sombra" (what everyone sees) or "Luz y sombra", only on the owner's device and in debug view (`lib/ownerView.js`, `useBlobStyle`).
- **Pantalla de resultados** and **Marcador:** look variants only for the owner in debug view (`useResultsLook`, `useScoreboardLook`); everyone else sees "Panel", "Neutra" and "Frase".
- **Bot de prueba:** `room:addTestBot`, private lobby only.
- **Juegos de Casual:** the owner picks variants and their order for their own public matches (`trivially_forced_games`, ≤ `MAX_FORCED` 5). Sent as `force` with `match:find` only in debug view; `findMatch`/`cleanForced` open a private-to-them room filled with bots, and `drawMatchItems(..., force)` plays those first, in that order (then drawn ones, while nobody has won two).
