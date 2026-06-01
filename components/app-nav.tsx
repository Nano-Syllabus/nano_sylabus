"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AppUser } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app/chat", label: "Chats", icon: "💬" },
  { href: "/app/explore", label: "Explore", icon: "🧭" },
  { href: "/app/notes", label: "My Notes", icon: "📌" },
  { href: "/app/billing", label: "Billing", icon: "💳" },
  { href: "/app/settings", label: "Settings", icon: "⚙︎" },
];

export function AppNav({ user }: { user: AppUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <nav className="flex flex-col gap-1 px-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-[11px] transition",
              pathname.startsWith(item.href)
                ? "bg-bg-tertiary text-text-primary font-medium shadow-sm"
                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
            )}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-center text-[14px]">
              {item.icon}
            </span>
            <span className="leading-tight">{item.label}</span>
          </Link>
        ))}
        {user.role === "admin" ? (
          <Link
            href="/admin"
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-[11px] transition",
              pathname.startsWith("/admin")
                ? "bg-bg-tertiary text-text-primary font-medium shadow-sm"
                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
            )}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-center text-[14px]">
              🛡️
            </span>
            <span className="leading-tight">Admin</span>
          </Link>
        ) : null}
      </nav>

      <div className="flex-1" />

      <div className="border-t border-border p-2">
        <div className="rounded-2xl border border-border bg-bg-secondary p-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary font-mono-ui text-[11px]">
              {user.fullName[0]?.toUpperCase() ?? "?"}
            </span>
            <div className="w-full min-w-0">
              <div className="truncate text-[12px] font-medium">{user.fullName}</div>
              <div className="truncate text-[10px] text-text-muted">{user.email}</div>
              <div className="mt-0.5 text-[10px] text-text-muted">{user.creditBalance} credits left</div>
            </div>
          </div>
          <Button className="mt-2 w-full rounded-full" variant="outline" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
