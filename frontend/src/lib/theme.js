import { useEffect, useState } from "react";
import { PALETTES } from "./palettes.js";

const PALETTE_KEY = "trivially_palette";
const THEME_KEY = "trivially_theme";

function loadPalette() {
  const saved = Number(localStorage.getItem(PALETTE_KEY));
  if (PALETTES.some((p) => p.id === saved)) return saved;
  return 1;
}

function applyPalette(id) {
  const palette = PALETTES.find((p) => p.id === id) || PALETTES[0];
  const root = document.documentElement;
  root.setAttribute("data-theme", palette.theme);
  // Option 1 is the base colours; the others are named by their number.
  if (palette.id > 1) root.setAttribute("data-palette", String(palette.id));
  else root.removeAttribute("data-palette");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
  return palette;
}

// Apply the saved option before React renders, so the page never flashes the default colours.
applyPalette(loadPalette());

// Shared by every screen: the theme button walks through the ten colour options (lib/palettes.js).
export function useTheme() {
  const [paletteId, setPaletteId] = useState(loadPalette);
  const palette = PALETTES.find((p) => p.id === paletteId) || PALETTES[0];

  useEffect(() => {
    applyPalette(paletteId);
    localStorage.setItem(PALETTE_KEY, String(paletteId));
    localStorage.setItem(THEME_KEY, palette.theme);
  }, [paletteId]);

  function toggleTheme() {
    setPaletteId((id) => (id % PALETTES.length) + 1);
  }

  return { theme: palette.theme, palette, toggleTheme };
}
