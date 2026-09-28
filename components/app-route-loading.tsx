import type { ReactNode } from "react";
import { SetAppShell } from "@/components/set-app-shell";

type LoadingVariant = "chat" | "exams" | "subjects" | "notes" | "billing" | "settings";

const titleByVariant: Record<LoadingVariant, string> = {
  chat: "Loading chat",
  exams: "Loading exams",
  subjects: "Loading subjects",
  notes: "Loading notes",
  billing: "Loading billing",
  settings: "Loading settings",
};

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

const shimmer = "rounded-full bg-border animate-pulse-soft motion-reduce:animate-none";

/**
 * Settings, drawn with the page's own frame, cards and labels — only the values
 * the server is fetching (the student's name, email, college…) shimmer. The
 * generic stack of bars looked like a different page.
 */
function SettingsSkeleton() {
  const field = (label: string, width: string) => (
    <div key={label} className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">{label}</span>
      <div className="flex h-11 items-center rounded-md border border-border bg-bg-primary px-3">
        <span className={`h-3.5 ${width} ${shimmer}`} />
      </div>
    </div>
  );
  const card = (title: string, children: ReactNode, className = "") => (
    <div className={`rounded-lg border border-border bg-bg-primary ${className}`}>
      <div className="border-b border-border px-5 py-3">
        <h2 className="type-student-section-title">{title}</h2>
      </div>
      {children}
    </div>
  );
  return (
    <div className="student-reading-frame" aria-busy="true">
      <section className="mb-6 rounded-lg border border-border bg-bg-primary">
        <div className="border-b border-border px-5 py-3">
          <h2 className="font-display text-xl">Appearance</h2>
        </div>
        <div className="p-5">
          <p className="text-sm font-medium">Color mode</p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg-secondary p-1">
            {["System", "Light", "Dark"].map((label) => (
              <span key={label} className="flex min-h-10 items-center justify-center text-sm text-text-secondary">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>
      {card(
        "Profile & preferences",
        <>
          <div className="space-y-4 p-5">
            {field("Full name", "w-40")}
            {field("Email", "w-56")}
            {field("Phone number", "w-32")}
            {field("College / institution", "w-48")}
            {field("University / academic authority", "w-44")}
            <div>
              <p className="mb-2 text-xs font-mono-ui uppercase text-text-muted">Default language</p>
              <span className={`block h-9 w-52 ${shimmer}`} />
            </div>
          </div>
          <div className="flex justify-end border-t border-border bg-bg-secondary px-5 py-3">
            <span className="h-10 w-20 rounded-md bg-border" />
          </div>
        </>,
      )}
      {card(
        "Account",
        <div className="p-5">
          <div className="rounded-md border border-destructive/40 bg-[color:var(--note-red)] p-4">
            <p className="text-sm font-medium text-destructive">Delete account</p>
            <p className="mt-1 text-sm text-text-secondary">
              This permanently removes your auth account and cascades your saved study data.
            </p>
            <span className="mt-4 block h-10 w-36 rounded-md bg-border" />
          </div>
        </div>,
        "mt-6",
      )}
    </div>
  );
}

/**
 * Pricing, in the page's own layout: the heading and period switch, three plan
 * cards, and the activity strip. Prices and counts are what the server is
 * reading, so those shimmer; the words that never change are drawn as they are.
 */
function BillingSkeleton() {
  return (
    <main className="min-h-full bg-bg-primary pb-20 pt-6 text-text-primary" aria-busy="true">
      <header className="student-page-width flex flex-col items-center text-center">
        <h1 className="type-student-page-title text-text-primary">Simple plans. Bigger dreams.</h1>
        <div className="mt-5 inline-flex h-11 items-center rounded-full border border-border bg-card p-[2px]">
          <span className="flex h-10 items-center rounded-full bg-text-primary px-6 text-sm font-semibold text-text-inverse">
            1 month
          </span>
          <span className="flex h-10 items-center px-6 text-sm font-semibold text-text-muted">3 months</span>
        </div>
      </header>
      <section className="student-page-width mt-8 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3 lg:gap-5">
        {["Free", "Plus", "Pro"].map((title) => (
          <div
            key={title}
            className={`relative flex min-h-[400px] w-full flex-col rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
              title === "Plus" ? "border-[#aab7e7]" : "border-border"
            }`}
          >
            {title === "Plus" ? (
              <h2 className="type-student-meta mb-2.5 w-fit rounded-md bg-[#d9ff69] px-2 py-1 font-semibold text-[#24300e]">
                {title}
              </h2>
            ) : (
              <h2 className="type-student-card-title text-text-primary">{title}</h2>
            )}
            <span className={`mt-2 block h-8 w-28 ${shimmer}`} />
            <span className={`mt-2 block h-3.5 w-36 ${shimmer}`} />
            <div className="mt-4 h-px w-full bg-border" />
            <div className="mt-5 space-y-3">
              {["w-3/4", "w-2/3", "w-4/5", "w-1/2"].map((width) => (
                <span key={width} className={`block h-3.5 ${width} ${shimmer}`} />
              ))}
            </div>
            <div className="mt-auto pt-7">
              <span className="block h-10 w-full rounded-md bg-border" />
            </div>
          </div>
        ))}
      </section>
      <section className="student-page-width mt-16 sm:mt-20">
        <h2 className="type-student-section-title text-center text-text-primary">
          You don’t have to prepare alone.
        </h2>
        <div className="mt-8 grid overflow-hidden rounded-2xl border border-border bg-card shadow-xs sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className={`px-7 py-6 sm:px-9 sm:py-7 ${index > 0 ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}
            >
              <span className={`block h-9 w-24 ${shimmer}`} />
              <span className={`mt-3 block h-3.5 w-44 ${shimmer}`} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export function AppRouteLoading({ variant }: { variant: LoadingVariant }) {
  const isCardPage = variant === "subjects" || variant === "notes" || variant === "exams";

  return (
    <>
      <SetAppShell title={titleByVariant[variant]} />
      {variant === "chat" ? <ChatSkeleton /> : null}
      {isCardPage ? <CardGridSkeleton /> : null}
      {variant === "settings" ? <SettingsSkeleton /> : null}
      {variant === "billing" ? <BillingSkeleton /> : null}
      {!isCardPage && variant !== "chat" && variant !== "settings" && variant !== "billing" ? (
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
