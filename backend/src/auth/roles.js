// Two kinds of account: a normal player ("user") and the owners, who get the debug tools (the gear's panel, "Saltar",
// the test bots, Spotify). Owners are never chosen in the app: they are the account ids in OWNER_IDS.
export const ROLES = ["user", "owner"];

/** User ids listed in OWNER_IDS (comma separated) get the owner role. Ids never change, unlike names or emails. */
export function ownerIds() {
  return (process.env.OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The role an account has: "owner" when its id is in OWNER_IDS, otherwise "user" (guests too). */
export function effectiveRole(user) {
  if (!user || user.isGuest) return "user";
  return ownerIds().includes(user.id) ? "owner" : "user";
}

/** Whether `user` has `role`: every account is a "user", only the ones in OWNER_IDS are "owner". */
export function hasRole(user, role) {
  if (!user || user.isGuest) return false;
  return role === "owner" ? effectiveRole(user) === "owner" : true;
}
