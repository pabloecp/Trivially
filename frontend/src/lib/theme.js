import { useEffect, useState } from "react";
import { PALETTES } from "./palettes.js";

// The list was renumbered (old 5 Mezcla is now 1, Rayas and Ondas kept 2 and 3, Confeti and Triángulos are gone and
// 4 and 5 are the new Lima and Medianoche), so the saved choice moved to a new key; the old one is read once and
// translated.
const PALETTE_KEY = "trivially_palette_v2";
const OLD_PALETTE_KEY = "trivially_palette";
const OLD_TO_NEW = { 5: 1, 2: 2, 3: 3 };
const THEME_KEY = "trivially_theme";

const DEFAULT_PALETTE = PALETTES.find((p) => p.id === 1) || PALETTES[0];

// No saved option, or one that no longer exists, falls back to the default (Mezcla).
function loadPalette() {
  const saved = Number(localStorage.getItem(PALETTE_KEY));
  if (PALETTES.some((p) => p.id === saved)) return saved;
  const old = OLD_TO_NEW[Number(localStorage.getItem(OLD_PALETTE_KEY))];
  return old || DEFAULT_PALETTE.id;
}

function applyPalette(id) {
  const palette = PALETTES.find((p) => p.id === id) || DEFAULT_PALETTE;
  const root = document.documentElement;
  root.setAttribute("data-theme", palette.theme);
  root.setAttribute("data-palette", String(palette.id));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
  return palette;
}

// Apply the saved option before React renders, so the page never flashes the default colours.
applyPalette(loadPalette());

// Shared by every screen: the theme button walks through the colour options (lib/palettes.js).
export function useTheme() {
  const [paletteId, setPaletteId] = useState(loadPalette);
  const palette = PALETTES.find((p) => p.id === paletteId) || DEFAULT_PALETTE;

  useEffect(() => {
    applyPalette(paletteId);
    localStorage.setItem(PALETTE_KEY, String(paletteId));
    localStorage.setItem(THEME_KEY, palette.theme);
  }, [paletteId]);

  function toggleTheme() {
    setPaletteId((id) => {
      const i = PALETTES.findIndex((p) => p.id === id);
      return PALETTES[(i + 1) % PALETTES.length].id;
    });
  }

  return { theme: palette.theme, palette, toggleTheme };
}
