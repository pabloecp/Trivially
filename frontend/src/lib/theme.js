import { useSyncExternalStore } from "react";

// The theme (Ajustes → Tema): "sistema" follows the device (light or dark), "claro" and "oscuro" are chosen. The choice
// is kept in this browser; the page's colours are tokens (styles/palettes.css, dark; styles/light.css, light) switched
// by `data-theme` on <html>. This file also runs first (main.jsx) so the page never flashes the wrong one.
const KEY = "trivially_theme_choice";
export const THEMES = ["sistema", "claro", "oscuro"];

// Older colour options and the background music's settings are dropped so they don't linger in the browser.
for (const key of [
  "trivially_palette_v2",
  "trivially_palette",
  "trivially_theme",
  "trivially_music",
  "trivially_music_option",
  "trivially_music_volume",
]) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to clean.
  }
}

const listeners = new Set();
const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

export function getThemeChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : "sistema";
  } catch {
    return "sistema";
  }
}

const resolve = (choice) => (choice === "claro" || (choice === "sistema" && query?.matches) ? "light" : "dark");

function apply() {
  const theme = resolve(getThemeChoice());
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eef0f4" : "#0a0b0c");
}

export function setThemeChoice(choice) {
  try {
    localStorage.setItem(KEY, THEMES.includes(choice) ? choice : "sistema");
  } catch {
    // Storage blocked: it lasts until the page is reloaded.
  }
  apply();
  listeners.forEach((fn) => fn());
}

// The device changes (the system's own switch at sunset, say): "sistema" follows it.
query?.addEventListener?.("change", () => {
  apply();
  listeners.forEach((fn) => fn());
});

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useThemeChoice = () => useSyncExternalStore(subscribe, getThemeChoice, () => "sistema");

apply();
