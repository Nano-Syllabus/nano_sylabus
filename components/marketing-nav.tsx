import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex min-h-10 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 ${className}`}>
      <Image
        src="/nano_logo.png"
        alt="Nano Syllabus"
        width={28}
        height={28}
        className="h-7 w-7 rounded-lg object-contain"
      />
      <span className="font-display text-lg leading-none">Nano Syllabus</span>
    </Link>
  );
}

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-text-secondary md:flex">
          <a href="#features" className="hover:text-text-primary">
            Features
          </a>
          <a href="#faq" className="hover:text-text-primary">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden text-sm text-text-secondary hover:text-text-primary md:inline"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-10 items-center rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
