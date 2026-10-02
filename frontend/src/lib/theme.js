import { useEffect, useState } from "react";

const THEME_KEY = "trivially_theme";

// Light by default with a theme switch and a saved preference, as on main. Set this to false to lock the app to
// the dark theme and hide the switch.
export const LIGHT_THEME_ENABLED = true;

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

// Shared by the new Home and the legacy Layout so the choice survives navigation between them.
export function useTheme() {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (LIGHT_THEME_ENABLED) localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme, canToggle: LIGHT_THEME_ENABLED };
}
