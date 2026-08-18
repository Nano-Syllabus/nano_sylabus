"use client";

import { useState } from "react";
import Link from "next/link";

export function LandingHeader({ dark = false }: { dark?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-colors ${
        dark
          ? "border-white/10 bg-[#07101e]/85 text-white"
          : "border-[rgba(19,34,60,0.08)] bg-white/90 text-[#111b33]"
      }`}
    >
      <div className="mx-auto flex h-[78px] max-w-[1180px] items-center justify-between gap-8 px-6">
        <Link
          className={`flex items-center gap-2.5 font-[850] no-underline ${
            dark ? "text-white" : "text-[#111b33]"
          }`}
          href="/"
        >
          <span className="relative h-[27px] w-[27px] rounded-lg bg-gradient-to-br from-[#2f6fff] to-[#62b6ff] shadow-[0_8px_20px_rgba(47,111,255,0.18)] before:absolute before:left-2 before:top-2 before:h-1 before:w-2.5 before:-rotate-[20deg] before:rounded-full before:bg-white after:absolute after:left-2.5 after:top-3.5 after:h-1 after:w-2 after:rotate-[24deg] after:rounded-full after:bg-white after:opacity-90" />
          <span className="text-[15px] font-[850] tracking-[-0.03em]">nanosyllabus</span>
        </Link>

        <nav
          className={`items-center gap-7 text-sm font-medium ${
            dark ? "text-[#93a1b5]" : "text-[#425067]"
          } ${
            menuOpen
              ? `!flex absolute top-[78px] left-3.5 right-3.5 flex-col items-start p-4 rounded-2xl border shadow-[0_20px_50px_rgba(0,0,0,.3)] z-50 ${
                  dark ? "bg-[#0a1424] border-white/10" : "bg-white border-[#dce5ef]"
                }`
              : "hidden md:flex"
          }`}
        >
          <Link
            href="/#features"
            onClick={() => setMenuOpen(false)}
            className={`transition-colors ${dark ? "hover:text-white" : "hover:text-[#111b33]"}`}
          >
            Features
          </Link>
          <Link
            href="/#how"
            onClick={() => setMenuOpen(false)}
            className={`transition-colors ${dark ? "hover:text-white" : "hover:text-[#111b33]"}`}
          >
            How it works
          </Link>
          <Link
            href="/exams"
            onClick={() => setMenuOpen(false)}
            className={`transition-colors ${dark ? "hover:text-white" : "hover:text-[#111b33]"}`}
          >
            Community courses
          </Link>
          <Link
            href="/#readiness"
            onClick={() => setMenuOpen(false)}
            className={`transition-colors ${dark ? "hover:text-white" : "hover:text-[#111b33]"}`}
          >
            Readiness
          </Link>
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f6fff] px-[17px] py-2 text-[13px] font-[800] text-white shadow-[0_14px_28px_rgba(47,111,255,0.18)] transition-all hover:bg-[#2057d5] hover:-translate-y-0.5"
          >
            Start free
          </Link>
          <button
            type="button"
            className={`inline-flex md:hidden items-center justify-center rounded-xl border px-3 py-2 text-[13px] font-[800] ${
              dark
                ? "border-white/15 bg-white/5 text-white"
                : "border-[#cbd5e3] bg-white text-[#111b33]"
            }`}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            Menu
          </button>
        </div>
      </div>
    </header>
  );
}
