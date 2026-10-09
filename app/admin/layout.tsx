import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminFrameShell } from "@/components/admin/admin-frame-shell";

/** The admin sidebar, shared by every admin page so navigation never repaints it. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Same name as ADMIN_NAV_COOKIE in the shell (a client module, so not importable here).
  const collapsed = (await cookies()).get("admin_nav")?.value === "collapsed";
  return <AdminFrameShell initialCollapsed={collapsed}>{children}</AdminFrameShell>;
}
