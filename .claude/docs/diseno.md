# Design rules

The look comes from the "Trivially rediseño" canvas (1 · Inicio, 2 · ¿Qué quieren jugar?, 4 · Ajustes de Trivia and "Piezas y reglas"). It lives in `frontend/src/styles/look.css`, loaded last (`main.jsx`): that file is how things look (tokens, buttons, cards, panels, type), the older files keep how they're laid out. Reuse its tokens and each game's (`--tv-*-edge`, `tv-c-*`) instead of loose colours.

## The layout
- **Arriba la info, al centro el juego, abajo tu grupo y la acción.** Inicio, the group's room and the search are one frame (`HomeFrame.jsx`): the top bar, the game's big card in the middle, the group's bar at the bottom of the window (`.tv-lobby`, `.tv-gbar`). On phones they stack: card, group row, "Vas a jugar", the button.
- **One yellow button per screen** (JUGAR, EMPEZAR, Listo, "Volver a jugar", "Volver al grupo"…): `.tv-btn--primary`. Everything else is grey (`.tv-btn--neutral`, `.tv-iconbtn`).
- **Settings hide behind a summary**: a line under the card and "Ajustes", which opens the panel (`SettingsPanel`).

## Colours and surfaces
- Page `--tv-bg` #0a0b0c with its faint pattern of triangles, circles, crosses and waves (`--tv-page-bg`).
- Big panels (a panel over the page, the group's bar) `--tv-surface` #141517, 20–24 px corners, no coloured border, no edge; over the page only a soft drop shadow, and the page behind is darkened (60 % black).
- Boxes inside them (option rows, the "Vas a jugar" box, the code's box) `--tv-surface-2` #1c1d20, flat, 12–14 px corners.
- Games: Trivia `--tv-qm`, Adivina la canción `--p-music-*`, Encuentra el país `--p-world-*`, Rango `--tv-hm`, Campo de minas `--tv-mn`, Lluvia `--tv-rn`, Rey `--tv-ry`, Farsante `--tv-fs`; each with its darker `--edge`, never black.
- Chosen (an option of a row, a category): the site's blue `--tv-pick` (#2f6bff) with `0 3px 0 --tv-pick-edge` (#1a3c99), white text; the others have no fill. Text links `--tv-link` (#5b8cff), bold, never underlined.

## Type
- Titles (a game's name, a panel's title): Outfit 800, tighter (`--tv-title`, `-0.03em`).
- Buttons, game names and labels: Baloo 2, 700–800 (`--tv-display`).
- Quiet text (subtitles, notes, "Vas a jugar"): Plus Jakarta Sans (`--tv-small`), grey `--tv-text-3`.

## Pieces
- **The game's card** (`ModeStage`, `.tv-mstage`): flat, the game's colour, 24 px corners, its icon on a white square, "Partida pública" beside it (only for a public match: a darker label, 10 px corners), its name huge, three rows on darker strips (black ~15 %) each with a small icon on a lighter square, and the icon again huge and faint (white ~12 %) cut by the bottom right corner.
- **The games' cards** (`GameCard`, `.tv-gcard`): tapped, so with their edge (`0 4px 0 var(--edge)`); icon on a white square top left, name and tagline, the faint icon cut by the corner; the chosen one with a white ring. 4 columns on a computer, 2 on phones.
- **Panels over the page** (`Modal.jsx`, `.tv-modal`): title and a grey X; a body that scrolls and an optional foot (Restablecer left, Listo right). On phones a sheet from the bottom. Inside `.tv-app` (its styles reach them).
- **Pills** (`.tv-pill`, "Partida pública / Partida privada") and **tabs** (`SettingsTabs`: icon and title, a grey summary under, the open one with a 2 px blue line): flat.
- Avatars are round; yours in the group's bar has a yellow ring.

## How big panels move
- Every big panel (a game's card, the group's bar, a panel over the page, the room's column, a public match's card, the central lobby, profile cards) comes in all together, nothing inside it animating apart, up from below: `--tv-box-in` (`tvBoxIn`, in `home.css`'s `:root`). Going out is the reverse, all together: `--tv-box-out` (`tvBoxOut`, 0.3 s). Reduced motion: none.

## Shadows
- **With a shadow** (a solid edge in the piece's own darker colour, `box-shadow: 0 3px 0 var(--edge)`): only what is tapped and does something. Buttons (`.tv-btn`, `.tv-iconbtn`, the top bar's `.tv-chip`), answers (`.tv-option`, `.tv-quiz-opt`), cells (`.tv-mines-cell`), the games' cards (`.tv-gcard`), chosen options (`.tv-optrow-btn` pressed), coloured icons. On hover it rises (1–2 px) and the edge grows; pressed, it goes down and the edge disappears.
- The edge is always the piece's colour, darker: `--edge` of its `tv-c-*`, `--p-accent-edge` (#b39200) for the yellow, `--tv-neutral-edge` (#191919) for grey, `rgba(0, 0, 0, 0.22)` for a white button on a coloured card. Never a plain black edge under a coloured or white button.
- Quiet icon buttons with no background (`.tv-iconbtn--quiet`, a row's X, a playlist row's tools) stay flat.
- Buttons are rounded rectangles: square icon ones 40 px with 12 px corners (36 px / 10 px small), text ones 12 px corners (10 px small, 14 px big). Only avatars, dots, switches and labels are round.
- **Flat:** boxes to write in (a coloured ring on focus), pills and tabs (the chosen one a lighter fill, `rgba(255, 255, 255, 0.08)`, or a line), cards and rows, labels, avatars, covers.
- **Never** an inset shadow at the top (`inset 0 3px 0 …`).
- Text buttons and profile links are never underlined: they brighten on hover.
