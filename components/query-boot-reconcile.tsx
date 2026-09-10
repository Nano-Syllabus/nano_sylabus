"use client";

import { useEffect } from "react";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";

/**
 * Once per page load: after the browser cache is restored, quietly reconcile it.
 *
 * THE SHAPE OF THE WHOLE CACHING MODEL, IN ONE COMPONENT.
 *
 *   page load    -> restore from localStorage, paint immediately, no spinner
 *                -> then ONE invalidation, so what is on screen refreshes
 *                   underneath content the student is already reading
 *   during the session -> nothing fetches on its own; writes patch the cache
 *   reload       -> the only thing that starts this over
 *
 * Why this is safe rather than optimistic: every screen here shows one student
 * their own data, and that data only changes when they act — in this app, where
 * the write already patched the cache. So the restored copy is almost always
 * already correct, and the reconcile exists for the remainder: a change made on
 * another device, or by an admin. None of it is time-sensitive enough for the
 * gap between paint and reconcile to matter.
 *
 * `refetchType: "active"` is the important argument. It refetches only the
 * queries currently mounted, and merely MARKS the rest invalid — so a screen
 * the student has not opened yet does not fetch until they open it, and then
 * fetches once. Without it, a boot would fire every query the cache has ever
 * held, all at once, which is the thundering herd this design exists to avoid.
 *
 * The module-level flag, not state: this must run once per PAGE LOAD, and a
 * component-level guard would reset every time React remounted the tree.
 */
let reconciledThisLoad = false;

export function QueryBootReconcile() {
  const client = useQueryClient();
  const isRestoring = useIsRestoring();

  useEffect(() => {
    // Reconciling before the restore lands would refetch, then be overwritten
    // by the very disk copy it was meant to replace.
    if (isRestoring || reconciledThisLoad) return;
    reconciledThisLoad = true;
    void client.invalidateQueries({ refetchType: "active" });
  }, [client, isRestoring]);

  return null;
}
