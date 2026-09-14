"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";

export function LandingPrimaryCta() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadSupabaseBrowserClient()
      .then((supabase) => supabase.auth.getSession())
      .then(({ data: { session } }) => {
        if (!cancelled) setIsLoggedIn(Boolean(session?.user));
      })
      .catch(() => {
        // This CTA is non-gating, so a failed session check keeps the safe
        // signed-out destination instead of blocking the landing page.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href={isLoggedIn ? "/app" : "/communities"}
      className="inline-flex min-h-[44px] items-center justify-center gap-2.5 rounded-lg bg-[#1c1e1a] px-5 text-[13.5px] font-semibold text-white transition-all duration-200 hover:bg-[#33362e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1e1a] focus-visible:ring-offset-2"
    >
      <span>{isLoggedIn ? "Continue learning" : "Start Learning"}</span>
      <span aria-hidden="true" className="text-base font-bold leading-none">
        ↗
      </span>
    </Link>
  );
}
