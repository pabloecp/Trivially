const STRIP = /[^\p{L}\p{N}]+/gu;

export function normalizeAnswer(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "") // Remueve (feat. ...), [Remix], etc.
    .replace(STRIP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDigitsOnly(value = "") {
  return value.replace(/\D/g, "");
}

export function levenshtein(a, b) {
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
    }
  }
  return dp[m][n];
}

export function isCorrectAnswer(guess, song) {
  const g = normalizeAnswer(guess);
  if (!g) return false;

  const rawCandidates = [
    song.title,
    song.title?.replace(/\(.*?\)|\[.*?\]/g, ""),
    ...(song.aliases || []),
  ].filter(Boolean);

  const candidates = [...new Set(rawCandidates.map(normalizeAnswer).filter(Boolean))];

  return candidates.some((c) => {
    if (g === c) return true;

    // Comparación numérica si aplica (ej. 25/8 -> 25 8 vs 258)
    const digitsG = cleanDigitsOnly(g);
    const digitsC = cleanDigitsOnly(c);
    if (digitsG && digitsG.length >= 2 && digitsG === digitsC) return true;

    const maxLen = Math.max(g.length, c.length);
    if (maxLen <= 3) return g === c;

    const distance = levenshtein(g, c);
    const ratio = distance / maxLen;

    // Si el guess es un prefijo o substring significativo (ej. "me fui de vacaciones" vs "me fui de vacaciones bad bunny")
    if (c.includes(g) && g.length >= Math.min(6, c.length)) return ratio <= 0.35;
    if (g.includes(c) && c.length >= 6) return ratio <= 0.35;

    // Tolerancia tipográfica de 1 o 2 caracteres según longitud
    return ratio <= 0.20 && distance <= 3;
  });
}


/** One key per recording, so the search box lists a song once even when the catalog and Spotify both have it:
 *  the title (a remix apart from its original) and the main artist ("Myke Towers & Bad Bunny" → "myke towers"). */
export function songKey(song = {}) {
  const title = String(song.title || "").replace(/(vol\.?\s*\d+)\/\d+/i, "$1");
  const remix = /\bremix\b/i.test(title) ? "|remix" : "";
  const artist = String(song.artistName || "").split(/\s*(?:&|,|\bfeat\.?|\bft\.?|\bx\b|\by\b)\s*/i)[0];
  return `${normalizeAnswer(title)}${remix}|${normalizeAnswer(artist)}`;
}
