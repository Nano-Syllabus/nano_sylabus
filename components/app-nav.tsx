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
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
              pathname.startsWith(item.href)
                ? "bg-bg-tertiary text-text-primary font-medium"
                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
            )}
          >
            <span className="w-4 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        {user.role === "admin" ? (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
              pathname.startsWith("/admin")
                ? "bg-bg-tertiary text-text-primary font-medium"
                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
            )}
          >
            <span className="w-4 text-center">🛡️</span>
            Admin
          </Link>
        ) : null}
      </nav>

      <div className="flex-1" />

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary font-mono-ui text-xs">
            {user.fullName[0]?.toUpperCase() ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.fullName}</div>
            <div className="truncate text-[11px] text-text-muted">{user.email}</div>
            <div className="mt-1 text-[11px] text-text-muted">{user.creditBalance} credits left</div>
          </div>
        </div>
        <Button className="mt-3 w-full" variant="outline" size="sm" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </div>
  );
}
