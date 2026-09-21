import { Suspense } from "react";
import { ChatRouteLoading } from "@/components/chat-route-loading";
import { LibraryWorkspaceSkeleton } from "@/components/library-nanoai-workspace";

export default function ChatLoading() {
  // Library is what the sidebar opens, so it is also what shows while the URL is read.
  return (
    <Suspense fallback={<LibraryWorkspaceSkeleton />}>
      <ChatRouteLoading />
    </Suspense>
  );
}
