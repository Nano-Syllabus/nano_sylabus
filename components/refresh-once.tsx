"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the current route once after mount. The app layout uses it when it
 * just switched the student's active faculty to this subdomain's: pages render
 * alongside the layout, so their first paint may show the previous faculty.
 */
export function RefreshOnce() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
