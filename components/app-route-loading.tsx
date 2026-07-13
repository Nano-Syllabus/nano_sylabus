type LoadingVariant = "chat" | "subjects" | "notes" | "billing" | "settings";

const titleByVariant: Record<LoadingVariant, string> = {
  chat: "Loading chat",
  subjects: "Loading subjects",
  notes: "Loading notes",
  billing: "Loading billing",
  settings: "Loading settings",
};

function SidebarSkeleton() {
  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-border bg-bg-primary md:block">
      <div className="space-y-4 p-5">
        <div className="h-7 w-36 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        <div className="mt-10 space-y-3">
          <div className="h-10 rounded-xl bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-10 rounded-xl bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-10 rounded-xl bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-10 rounded-xl bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        </div>
        <div className="pt-8 space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="h-5 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none"
              style={{ width: `${88 - index * 6}%` }}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

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
    <div className="flex h-[100dvh] overflow-hidden bg-bg-primary text-text-primary">
      <SidebarSkeleton />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-12 items-center justify-between gap-3 px-4 md:px-8">
          <div className="h-5 w-44 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-9 w-28 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-6 md:px-8">
            <p className="font-mono-ui text-xs uppercase tracking-[0.22em] text-text-muted">
              {titleByVariant[variant]}
            </p>
          </div>
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
        </div>
      </main>
    </div>
  );
}
