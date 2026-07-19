"use client";

import { useEffect, useContext, type ReactNode } from "react";
import { AppShellContext } from "@/components/app-shell-context";

export function SetAppShell({
  title,
  actions,
}: {
  title?: ReactNode;
  actions?: ReactNode;
}) {
  const { setTitle, setActions } = useContext(AppShellContext);

  useEffect(() => {
    if (title !== undefined) setTitle(title);
    if (actions !== undefined) setActions(actions);
    
    return () => {
      if (title !== undefined) setTitle(null);
      if (actions !== undefined) setActions(null);
    };
  }, [title, actions, setTitle, setActions]);

  return null;
}
