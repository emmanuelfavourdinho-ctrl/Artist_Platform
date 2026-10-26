/*
  Explainer: the single source of truth for "which role may do what".

  Roles stay the unit of assignment (User -> UserRole -> Role, exactly as
  before), but admin endpoints now check a PERMISSION, not "is ADMIN".
  That is what lets a MODERATOR review artists and reports without being
  able to see financial records, and a FINANCE_ADMIN see financial records
  without being able to ban anyone.

  The matrix lives in code, not in the unused Permission/RolePermission
  tables, deliberately: it is reviewed in pull requests, versioned with
  the code that enforces it, and cannot be altered by a data change at
  runtime. ADMIN holds every permission — that is the platform's
  last-resort recovery path and is intentionally not removable here.
*/
export const PERMISSIONS = [
  'admin.access', // may open the admin console at all
  'users.view',
  'users.enforce', // warn / restrict / suspend / reinstate (not ban)
  'users.ban', // ban, and reinstate from a ban
  'roles.manage', // grant / revoke staff roles
  'artists.review',
  'artworks.moderate',
  'reports.manage',
  'reviews.moderate',
  'support.manage',
  'audit.view',
  'finance.view',
  'finance.refunds.manage',
  'finance.payouts.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Roles that can be granted/revoked through the admin API. BUYER and
 *  ARTIST are owned by the product flows (signup / artist upgrade). */
export const STAFF_ROLES = ['ADMIN', 'MODERATOR', 'FINANCE_ADMIN'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MODERATOR: [
    'admin.access',
    'users.view',
    'users.enforce',
    'artists.review',
    'artworks.moderate',
    'reports.manage',
    'reviews.moderate',
    'support.manage',
    'audit.view',
  ],
  FINANCE_ADMIN: [
    'admin.access',
    'finance.view',
    'finance.refunds.manage',
    'finance.payouts.manage',
  ],
};

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return granted;
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}

export function isStaff(roles: readonly string[]): boolean {
  return roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role));
}
