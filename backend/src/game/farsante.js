import { sameQuestion, toQuizTrack } from "./quiz.js";
import { rainPool } from "./rain.js";
import { HEADLINES, MOVIE_TITLES, SENTENCES } from "../farsante/content.js";

// Farsante: a party game for a group on a call. Every round has a prompt and three stages: everyone writes an
// answer (60 characters at most), then everyone votes for the one they like or believe (never their own), and the
// reveal says who wrote what and who voted for it. There are four kinds of round (`FARSANTE_KINDS`):
//  - "dato": a real question with a rare answer (from the question bank). Everyone invents a believable wrong
//    answer, the real one is mixed in, and the players try to find it: +1000 for voting the real one, +500 for each
//    vote a fake answer gets.
//  - "pelicula": a movie title that doesn't exist; everyone writes its plot.
//  - "frase": a sentence to finish.
//  - "noticia": a headline to finish.
//    In these three, +500 for each vote an answer gets.

export const FARSANTE_GAME = "farsante";
export const FARSANTE_KINDS = ["dato", "pelicula", "frase", "noticia"];
export const FARSANTE_LIMITS = {
  rounds: [4, 6, 8, 10, 12],
  writeMs: [30000, 45000, 60000],
};
export const FARSANTE_VOTE_MS = 25000;
export const FARSANTE_REVEAL_MS = 8000;
export const FARSANTE_MAX_CHARS = 60;
export const FARSANTE_MIN_PLAYERS = 3;
export const FARSANTE_TEST_BOTS = 5;
export const FARSANTE_POINTS = { real: 1000, vote: 500 };

export function defaultFarsanteConfig() {
  return { rounds: 8, writeMs: 45000, kinds: [...FARSANTE_KINDS] };
}

const nearest = (n, allowed, fallback) => (allowed.includes(Number(n)) ? Number(n) : fallback);

/** Merges a settings change into the current ones, keeping every value valid (the kinds can be left empty: no match). */
export function mergeFarsanteConfig(current, change = {}) {
  const base = { ...defaultFarsanteConfig(), ...current };
  return {
    rounds: change.rounds != null ? nearest(change.rounds, FARSANTE_LIMITS.rounds, base.rounds) : base.rounds,
    writeMs: change.writeMs != null ? nearest(change.writeMs, FARSANTE_LIMITS.writeMs, base.writeMs) : base.writeMs,
    kinds: Array.isArray(change.kinds) ? FARSANTE_KINDS.filter((k) => change.kinds.includes(k)) : base.kinds,
  };
}

/** The questions "dato" rounds can use: Trivia's written ones that are not easy (an easy one is too easy to fake). */
export function datoPool(quizQuestions = []) {
  const open = rainPool(quizQuestions);
  const hard = open.filter((q) => q.difficulty === "media" || q.difficulty === "dificil");
  return hard.length >= 30 ? hard : open;
}

function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const TEXTS = { pelicula: MOVIE_TITLES, frase: SENTENCES, noticia: HEADLINES };

/** How many rounds of each ticked kind a match of `rounds` has: shared evenly, the rest going to the first ones. */
export function roundsPerKind(rounds, kinds) {
  const base = Math.floor(rounds / kinds.length);
  const extra = rounds % kinds.length;
  return kinds.map((kind, i) => ({ kind, count: base + (i < extra ? 1 : 0) }));
}

/** Why a match can't be drawn with these settings, or null. */
export function farsanteProblem(config, pool) {
  const settings = mergeFarsanteConfig(config);
  if (!settings.kinds.length) return "Elige al menos un tipo de ronda.";
  const need = roundsPerKind(settings.rounds, settings.kinds).find((r) => r.kind === "dato")?.count || 0;
  const have = new Set(pool.map(sameQuestion)).size;
  return have < need ? `Solo hay ${have} preguntas para las rondas de dato raro y hacen falta ${need}.` : null;
}

/**
 * The match's rounds, in random order: `{ id, kind, text (the prompt), writeMs, voteMs }`, and for a "dato" round
 * `question` (a Trivia track: its answer is the real one) and `truth` (that answer). The prompts of the other kinds
 * don't repeat within a match.
 */
export function pickFarsanteRounds(pool, config, random = Math.random) {
  const settings = mergeFarsanteConfig(config);
  const rounds = [];
  const lists = {};
  const used = new Set();
  for (const { kind, count } of roundsPerKind(settings.rounds, settings.kinds)) {
    for (let i = 0; i < count; i += 1) {
      if (kind === "dato") {
        lists.dato ||= shuffle(pool, random);
        const q = lists.dato.find((x) => !used.has(sameQuestion(x)));
        if (!q) continue;
        used.add(sameQuestion(q));
        const question = toQuizTrack(q);
        rounds.push({ kind, text: question.text, question, truth: question.answer });
      } else {
        lists[kind] ||= shuffle(TEXTS[kind], random);
        rounds.push({ kind, text: lists[kind].pop() });
      }
    }
  }
  return shuffle(rounds, random).map((r, i) => ({ ...r, id: `farsante-${i + 1}`, writeMs: settings.writeMs, voteMs: FARSANTE_VOTE_MS }));
}

/** An answer without capitals, accents, punctuation or extra spaces, to spot two players writing the same thing. */
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
