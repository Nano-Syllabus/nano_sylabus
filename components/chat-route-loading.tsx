"use client";

import { useSearchParams } from "next/navigation";
import { AppRouteLoading } from "@/components/app-route-loading";
import { LibraryWorkspaceSkeleton } from "@/components/library-nanoai-workspace";

/**
 * `/app/chat` is two screens, and its skeleton has to be the one on the way.
 *
 * Opened from the sidebar's Library it is the library landing: semesters,
 * subjects, resources. Opened on a conversation (`?session=`) or with a prompt
 * to ask (`?prompt=`) it is a chat. A route skeleton cannot read the URL on the
 * server, so it is picked here.
 */
export function ChatRouteLoading() {
  const params = useSearchParams();
  return params.get("session") || params.get("prompt") ? (
    <AppRouteLoading variant="chat" />
  ) : (
    <LibraryWorkspaceSkeleton />
  );
}
