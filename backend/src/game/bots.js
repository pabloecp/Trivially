// The bots of the public matches. Each is a fixed profile that looks like a player's account (or like a guest): the name,
// the Blob colour it is allowed (white for a guest; white or one of the account colours for a registered one), and an
// elo in every game that moves with its results like anyone's. Their difficulty follows that elo (elo.js skillFor), and
// a search puts bots with an elo close to the humans' in the room. They live in memory only (a restart draws them
// again) and are never saved with the accounts. Players must never be able to tell a bot from a person.
import crypto from "node:crypto";
import { BLOB_ACCOUNT, BLOB_WHITE } from "../db/store.js";
import { ELO_GAMES, searchElo, skillFor } from "./elo.js";

// Two words, like game bots: a first name and a nickname, in Spanish or English ("Andrea Galaxy", "Leo Tormenta").
const BOT_FIRST = [
  "Andrea", "Leo", "Sofía", "Max", "Lucía", "Diego", "Emma", "Mateo", "Valeria", "Nico", "Camila", "Bruno",
  "Olivia", "Hugo", "Mía", "Iker", "Zoe", "Tomás", "Ava", "Gael", "Noah", "Daniela", "Liam", "Renata",
];
const BOT_LAST = [
  "Galaxy", "Tormenta", "Nova", "Thunder", "Pixel", "Cometa", "Blaze", "Rayo", "Storm", "Shadow", "Luna", "Fénix",
  "Spark", "Volcán", "Frost", "Turbo", "Eclipse", "Neón", "Rocket", "Tigre", "Ninja", "Trueno", "Comet", "Ciclón",
];

export const BOT_POOL = 72;
// Ratings the pool is spread over, so there are bots for beginners and for the best.
const BOT_ELO_RANGE = [300, 6000];
// Of every ten bots, this many are guests (white Blob).
const GUEST_SHARE = 0.4;

const hex = (bytes) => crypto.randomBytes(bytes).toString("hex");
const fold = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

let roster = null;

function buildRoster(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const names = new Set();
  const profiles = new Map();
  for (let i = 0; i < BOT_POOL; i += 1) {
    let name = `${pick(BOT_FIRST)} ${pick(BOT_LAST)}`;
    for (let tries = 0; tries < 30 && names.has(name); tries += 1) name = `${pick(BOT_FIRST)} ${pick(BOT_LAST)}`;
    if (names.has(name)) continue;
    names.add(name);
    const isGuest = random() < GUEST_SHARE;
    // A guest's white, or an account's: white or any of the account colours.
    const avatar = isGuest ? BLOB_WHITE : random() < 0.15 ? BLOB_WHITE : pick(BLOB_ACCOUNT);
    // More bots at the low elos, where most players are.
    const base = BOT_ELO_RANGE[0] + random() ** 1.8 * (BOT_ELO_RANGE[1] - BOT_ELO_RANGE[0]);
    const elo = {};
    for (const game of ELO_GAMES) {
      const rating = Math.round(base * (0.92 + random() * 0.16));
      elo[game] = { rating, games: 20 + Math.floor(random() * 200), best: rating };
    }
    const id = isGuest ? `gst_${hex(5)}` : `usr_${Date.now()}_${hex(6)}`;
    profiles.set(id, { id, name, username: isGuest ? null : `${fold(name)}${Math.floor(random() * 90) + 10}`, avatar, isGuest, bot: true, elo });
  }
  return profiles;
}

/** Every bot profile, by id (drawn the first time it is asked for). */
export function botRoster() {
  roster ||= buildRoster();
  return roster;
}

/** A bot's profile by id, or null when the id is nobody's bot. */
export const botProfile = (id) => botRoster().get(id) || null;

/**
 * `count` bots for a room: not already in it (`takenIds`, `takenNames`), with an elo close to `target` in `game` (null:
 * the Clásico's general one), a bit at random so it isn't always the same ones. Each comes with the `skill` its elo asks.
 */
export function pickBots(count, { game = null, target = 500, takenIds = new Set(), takenNames = new Set(), random = Math.random } = {}) {
  const free = [...botRoster().values()].filter((b) => !takenIds.has(b.id) && !takenNames.has(b.name));
  const scored = free
    .map((b) => ({ b, gap: Math.abs(searchElo(b, game) - target) + random() * Math.max(150, target * 0.2) }))
    .sort((x, y) => x.gap - y.gap);
  return scored.slice(0, count).map(({ b }) => ({
    id: b.id,
    name: b.name,
    avatar: b.avatar,
    isGuest: b.isGuest,
    bot: true,
    // A little different each match, so two of the same elo don't play the same.
    skill: Math.min(0.85, Math.max(0.1, skillFor(searchElo(b, game)) + (random() - 0.5) * 0.08)),
  }));
}

/** A bot's profile as another player's public profile (the profile page and the friends' lists of an account). */
export function botPublicProfile(id) {
  const b = botProfile(id);
  if (!b || b.isGuest) return null;
  return {
    id: b.id,
    name: b.name,
    username: b.username,
    avatar: b.avatar,
    isGuest: false,
    stats: { totalScore: 0, bestScore: 0, gamesPlayed: b.elo.opciones.games, wins: Math.round(b.elo.opciones.games * 0.4), bestStreak: 0, correctAnswers: 0, artistHits: {} },
    rank: null,
    elo: b.elo,
    history: [],
    googleLinked: false,
    spotifyLinked: false,
    role: "user",
  };
}
