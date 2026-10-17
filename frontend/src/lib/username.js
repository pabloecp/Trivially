// The username ("@pepe_23"): letters (no accents), numbers and _, 3 to 20. It is typed in lower case without the "@",
// which the box shows by itself. Same rules as the server's auth/username.js.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** What the box keeps of what was typed or pasted: no "@", lower case, only the allowed characters, 20 at most. */
export const cleanUsername = (value) =>
  String(value || "").toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "").slice(0, USERNAME_MAX);
