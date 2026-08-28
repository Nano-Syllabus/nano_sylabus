/** Keep application gates aligned with public.is_admin(), not user metadata. */
export function isAdminRole(role: unknown): boolean {
  return role === "admin" || role === "super_admin";
}
