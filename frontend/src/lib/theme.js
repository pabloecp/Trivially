import { useEffect, useState } from "react";
import { PALETTES } from "./palettes.js";

const PALETTE_KEY = "trivially_palette";
const THEME_KEY = "trivially_theme";

// A saved option that no longer exists falls back to the first one.
function loadPalette() {
  const saved = Number(localStorage.getItem(PALETTE_KEY));
  if (PALETTES.some((p) => p.id === saved)) return saved;
  return PALETTES[0].id;
}

function applyPalette(id) {
  const palette = PALETTES.find((p) => p.id === id) || PALETTES[0];
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
  const palette = PALETTES.find((p) => p.id === paletteId) || PALETTES[0];

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
