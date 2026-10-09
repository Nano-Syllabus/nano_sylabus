import type { ReactNode } from "react";
import type { AdminSection } from "@/components/admin/admin-frame-shell";

export { AdminPageHeader } from "@/components/admin/admin-page-header";

/**
 * Kept so pages read the same as before. The sidebar itself now lives in
 * app/admin/layout.tsx and picks the active entry (and the editor's full width)
 * from the URL, so these props no longer change anything.
 */
export function AdminBillingFrame({
  children,
}: {
  children: ReactNode;
  active?: AdminSection;
  wide?: boolean;
  title?: string;
}) {
  return <>{children}</>;
}
