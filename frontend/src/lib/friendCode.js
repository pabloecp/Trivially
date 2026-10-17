// A friend's code is 8 letters and numbers (no I, O, 0 or 1; the same alphabet as the server's friends/friendCode.js),
// written "K7P2-M9XQ". The box only takes that: whatever is typed or pasted (spaces, signs, a whole /amigo/ link...) is
// cleaned to the allowed characters, cut at 8, and the hyphen goes in by itself.
const ALLOWED = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;
export const FRIEND_CODE_LENGTH = 8;

/** What the box shows for what was typed or pasted. `deleting`: the user is erasing, so a trailing hyphen is dropped. */
export function formatFriendCodeInput(value, { deleting = false } = {}) {
  // A pasted link: only its last part, the code.
  const text = String(value || "");
  const tail = text.includes("/amigo/") ? text.split("/amigo/").pop() : text;
  const raw = tail.toUpperCase().replace(ALLOWED, "").slice(0, FRIEND_CODE_LENGTH);
  if (raw.length > 4 || (raw.length === 4 && !deleting)) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return raw;
}

export const isFriendCodeComplete = (value) => String(value || "").replace(/-/g, "").length === FRIEND_CODE_LENGTH;
