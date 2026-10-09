import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminFrameShell, type AdminSection } from "@/components/admin/admin-frame-shell";

export { AdminPageHeader } from "@/components/admin/admin-page-header";

/** Shared navigation for the admin workspace. */
export async function AdminBillingFrame({
  children,
  active = "billing",
  wide = false,
}: {
  children: ReactNode;
  active?: AdminSection;
  /** Full width, for side-by-side work such as the website editor. */
  wide?: boolean;
  /** Kept for existing callers; the page heading carries the title now. */
  title?: string;
}) {
  // Same name as ADMIN_NAV_COOKIE in the shell (a client module, so not importable here).
  const collapsed = (await cookies()).get("admin_nav")?.value === "collapsed";
  return (
    <AdminFrameShell active={active} wide={wide} initialCollapsed={collapsed}>
      {children}
    </AdminFrameShell>
  );
}
