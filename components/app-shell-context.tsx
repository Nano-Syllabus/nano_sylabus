"use client";

import { createContext, type ReactNode } from "react";

export const AppShellContext = createContext<{
  setTitle: (title: ReactNode) => void;
  setActions: (actions: ReactNode) => void;
  setTopbarSuppressed: (suppressed: boolean) => void;
  setSidebarSuppressed: (suppressed: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightRailWidth: (width: number) => void;
}>({
  setTitle: () => {},
  setActions: () => {},
  setTopbarSuppressed: () => {},
  setSidebarSuppressed: () => {},
  setSidebarCollapsed: () => {},
  setRightRailWidth: () => {},
});
