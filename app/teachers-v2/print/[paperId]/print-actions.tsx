"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintActions({ paperId }: { paperId: string }) {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-[210mm] items-center justify-between gap-3 print:hidden">
      <Link href={`/teachers?paper=${encodeURIComponent(paperId)}`} className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2">
        ← Back to paper workspace
      </Link>
      <Button type="button" onClick={() => window.print()}>Print or save PDF</Button>
    </div>
  );
}
