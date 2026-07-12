import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { getPublicChatSessionDetail } from "@/lib/data/chat";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SharedChatPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getPublicChatSessionDetail(decodeURIComponent(token));

  if (!session) {
    notFound();
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-bg-primary text-text-primary">
      <header className="sticky top-0 z-10 border-b border-border bg-bg-primary/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-3 px-4 py-3 sm:items-center sm:gap-4 sm:py-4 md:px-6">
          <div className="min-w-0">
            <Link href="/" className="text-sm font-semibold text-text-secondary hover:text-text-primary">
              Nano Syllabus
            </Link>
            <h1 className="mt-1 truncate font-display text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
              {session.title}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Shared chat{session.subjectContext ? ` · ${session.subjectContext}` : ""}
            </p>
          </div>
          <Link
            href="/signup"
            className="inline-flex shrink-0 rounded-full border border-border-strong px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-secondary sm:px-4 sm:text-sm"
          >
            Try Nano
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:gap-5 sm:py-8 md:px-6">
        {session.messages.length > 0 ? (
          session.messages.map((message) => (
            <article
              key={message.id}
              className={cn(
                "animate-fade-in",
                message.role === "user"
                  ? "ml-auto w-fit max-w-[88%] rounded-[22px] bg-bg-tertiary px-3.5 py-2.5 shadow-sm sm:max-w-[min(760px,92%)] sm:rounded-[24px] sm:px-4"
                  : "mr-auto w-full max-w-[920px] py-2",
              )}
            >
              {message.role === "assistant" ? (
                <Markdown text={message.content} className="text-[15px] leading-[26px] font-medium sm:text-[16px] sm:leading-[28px]" />
              ) : (
                <div className="whitespace-pre-wrap break-words text-[15px] leading-[23px] font-medium sm:text-[16px] sm:leading-[24px]">
                  {message.content}
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-border bg-bg-secondary p-6 text-text-secondary">
            This shared chat has no messages yet.
          </div>
        )}
      </section>
    </main>
  );
}
