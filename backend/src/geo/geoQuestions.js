import { createHash } from "node:crypto";
import { isCorrectOpenAnswer } from "../game/openAnswers.js";
import { COUNTRIES } from "./countries.js";

// The Geografía questions, built from geo/countries.js as rows of the `questions` table (mode "mundo"):
//   capital   type "open"      data { kind, country, name, answer, aliases, reject }
//   flag      type "open"      data { kind, country, name, flag, answer, aliases, reject }  (the flag is data.flag)
//   location  type "location"  data { kind, country, name, map }  (map: country names in world-atlas, see worldMap.js)
// `npm run geo:upload --prefix backend` copies them to Supabase. Ids are derived from the kind and the country, so
// uploading again updates the same rows.

export const GEO_MODE = "mundo";
export const GEO_KINDS = ["capital", "flag", "location"];
const DIFFICULTY = { 1: "facil", 2: "media", 3: "dificil" };
// Every flag question asks the same thing: the flag itself is the question (and the prompt never names the country).
export const FLAG_PROMPT = "¿De qué país es esta bandera?";

/** A uuid that is always the same for the same key (shaped like a v5 uuid, so the uuid column accepts it). */
export function stableId(key) {
  const hex = createHash("sha1").update(`trivially:${key}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function row(kind, c, type, prompt, data) {
  return {
    id: stableId(`geo:${kind}:${c.code}`),
    type,
    mode: GEO_MODE,
    category: "geografia",
    difficulty: DIFFICULTY[c.levels[kind]],
    language: "es",
    prompt,
    data: { kind, country: c.code, name: c.label, ...data },
    active: true,
  };
}

// The typo tolerance of written answers must not turn one country's answer into another's ("Viena" / "Vilna",
// "Albania" / "Alemania", "Níger" / "Nigeria"): every answer of another question of the same kind that would be
// accepted goes into the question's `reject`.
function rejectLookAlikes(rows) {
  for (const kind of ["capital", "flag"]) {
    const questions = rows.filter((q) => q.data.kind === kind);
    for (const q of questions) {
      for (const other of questions) {
        if (other === q || other.data.answer === q.data.answer) continue;
        for (const text of [other.data.answer, ...other.data.aliases]) {
          if (isCorrectOpenAnswer(text, q.data)) q.data.reject.push(text);
        }
      }
    }
  }
}

export function buildGeoQuestions(countries = COUNTRIES) {
  const rows = [];
  for (const c of countries) {
    if (c.levels.capital) {
      rows.push(row("capital", c, "open", `¿Cuál es la capital ${c.of}?`, { answer: c.capital, aliases: c.capitalAliases, reject: [] }));
    }
    if (c.levels.flag) {
      rows.push(row("flag", c, "open", FLAG_PROMPT, { flag: c.code.toLowerCase(), answer: c.name, aliases: c.aliases, reject: [] }));
    }
    if (c.levels.location) {
      rows.push(row("location", c, "location", `Ubica en el mapa: ${c.label}`, { map: c.map }));
    }
  }
  rejectLookAlikes(rows);
  return rows;
}
