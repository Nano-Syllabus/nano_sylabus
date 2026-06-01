import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOnboardedUser } from "@/lib/auth";
import { getKnowledgeChunkDetail } from "@/lib/data/knowledge";
import { formatDate } from "@/lib/utils";

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ chunkId: string }>;
}) {
  const { user, profile } = await requireOnboardedUser();
  const { chunkId } = await params;
  const source = await getKnowledgeChunkDetail(chunkId, profile!);

  if (!source) {
    notFound();
  }

  const followUpPrompt = `I am studying ${source.subject}${source.chapter ? `, ${source.chapter}` : ""}. Please answer my follow-up using this grounded source carefully.\n\nMy question: `;

  return (
    <AppShell
      user={user}
      title={
        <Link href="/app/chat" className="text-text-secondary hover:text-text-primary">
          ← Source detail
        </Link>
      }
    >
      <article className="mx-auto max-w-4xl px-5 py-10 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{source.board}</Badge>
          <Badge variant="outline">{source.grade}</Badge>
          <Badge>{source.subject}</Badge>
          {source.chapter ? <Badge variant="mono">{source.chapter}</Badge> : null}
          {source.topic ? <Badge variant="mono">{source.topic}</Badge> : null}
        </div>

        <h1 className="mt-5 font-display text-4xl leading-[1.1] sm:text-5xl">{source.sourceTitle}</h1>
        <p className="mt-3 max-w-2xl text-sm text-text-secondary">
          This is the exact grounded chunk the AI used for part of your answer. Use it to verify the source,
          review the chapter context, or ask a tighter follow-up.
        </p>

        <div className="mt-8 grid gap-3 rounded-2xl border border-border bg-bg-secondary p-5 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-mono-ui uppercase tracking-wider text-text-muted">Source file</p>
            <p className="mt-1 text-sm text-text-primary">{source.sourceName}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono-ui uppercase tracking-wider text-text-muted">Uploaded</p>
            <p className="mt-1 text-sm text-text-primary">{formatDate(source.uploadedAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono-ui uppercase tracking-wider text-text-muted">Chunk position</p>
            <p className="mt-1 text-sm text-text-primary">Chunk {source.chunkIndex + 1}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono-ui uppercase tracking-wider text-text-muted">Source type</p>
            <p className="mt-1 text-sm text-text-primary uppercase">{source.sourceType}</p>
          </div>
        </div>

        <section className="mt-8">
          <p className="text-[10px] font-mono-ui uppercase tracking-wider text-text-muted">Grounded excerpt</p>
          <div className="mt-3 rounded-2xl border border-border bg-bg-primary p-5">
            <Markdown text={source.content} className="text-sm leading-7" />
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href={`/app/chat?subject=${encodeURIComponent(source.subject)}&prompt=${encodeURIComponent(followUpPrompt)}`}>
            <Button size="sm">Ask follow-up from this source →</Button>
          </Link>
          <Link href={`/app/explore/${encodeURIComponent(source.subject)}`}>
            <Button size="sm" variant="outline">
              Browse {source.subject}
            </Button>
          </Link>
        </div>
      </article>
    </AppShell>
  );
}
