"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hasSessionCookie } from "@/lib/landing-session";

export function LandingPrimaryCta({
  children,
  blue = false,
  size = "nav",
  className = "",
  communityOnly = false,
  joinHref,
  appOrigin = "",
}: {
  children?: React.ReactNode;
  blue?: boolean;
  size?: "default" | "hero" | "nav";
  className?: string;
  communityOnly?: boolean;
  /**
   * A site's one main action: join its community and start onboarding. Every
   * button follows it, except the header button of someone already signed in,
   * which stays "Continue learning".
   */
  joinHref?: string;
  /** Where the app lives when this page is served from a subdomain ("" = here). */
  appOrigin?: string;
}) {
  const isLoggedIn = useLandingSession(!communityOnly);

  const sizeClass =
    size === "hero"
      ? "min-h-[58px] px-8 text-[15px] font-semibold"
      : size === "nav"
        ? "min-h-[44px] px-5 text-[13.5px] font-semibold"
        : "min-h-[48px] px-6 text-sm font-semibold";
  const colorClass = blue
    ? "bg-[var(--lp-primary,#3049ed)] text-white hover:bg-[var(--lp-primary-hover,#2439d0)] focus-visible:ring-[var(--lp-primary,#3049ed)]"
    : "bg-[#1c1e1a] text-white hover:bg-[#33362e] focus-visible:ring-[#1c1e1a]";

  const joins = Boolean(joinHref) && !(isLoggedIn && children === undefined && !communityOnly);
  const defaultHref = communityOnly ? "/communities" : isLoggedIn ? "/app" : "/communities";

  return (
    <Link
      href={joins ? joinHref! : `${appOrigin}${defaultHref}`}
      className={`inline-flex items-center justify-center gap-2.5 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizeClass} ${colorClass} ${className}`}
    >
      <span>
        {joins
          ? (children ?? "Start Learning")
          : communityOnly
          ? (children ?? "Find your program")
          : isLoggedIn
            ? "Continue learning"
            : (children ?? "Start Learning")}
      </span>
      <span aria-hidden="true" className="text-base font-bold leading-none">
        ↗
      </span>
    </Link>
  );
}

/**
 * Whether this browser is signed in on this host. A subdomain never sees the
 * main domain's session, so there it stays false and both doors are shown.
 */
function useLandingSession(enabled = true) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setIsLoggedIn(hasSessionCookie());
  }, [enabled]);
  return isLoggedIn;
}

/**
 * The header button of a faculty or exam site. Everyone comes in the same way:
 * new and returning students alike "Continue learning" — the site's entry signs
 * them in if needed, skips straight to the faculty they joined, or lets a new
 * student pick one of this site's faculties inside the app.
 */
export function LandingSiteActions({ joinHref }: { joinHref: string }) {
  return (
    <Link
      href={joinHref}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[var(--lp-primary,#3049ed)] px-5 text-[13.5px] font-semibold text-white transition-all duration-200 hover:bg-[var(--lp-primary-hover,#2439d0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-primary,#3049ed)] focus-visible:ring-offset-2"
    >
      Continue learning
      <span aria-hidden="true" className="text-base font-bold leading-none">
        ↗
      </span>
    </Link>
  );
}
