// Respuestas abiertas (preguntas de texto libre): decide si lo que escribió el jugador equivale a la respuesta
// de la pregunta, tolerando acentos, mayúsculas, artículos, orden de palabras y errores ortográficos pequeños.
//
// pregunta = {
//   answer: "Buenos Aires",       // forma canónica
//   aliases: ["Bs As"],           // otras respuestas válidas
//   answerType: "text" | "name",  // "name": un apellido/palabra final basta ("Cervantes" → "Miguel de Cervantes")
//   reject: ["nigeria"],          // respuestas parecidas que NO valen (ej. Níger vs Nigeria)
// }

const ARTICLES = new Set(["el", "la", "los", "las", "un", "una", "the", "a", "an", "l"]);
const CONNECTORS = new Set(["de", "del", "y", "e", "of", "and", "en"]);

export function normalizeOpen(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Palabras que cuentan: sin artículos ni conectores ("la ciudad de mexico" → ["ciudad", "mexico"]).
function tokens(normalized) {
  const all = normalized.split(" ").filter(Boolean);
  const significant = all.filter((t) => !ARTICLES.has(t) && !CONNECTORS.has(t));
  return significant.length ? significant : all;
}

// Distancia de edición con transposición ("pasi" ↔ "país" cuenta como 1 error, no 2).
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

// Errores permitidos según el largo: palabras cortas casi exactas, largas con un poco más de margen.
function allowedErrors(length) {
  if (length <= 4) return 0;
  if (length <= 6) return 1;
  if (length <= 10) return 2;
  return 3;
}

// Dos palabras "son la misma" si coinciden, o si difieren poco y empiezan igual (un typo rara vez cambia la inicial).
function sameWord(a, b) {
  if (a === b) return true;
  if (a[0] !== b[0]) return false;
  return editDistance(a, b) <= allowedErrors(Math.max(a.length, b.length));
}

// Cada palabra de `from` tiene su pareja distinta en `to` (sin importar el orden).
function coveredBy(from, to) {
  const free = [...to];
  return from.every((word) => {
    const i = free.findIndex((other) => sameWord(word, other));
    if (i === -1) return false;
    free.splice(i, 1);
    return true;
  });
}

const NUMERIC = /^[\d\s.,]+$/;
const digitsOf = (s) => s.replace(/\D/g, "");

function matchesCandidate(guess, candidate, answerType) {
  if (guess === candidate) return true;

  // Números y años: exactos (1492 ≠ 1429); "1.000" = "1000".
  if (NUMERIC.test(candidate)) return NUMERIC.test(guess) && digitsOf(guess) === digitsOf(candidate);
  if (NUMERIC.test(guess)) return false;

  const g = tokens(guess);
  const c = tokens(candidate);
  if (!g.length || !c.length) return false;

  // Mismas palabras (con typos), en cualquier orden y sin palabras de más ni de menos.
  if (g.length === c.length && coveredBy(g, c)) return true;

  // Escrito sin espacios o con espacios de más: "buenosaires".
  const gj = g.join("");
  const cj = c.join("");
  if (gj[0] === cj[0] && editDistance(gj, cj) <= allowedErrors(Math.max(gj.length, cj.length)) && Math.min(gj.length, cj.length) >= 5) {
    return true;
  }

  // Nombres de persona: basta el apellido (la última palabra), si es lo bastante distintivo.
  if (answerType === "name" && c.length > 1 && g.length === 1 && g[0].length >= 4) {
    return sameWord(g[0], c[c.length - 1]);
  }

  return false;
}

export function isCorrectOpenAnswer(guess, question) {
  const g = normalizeOpen(guess);
  if (!g || !question) return false;

  const rejected = (question.reject || []).map(normalizeOpen);
  if (rejected.includes(g)) return false;

  const candidates = [...new Set([question.answer, ...(question.aliases || [])].map(normalizeOpen).filter(Boolean))];
  return candidates.some((c) => matchesCandidate(g, c, question.answerType));
}
