import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BarChart3, CreditCard, ShieldCheck, UserCog } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type AdminSection = "billing" | "users";

export function AdminBillingFrame({
  children,
  active = "billing",
  title = "Payment reviews",
}: {
  children: ReactNode;
  active?: AdminSection;
  title?: string;
}) {
  const navClass = (section: AdminSection) =>
    `flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${active === section ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  return (
    <div className="min-h-screen bg-muted/45 text-foreground">
      <a
        href="#admin-workspace-content"
        className="sr-only z-50 rounded-md bg-card p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to admin content
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <Link
          href="/admin"
          className="flex h-[73px] items-center gap-2.5 border-b border-border px-5 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Image src="/nano_logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="font-display text-lg font-semibold tracking-tight">Nano Syllabus</span>
        </Link>
        <p className="px-6 pb-3 pt-7 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Administration
        </p>
        <nav aria-label="Admin navigation" className="space-y-1 px-3">
          <Link
            href="/admin"
            className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <BarChart3 size={17} strokeWidth={1.7} />
            Platform analytics
          </Link>
          <Link
            href="/admin/billing"
            aria-current={active === "billing" ? "page" : undefined}
            className={navClass("billing")}
          >
            <CreditCard size={17} strokeWidth={1.7} />
            Payment reviews
          </Link>
          <Link
            href="/admin/users"
            aria-current={active === "users" ? "page" : undefined}
            className={navClass("users")}
          >
            <UserCog size={17} strokeWidth={1.7} />
            User access
          </Link>
        </nav>
        <div className="mt-auto border-t border-border p-3">
          <Link
            href="/app/today"
            className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={17} />
            Back to app
          </Link>
          <div className="mt-3 flex items-center gap-3 rounded-md bg-muted/60 px-3 py-3">
            <ShieldCheck size={18} className="shrink-0" />
            <div>
              <p className="text-xs font-medium">Administrator</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Restricted workspace</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-60">
        <header className="border-b border-border bg-card">
          <div className="flex h-[72px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <ShieldCheck size={17} className="lg:hidden" />
              <Link href="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>
              <span className="text-muted-foreground">/</span>
              <span className="truncate font-medium">{title}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <ShieldCheck size={14} />
                Admin access
              </span>
              <ThemeToggle className="rounded-md bg-card" />
            </div>
          </div>
        </header>
        <nav aria-label="Mobile admin navigation" className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 lg:hidden">
          <Link href="/admin" className="flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <BarChart3 size={15} /> Analytics
          </Link>
          <Link href="/admin/billing" className={`${navClass("billing")} min-h-9 shrink-0 text-xs`}>
            <CreditCard size={15} /> Payments
          </Link>
          <Link href="/admin/users" className={`${navClass("users")} min-h-9 shrink-0 text-xs`}>
            <UserCog size={15} /> User access
          </Link>
        </nav>
        <main id="admin-workspace-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
