import { translate as tr } from "../../lib/i18n.js";
// Farsante's settings and labels (same ids and limits as backend/src/game/farsante.js).

// The kinds of round, in the order they show: what each one asks and how it scores.
export const KINDS = [
  { id: "dato", get label() { return tr("Dato raro"); }, icon: "bulb", get how() { return tr("Inventa una respuesta falsa creíble para una pregunta real"); }, get short() { return tr("Dato raro"); } },
  { id: "pelicula", get label() { return tr("Película inventada"); }, icon: "film", get how() { return tr("Escribe de qué trata una película que no existe"); }, get short() { return tr("Película inventada"); } },
  { id: "frase", get label() { return tr("Frase a completar"); }, icon: "keyboard", get how() { return tr("Termina la frase con lo más gracioso que se te ocurra"); }, get short() { return tr("Frase a completar"); } },
  { id: "noticia", get label() { return tr("Noticia falsa"); }, icon: "info", get how() { return tr("Completa el titular de una noticia absurda"); }, get short() { return tr("Noticia falsa"); } },
];

export function findKind(id) {
  return KINDS.find((k) => k.id === id) || KINDS[0];
}

export const ROUND_OPTIONS = [4, 6, 8, 10, 12];
// Seconds to write an answer.
export const SECONDS_OPTIONS = [30, 45, 60];
export const MAX_CHARS = 60;

export function farsanteConfig(room) {
  const farsante = room?.config?.farsante || {};
  return {
    rounds: farsante.rounds || 8,
    writeMs: farsante.writeMs || 45000,
    // An empty list is kept: it shows unticked, and the match can't start until one is ticked.
    kinds: farsante.kinds ?? KINDS.map((k) => k.id),
  };
}

/** An answer without capitals, accents, punctuation or extra spaces (the server's `sameText`), to know which option is mine. */
export function sameText(a, b) {
  const clean = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return clean(a) === clean(b);
}
