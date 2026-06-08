"use client";

import { createContext, type ReactNode } from "react";

export const AppShellContext = createContext<{
  setTitle: (title: ReactNode) => void;
  setActions: (actions: ReactNode) => void;
}>({
  setTitle: () => {},
  setActions: () => {},
});
