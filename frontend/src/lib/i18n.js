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

// Messages the server builds with numbers or names in them.
const NOUNS = { preguntas: "questions", "preguntas distintas": "different questions", tableros: "boards", rondas: "rounds", "categorías": "categories", dificultades: "difficulties", temas: "topics", "categorías o dificultades": "categories or difficulties" };
const noun = (x) => NOUNS[x] || EN[x] || x;
const PATTERNS = [
  [/^Solo hay (\d+) (preguntas distintas|preguntas|tableros) con esos ajustes para (\d+) rondas\. Baja las rondas o elige más (.+)\.$/, (m) => `There are only ${m[1]} ${noun(m[2])} with those settings for ${m[3]} rounds. Lower the rounds or pick more ${noun(m[4])}.`],
  [/^Solo hay (\d+) (preguntas distintas|preguntas) con esos ajustes\. Baja el número de preguntas o elige más temas\.$/, (m) => `There are only ${m[1]} ${noun(m[2])} with those settings. Lower the number of questions or pick more topics.`],
  [/^Solo hay (\d+) preguntas con esos ajustes y hacen falta al menos (\d+)\. Elige más categorías o dificultades\.$/, (m) => `There are only ${m[1]} questions with those settings and at least ${m[2]} are needed. Pick more categories or difficulties.`],
  [/^Revisa el juego (\d+), (.+)\. No hay preguntas con esos ajustes\.$/, (m) => `Check game ${m[1]}, ${noun(m[2])}. There are no questions with those settings.`],
  [/^No hay preguntas para jugar (.+) ahora$/, (m) => `There are no questions to play ${noun(m[1])} right now`],
  [/^El grupo está lleno \(máximo (\d+) jugadores\)$/, (m) => `The group is full (maximum ${m[1]} players)`],
  [/^La partida está llena \(máximo (\d+) jugadores\)$/, (m) => `The match is full (maximum ${m[1]} players)`],
  [/^El nombre no puede superar (\d+) caracteres$/, (m) => `The name can't be longer than ${m[1]} characters`],
  [/^La contraseña debe tener al menos (\d+) caracteres$/, (m) => `The password must be at least ${m[1]} characters long`],
  [/^Espera (\d+) s para (pedirlo|sugerir) otra vez$/, (m) => `Wait ${m[1]} s to ${m[2] === "pedirlo" ? "ask" : "suggest"} again`],
  [/^Ya lo invitaste: espera (\d+) s$/, (m) => `You already invited them: wait ${m[1]} s`],
  [/^Máximo (\d+) caracteres$/, (m) => `At most ${m[1]} characters`],
  [/^Máximo (\d+) bots de prueba$/, (m) => `At most ${m[1]} test bots`],
  [/^Farsante necesita al menos (\d+) jugadores$/, (m) => `Impostor needs at least ${m[1]} players`],
  [/^Una partida pública es de (\d+) como mucho y tu grupo es de (\d+)$/, (m) => `A public match takes at most ${m[1]} and your group has ${m[2]}`],
  [/^Ya cambiaste tu usuario (\d+) veces este mes\. Podrás cambiarlo otra vez el (.+)\.$/, (m) => `You already changed your username ${m[1]} times this month. You can change it again on ${m[2]}.`],
  [/^(.+) ya eligió esa casilla$/, (m) => `${m[1]} already picked that square`],
];

function inEnglish(es) {
  if (EN[es] !== undefined) return EN[es];
  for (const [re, fn] of PATTERNS) {
    const m = es.match(re);
    if (m) return fn(m);
  }
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
