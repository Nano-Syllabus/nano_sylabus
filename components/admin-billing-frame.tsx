import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CreditCard, Globe, LayoutDashboard, Trophy, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type AdminSection = "overview" | "users" | "billing" | "cash-prize" | "sites";

const sections: Array<{ id: AdminSection; href: string; label: string; icon: typeof Users }> = [
  { id: "overview", href: "/admin", label: "Overview", icon: LayoutDashboard },
  { id: "users", href: "/admin/users", label: "Students", icon: Users },
  { id: "billing", href: "/admin/billing", label: "Payments", icon: CreditCard },
  { id: "cash-prize", href: "/admin/cash-prize", label: "Prize draw", icon: Trophy },
  { id: "sites", href: "/admin/sites", label: "Websites", icon: Globe },
];

/** The one frame every admin page sits in: five places, nothing else. */
export function AdminBillingFrame({
  children,
  active = "billing",
  wide = false,
}: {
  children: ReactNode;
  active?: AdminSection;
  /** Full width, for side-by-side work such as the website editor. */
  wide?: boolean;
  /** Kept for existing callers; the page heading carries the title now. */
  title?: string;
}) {
  const linkClass = (section: AdminSection) =>
    `flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
      active === section
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    }`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#admin-workspace-content"
        className="sr-only z-50 rounded-md bg-card p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to admin content
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-border bg-card lg:flex">
        <Link href="/admin" className="flex h-16 items-center gap-2.5 px-5">
          <Image src="/nanologo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="font-display text-base font-semibold tracking-tight">Admin</span>
        </Link>
        <nav aria-label="Admin navigation" className="mt-2 space-y-1 px-3">
          {sections.map(({ id, href, label, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              aria-current={active === id ? "page" : undefined}
              className={linkClass(id)}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border p-3">
          <Link
            href="/app/today"
            className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Back to app
          </Link>
          <ThemeToggle className="rounded-md bg-card" />
        </div>
      </aside>

      <div className="min-w-0 lg:pl-56">
        <header className="border-b border-border bg-card lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link href="/admin" className="flex items-center gap-2">
              <Image src="/nanologo.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="font-display text-sm font-semibold">Admin</span>
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/app/today"
                aria-label="Back to app"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft size={17} />
              </Link>
              <ThemeToggle className="rounded-md bg-card" />
            </div>
          </div>
          <nav aria-label="Mobile admin navigation" className="flex gap-1 overflow-x-auto px-3 pb-2">
            {sections.map(({ id, href, label, icon: Icon }) => (
              <Link
                key={id}
                href={href}
                aria-current={active === id ? "page" : undefined}
                className={`${linkClass(id)} min-h-9 text-xs`}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main
          id="admin-workspace-content"
          className={`mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${wide ? "max-w-none" : "max-w-6xl"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** Plain page heading: what this page is, in one sentence, with its actions on the right. */
export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
