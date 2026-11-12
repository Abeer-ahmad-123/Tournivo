export const roles = [
  "owner",
  "organizer",
  "admin",
  "referee",
  "manager",
  "player",
  "spectator",
] as const;
export type Role = (typeof roles)[number];
export type Permission = "read" | "manage" | "results" | "discipline" | "members" | "rosters";
const grants: Record<Role, Permission[]> = {
  owner: ["read", "manage", "results", "discipline", "members", "rosters"],
  organizer: ["read", "manage", "results", "discipline", "rosters"],
  admin: ["read", "manage", "results", "discipline", "rosters"],
  referee: ["read", "results"],
  manager: ["read", "rosters"],
  player: ["read"],
  spectator: ["read"],
};
export function hasPermission(role: string, permission: Permission) {
  return roles.includes(role as Role) && grants[role as Role].includes(permission);
}
