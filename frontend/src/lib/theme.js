import { useEffect, useState } from "react";
import { PALETTES } from "./palettes.js";

const PALETTE_KEY = "trivially_palette";
const THEME_KEY = "trivially_theme";

const DEFAULT_PALETTE = PALETTES.find((p) => p.id === 5) || PALETTES[0];

// No saved option, or one that no longer exists, falls back to the default (Mezcla).
function loadPalette() {
  const saved = Number(localStorage.getItem(PALETTE_KEY));
  if (PALETTES.some((p) => p.id === saved)) return saved;
  return DEFAULT_PALETTE.id;
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
