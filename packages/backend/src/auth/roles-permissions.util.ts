interface UserWithRoles {
  roles: {
    role: { name: string; permissions: { permission: { name: string } }[] };
  }[];
}

export function toRolesAndPermissions(user: UserWithRoles) {
  const permissions = new Set<string>();
  for (const { role } of user.roles) {
    for (const { permission } of role.permissions) {
      permissions.add(permission.name);
    }
  }

  return {
    roles: user.roles.map(({ role }) => role.name),
    permissions: [...permissions],
  };
}
