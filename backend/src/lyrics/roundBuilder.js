import { editDistance, normalizeOpen } from "../game/openAnswers.js";

// Completa la letra's rounds, worked out once, offline (`npm run lyrics:build`): the song's own preview transcribed by
// Whisper with each word's time (only for the times: Whisper mishears with the music behind) is matched word by word to
// the song's real lyrics from LRCLIB (the text shown). The gap is a word heard clearly, never an article, with at least
// MIN_LEAD_S of song before it, in the middle of its line, a chorus one when it can; the song stops CUT_BEFORE_S before
// that word starts.

export const LYRIC_GAP = "___";
const MIN_LEAD_S = 8;
const CUT_BEFORE_S = 0.08;
// Whisper's own confidence in the gap's word, at least.
const MIN_PROBABILITY = 0.6;
// The reveal plays on this long after the gap's line has been sung (when the preview lasts that long).
const TAIL_S = 1;
// While playing, the song comes back this long before the word after the gap, and stops this long after its line.
const BACK_BEFORE_S = 0.05;
const STOP_AFTER_S = 0.3;

// Words that never make a gap: too common to guess, or sounds rather than words.
export const STOPWORDS = new Set(
  (
    "que de la el en y a los las se del por con no una un su para es al lo como mas pero sus le ya o fue este ha si porque " +
    "esta son entre cuando muy sin sobre ser tiene tambien me hasta hay donde quien desde todo nos durante todos uno les ni " +
    "contra otros ese eso ante ellos e esto mi antes algunos unos yo otro otras otra tanto esa estos mucho quienes nada " +
    "muchos cual poco ella estar estas algunas algo nosotros tu te ti tus mis mio mia tuyo tuya eh oh ah uh yeah ey hey ay " +
    "na le baby nah mmm ooh uoh woah whoa pa pal to toa toy " +
    "the and to of in is it you that he was for on are with as his they be at one have this from or had by but not what all " +
    "were we when your can said there use an each which she do how their if will up other about out many then them these so " +
    "some her would make like him into has two more go way could my than been who its did get may am i me im dont " +
    "cant wont gonna wanna gotta just youre theyre thats ive ill id hes shes weve youve ain aint lets whats theres yall"
  ).split(" ")
);

/** LRCLIB's lyrics as lines of text: the synced ones without their "[mm:ss.xx]", else the plain ones; no empty lines. */
export function lyricLines(synced, plain) {
  const text = synced || plain || "";
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\[[^\]]*\]/g, "").trim())
    .filter((l) => normalizeOpen(l));
}

export const norm = (w) => normalizeOpen(String(w).replace(/\([^)]*\)/g, " ")).replace(/ /g, "");
export const like = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && editDistance(a, b) <= Math.floor(Math.max(a.length, b.length) / 4));

/**
 * Matches the words heard (Whisper's, [{ start, end, word, prob }]) to the lyrics' words (lines of text): the best
 * stretch of the lyrics that lines up with what's heard (Smith–Waterman, so a misheard or missing word costs little).
 * Returns, for each lyric word as { line, index, text }, the heard word it matched (or null), and how many matched.
 */
export function alignWords(lines, heard) {
  const lyric = [];
  lines.forEach((text, line) =>
    text
      .replace(/\([^)]*\)/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .forEach((raw, index) => lyric.push({ line, index, text: raw, key: norm(raw) }))
  );
  const words = heard.map((w) => ({ ...w, key: norm(w.word) })).filter((w) => w.key);
  const n = lyric.length;
  const m = words.length;
  const score = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  let best = { s: 0, i: 0, j: 0 };
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const hit = lyric[i - 1].key && like(lyric[i - 1].key, words[j - 1].key);
      const s = Math.max(0, score[i - 1][j - 1] + (hit ? 2 : -1), score[i - 1][j] - 1, score[i][j - 1] - 1);
      score[i][j] = s;
      if (s > best.s) best = { s, i, j };
    }
  }
  const match = new Array(n).fill(null);
  let matched = 0;
  let { i, j } = best;
  while (i > 0 && j > 0 && score[i][j] > 0) {
    const hit = lyric[i - 1].key && like(lyric[i - 1].key, words[j - 1].key);
    if (hit && score[i][j] === score[i - 1][j - 1] + 2) {
      match[i - 1] = words[j - 1];
      matched += 1;
      i -= 1;
      j -= 1;
    } else if (score[i][j] === score[i - 1][j] - 1) i -= 1;
    else if (score[i][j] === score[i][j - 1] - 1) j -= 1;
    else {
      i -= 1;
      j -= 1;
    }
  }
  return { lyric, match, matched, heard: words.length };
}

/**
 * The round of a song from its lyrics' lines and the words heard in its preview (`length`: the preview's seconds):
 * the gap, where the song stops, until when the reveal plays, the lines shown (each from when it starts in the
 * preview) and three wrong answers. Null when what's heard doesn't line up well enough with the lyrics, or no word fits.
 */
export function pickRound(lines, heard, { length = 30, language = "es" } = {}) {
  const { lyric, match, matched, heard: count } = alignWords(lines, heard);
  // Better 1500 good songs than 3000 badly cut: most of what's heard must be in the lyrics, in order.
  if (matched < 10 || matched < count * 0.55) return null;
  const lineCount = new Map();
  for (const l of lines) lineCount.set(normalizeOpen(l), (lineCount.get(normalizeOpen(l)) || 0) + 1);
  const wordsOf = (line) => lyric.map((w, k) => ({ ...w, k })).filter((w) => w.line === line);
  const candidates = [];
  lyric.forEach((w, k) => {
    const heardWord = match[k];
    if (!heardWord || heardWord.prob < MIN_PROBABILITY || heardWord.start < MIN_LEAD_S) return;
    if (w.key.length < 3 || STOPWORDS.has(w.key) || /\d/.test(w.key)) return;
    const line = wordsOf(w.line);
    const at = line.findIndex((x) => x.k === k);
    // In the middle of its line: two words before it, one after; the word right before it heard too (the cut follows it).
    if (at < 2 || at > line.length - 2 || !match[k - 1]) return;
    const chorus = (lineCount.get(normalizeOpen(lines[w.line])) || 0) > 1;
    const sung = line.filter((x) => match[x.k]).length / line.length;
    const score = (chorus ? 3 : 0) + sung * 2 + Math.min(w.key.length, 9) / 9 + heardWord.prob;
    candidates.push({ score, k, w, line, heardWord });
  });
  // The best one whose answer isn't given away on screen (a chorus line shown just before says it).
  for (const best of candidates.sort((a, b) => b.score - a.score)) {
    const round = buildRound(best);
    if (round) return round;
  }
  return null;

  function buildRound({ k, w, line, heardWord }) {
    const previous = match[k - 1];
    const cut = Math.max(heardWord.start - CUT_BEFORE_S, previous.start + 0.6 * (previous.end - previous.start));
    // The song goes quiet only while the gap's word is sung and comes back with the next word ("Tu jeva se pasa ___ de
    // mí": silent on the answer, then "de mí"), until its line ends; the reveal plays it all, and a bit more.
    const lineEnd = Math.max(...line.map((x) => match[x.k]?.end || 0));
    const nextWord = match[k + 1];
    const back = nextWord ? Math.max(heardWord.end + 0.04, nextWord.start - BACK_BEFORE_S) : heardWord.end + 0.15;
    const stop = Math.min(length, Math.max(back, lineEnd) + STOP_AFTER_S);
    const end = Math.min(length, Math.max(heardWord.end, lineEnd) + TAIL_S);
    // The lines shown: the gap's and the ones heard before it, each from its first heard word.
    const lineStart = (l) => {
      const first = wordsOf(l).find((x) => match[x.k]);
      return first ? match[first.k].start : null;
    };
    const shown = [];
    for (let l = w.line - 1; l >= 0 && shown.length < 3; l -= 1) {
      const at = lineStart(l);
      if (at == null || at < cut - 12) break;
      shown.unshift({ at: Math.max(0, at), text: lines[l].replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim() });
    }
    const answer = w.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const gapLine = line.map((x) => (x.k === k ? x.text.replace(answer, LYRIC_GAP) : x.text)).join(" ");
    // Nowhere else on screen: not in the lines shown before it, nor again in its own line.
    const onScreen = [...shown.map((l) => l.text), gapLine].join(" ").split(/\s+/).map(norm);
    if (onScreen.some((x) => x && like(x, w.key))) return null;
    shown.push({ at: Math.max(0, Math.min(lineStart(w.line) ?? cut, cut)), text: gapLine });
    const round = (s) => Math.round(s * 100) / 100;
    return {
      lines: shown.map((l) => ({ at: round(l.at), text: l.text })),
      cut: round(cut),
      back: round(back),
      stop: round(stop),
      end: round(end),
      answer,
      wrong: wrongAnswers(answer, lines, language, new Set(line.map((x) => x.key))),
      // For the build's check: when the gap's word was heard.
      heard: { start: heardWord.start, end: heardWord.end },
    };
  }
}

// Three believable wrong answers: other words of the same song about as long, else common ones of its language.
const FALLBACK = {
  es: ["corazón", "camino", "noche", "fuego", "tiempo", "cielo", "mirada", "verdad", "locura", "recuerdo", "silencio", "destino"],
  en: ["heart", "night", "fire", "time", "light", "dream", "away", "tonight", "forever", "together", "nothing", "inside"],
};
export function wrongAnswers(answer, lines, language = "es", avoid = new Set()) {
  const key = norm(answer);
  const seen = new Set([key, ...avoid]);
  const pick = [];
  const pool = [...new Set(lines.flatMap((l) => l.replace(/\([^)]*\)/g, " ").split(/\s+/)))]
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => {
      const k = norm(w);
      return k.length >= 3 && !STOPWORDS.has(k) && Math.abs(k.length - key.length) <= 3;
    })
    .sort(() => Math.random() - 0.5);
  for (const w of [...pool, ...[...(FALLBACK[language] || FALLBACK.es)].sort(() => Math.random() - 0.5)]) {
    const k = norm(w);
    if (seen.has(k) || editDistance(k, key) <= 1) continue;
    seen.add(k);
    // Same capitals as the answer ("Ford" → "Fiat"; "dead" → "cold").
    pick.push(/^\p{Lu}/u.test(answer) ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase());
    if (pick.length === 3) break;
  }
  return pick;
}
