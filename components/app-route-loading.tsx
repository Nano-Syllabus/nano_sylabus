type LoadingVariant = "chat" | "subjects" | "notes" | "billing" | "settings";

const titleByVariant: Record<LoadingVariant, string> = {
  chat: "Loading chat",
  subjects: "Loading subjects",
  notes: "Loading notes",
  billing: "Loading billing",
  settings: "Loading settings",
};

import { SetAppShell } from "@/components/set-app-shell";
function CardGridSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border bg-bg-primary p-5 animate-pulse-soft motion-reduce:animate-none"
        >
          <div className="h-4 w-28 rounded-full bg-bg-secondary" />
          <div className="mt-6 h-8 w-3/4 rounded-full bg-bg-secondary" />
          <div className="mt-4 h-4 w-1/2 rounded-full bg-bg-secondary" />
          <div className="mt-10 flex gap-3">
            <div className="h-10 flex-1 rounded-full bg-bg-secondary" />
            <div className="h-10 flex-1 rounded-full bg-bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-end px-5 pb-6">
      <div className="mb-auto pt-12 space-y-8">
        <div className="ml-auto h-14 w-72 rounded-[2rem] bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        <div className="space-y-3">
          <div className="h-5 w-44 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-5 w-3/4 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-5 w-2/3 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        </div>
      </div>
      <div className="h-28 rounded-3xl border border-border bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
    </div>
  );
}

export function AppRouteLoading({ variant }: { variant: LoadingVariant }) {
  const isCardPage = variant === "subjects" || variant === "notes";

  return (
    <>
      <SetAppShell title={titleByVariant[variant]} />
      {variant === "chat" ? <ChatSkeleton /> : null}
      {isCardPage ? <CardGridSkeleton /> : null}
      {!isCardPage && variant !== "chat" ? (
        <div className="mx-auto max-w-4xl space-y-4 px-5 py-8">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-16 rounded-2xl border border-border bg-bg-secondary animate-pulse-soft motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
