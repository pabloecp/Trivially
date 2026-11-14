import { useSyncExternalStore } from "react";
import { EN } from "./en.js";

// The site's language. Spanish is the one the texts are written in: `t("Texto en español")` gives back the same text,
// or its English when the language is English and the dictionary (en.js) has it. A text with no translation yet simply
// stays in Spanish. The choice is kept on this device (`trivially_lang`, like the theme).
const KEY = "trivially_lang";
export const LANGS = ["es", "en"];
const listeners = new Set();

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {}
  // First visit: the browser's language, Spanish otherwise.
  return typeof navigator !== "undefined" && /^en\b/i.test(navigator.language || "") ? "en" : "es";
}

let current = read();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLang() {
  return current;
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {}
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Counts like "5 rondas" or "10 s" and lines of them ("5 rondas · 10 s · Cerradas") come from the settings, with any
// number: they are put together part by part.
const UNITS = [
  [/^(\d+) rondas?$/, (n) => `${n} ${n === "1" ? "round" : "rounds"}`],
  [/^(\d+) canciones?$/, (n) => `${n} ${n === "1" ? "song" : "songs"}`],
  [/^(\d+) países$/, (n) => `${n} ${n === "1" ? "country" : "countries"}`],
  [/^(\d+) tableros?$/, (n) => `${n} ${n === "1" ? "board" : "boards"}`],
  [/^(\d+) lluvias?$/, (n) => `${n} ${n === "1" ? "rain" : "rains"}`],
];

function inEnglish(es) {
  if (EN[es] !== undefined) return EN[es];
  if (es.includes(" · ")) return es.split(" · ").map(inEnglish).join(" · ");
  for (const [re, fn] of UNITS) {
    const m = es.match(re);
    if (m) return fn(m[1]);
  }
  return es;
}

/** Translates `es` (the Spanish text). `vars` fills "{name}" gaps, in either language. */
export function translate(es, vars) {
  let text = current === "en" ? inEnglish(es) : es;
  if (vars) for (const k of Object.keys(vars)) text = text.split(`{${k}}`).join(String(vars[k]));
  return text;
}

/** In a component: gives `t` and re-renders it when the language changes. */
export function useT() {
  useSyncExternalStore(subscribe, getLang);
  return translate;
}

export function useLang() {
  return [useSyncExternalStore(subscribe, getLang), setLang];
}
