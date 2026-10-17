import crypto from "node:crypto";
import { saveStore } from "../db/store.js";

// Every account has a friend code ("K7P2-M9XQ"): the way to be found and added, shown in the profile. Same letters and
// numbers as room codes (no I, O, 0 or 1). Guests have none: they aren't kept.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const FRIEND_CODE_LENGTH = 8;

function newCode() {
  let raw = "";
  for (const b of crypto.randomBytes(FRIEND_CODE_LENGTH)) raw += CODE_CHARS[b % CODE_CHARS.length];
  return raw;
}

export const formatFriendCode = (raw) => `${raw.slice(0, 4)}-${raw.slice(4)}`;

/** A pasted code in its stored form ("k7p2 m9xq" → "K7P2M9XQ"), or null when it can't be one. */
export function normalizeFriendCode(input) {
  const raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== FRIEND_CODE_LENGTH || [...raw].some((c) => !CODE_CHARS.includes(c))) return null;
  return raw;
}

export const isAccount = (user) => Boolean(user) && !user.isGuest;

/** The account's friend code (stored, shown as "K7P2-M9XQ"), made the first time it is needed. Guests have none. */
export function friendCodeOf(store, userId) {
  const user = store.users[userId];
  if (!isAccount(user)) return null;
  if (!user.friendCode) {
    const taken = new Set(Object.values(store.users).map((u) => u.friendCode));
    let code = newCode();
    while (taken.has(code)) code = newCode();
    user.friendCode = code;
    saveStore(store);
  }
  return formatFriendCode(user.friendCode);
}

/** The account that has this friend code (pasted in any form), or null. */
export function userByFriendCode(store, input) {
  const code = normalizeFriendCode(input);
  if (!code) return null;
  return Object.values(store.users).find((u) => isAccount(u) && u.friendCode === code) || null;
}
