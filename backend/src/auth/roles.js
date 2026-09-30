// User roles, lowest to highest. A user can manage only roles strictly below their own.
//   user       normal player (default)
//   moderator  can see the user list
//   admin      can also promote/demote users and moderators
//   owner      can also promote/demote admins. Never assigned through the API: it comes from OWNER_IDS.
export const ROLES = ["user", "moderator", "admin", "owner"];

export function roleLevel(role) {
  const i = ROLES.indexOf(role);
  return i === -1 ? 0 : i;
}

export function isValidRole(role) {
  return ROLES.includes(role);
}

export function hasRole(user, minRole) {
  if (!user || user.isGuest) return false;
  return roleLevel(effectiveRole(user)) >= roleLevel(minRole);
}

/** User ids listed in OWNER_IDS (comma separated) get the owner role. Ids never change, unlike names or emails. */
export function ownerIds() {
  return (process.env.OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The role a stored user actually has: OWNER_IDS wins, then the saved role, then "user". */
export function effectiveRole(user) {
  if (!user || user.isGuest) return "user";
  if (ownerIds().includes(user.id)) return "owner";
  if (user.role === "owner") return "admin"; // an owner removed from OWNER_IDS keeps admin rights only
  return isValidRole(user.role) ? user.role : "user";
}

/** Throws unless `actor` may give `target` the role `nextRole`. */
export function assertCanSetRole(actor, target, nextRole) {
  if (!isValidRole(nextRole)) throw new Error("Rol no válido");
  if (nextRole === "owner") throw new Error("El rol de owner solo se asigna desde la configuración del servidor");
  if (!hasRole(actor, "admin")) throw new Error("No tienes permiso para cambiar roles");
  if (!target || target.isGuest) throw new Error("Solo los usuarios registrados pueden tener un rol");
  if (actor.id === target.id) throw new Error("No puedes cambiar tu propio rol");
  const mine = roleLevel(effectiveRole(actor));
  if (roleLevel(effectiveRole(target)) >= mine) throw new Error("No puedes cambiar el rol de alguien con tu mismo rango o superior");
  if (roleLevel(nextRole) >= mine) throw new Error("No puedes dar un rol igual o superior al tuyo");
}
