"use client";

import { createContext, type ReactNode } from "react";

export const AppShellContext = createContext<{
  upgradeHref?: string | null;
  setTitle: (title: ReactNode) => void;
  setActions: (actions: ReactNode) => void;
  setSidebarSuppressed: (suppressed: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightRailWidth: (width: number) => void;
}>({
  setTitle: () => {},
  setActions: () => {},
  setSidebarSuppressed: () => {},
  setSidebarCollapsed: () => {},
  setRightRailWidth: () => {},
});
