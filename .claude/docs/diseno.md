# Design rules

## How big panels move
- Every big panel (game menu, a game's card and settings, the room's column, `/jugar`'s options and boxes, a public match's card, the central lobby, profile cards) comes in all together, nothing inside it animating apart, up from below: `--tv-box-in` (`tvBoxIn`, in `home.css`'s `:root`). Going out is the reverse, all together: `--tv-box-out` (`tvBoxOut`, 0.3 s). Reduced motion: none.
- Between `/jugar` and a room, `Home.jsx` picks a `seam` (`lib/screenMotion.js`, class `is-seam-*` on `.tv-main`): **"match"** (Casual ↔ its search, the same frame: only the panel's contents and the button's label swap, `MATCH_OUT_MS` 240 ms, then `settle` + `softIn` + `labelIn`) or **"soft"** (anything else: `tvSoftOut` then `softIn`).

## Shadows
- **With a shadow** (a solid edge in the piece's own darker colour, `box-shadow: 0 3px 0 var(--edge)`): only what is tapped and does something. Buttons (`.tv-btn`, every button of bars and cards, `.tv-chip`, close X with a background), answers (`.tv-option`, `.tv-quiz-opt`), cells (`.tv-mines-cell`), game tiles (`.tv-mode`), coloured icons. On hover it rises and the edge grows; pressed, it goes down and the edge disappears.
- The edge is always the piece's colour, darker: `--edge` of its `tv-c-*`, `--p-cinema-edge` (violet), `--tv-neutral-edge` (grey), `rgba(0, 0, 0, 0.22)` for a white button on a coloured card, `--tv-edge` only for near-black ones. Never a plain black edge under a coloured or white button.
- Quiet icon buttons with no background (a row's X, a playlist row's tools) stay flat.
- Buttons are rounded rectangles: small square ones 40 px with 12 px corners, small text ones 10 px corners. Only avatars, dots, switches and labels are round.
- **Flat:** boxes to write in (a coloured ring on focus), selectors and tabs (the chosen one a flat lighter pill, `rgba(255, 255, 255, 0.08)`, sliding without bounce), cards and rows (at most `inset 0 0 0 1px var(--tv-line)`; menus add a soft drop shadow), labels, avatars, covers.
- **Never** an inset shadow at the top (`inset 0 3px 0 …`).
- Text buttons and profile links are never underlined: they brighten on hover.
