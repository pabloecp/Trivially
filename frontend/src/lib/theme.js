import { useEffect, useState } from "react";

const THEME_KEY = "yoavlly_theme";

// The light theme is still fully styled, but the app is dark-only for now. Set this to true to bring back the
// theme switch (and the saved preference) everywhere.
export const LIGHT_THEME_ENABLED = false;

function loadTheme() {
  if (!LIGHT_THEME_ENABLED) return "dark";
  return localStorage.getItem(THEME_KEY) || localStorage.getItem("bysong_theme") || "dark";
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
