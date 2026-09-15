"use client";

import Link from "next/link";

export function LandingPrimaryCta({
  children,
  blue = false,
  size = "nav",
  className = "",
}: {
  children?: React.ReactNode;
  blue?: boolean;
  size?: "default" | "hero" | "nav";
  className?: string;
}) {
  const sizeClass =
    size === "hero"
      ? "min-h-[58px] px-8 text-[15px] font-semibold"
      : size === "nav"
        ? "min-h-[44px] px-5 text-[13.5px] font-semibold"
        : "min-h-[48px] px-6 text-sm font-semibold";
  const colorClass = blue
    ? "bg-[#3049ed] text-white hover:bg-[#2439d0] focus-visible:ring-[#3049ed]"
    : "bg-[#1c1e1a] text-white hover:bg-[#33362e] focus-visible:ring-[#1c1e1a]";

  return (
    <Link
      href="/communities"
      className={`inline-flex items-center justify-center gap-2.5 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizeClass} ${colorClass} ${className}`}
    >
      <span>{children ?? "Find your program"}</span>
      <span aria-hidden="true" className="text-base font-bold leading-none">
        ↗
      </span>
    </Link>
  );
}
