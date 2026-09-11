import type { Metadata } from "next";
import { DM_Mono, Inter, Outfit, Poppins } from "next/font/google";
import { ReactNode } from "react";
import { DevPerfHud } from "@/components/dev-perf-hud";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

const themeBootScript = `
(function(){try{
  var k='ns-theme-v2';
  var v=localStorage.getItem(k);
  if(v!=='light'&&v!=='dark'){
    v='light';
  }
  document.documentElement.setAttribute('data-theme',v);
  document.documentElement.style.colorScheme=v;
} catch(e){}})();
`;

export const metadata: Metadata = {
  title: "Nano Syllabus — AI Study Companion for Nepal",
  description:
    "Bilingual AI study companion built for Nepal's curriculum. Ask in English or Roman Nepali and get personalized support.",
};

/**
 * The HUD is a development instrument, not a feature. Both sides of this
 * condition are constant-folded at build time, so the component and its module
 * are dropped from the production bundle entirely. Set NEXT_PUBLIC_PERF_HUD=1
 * to opt a production build in deliberately when checking real numbers.
 */
const SHOW_PERF_HUD =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_PERF_HUD === "1";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${inter.variable} ${poppins.variable} ${dmMono.variable} font-sans antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/*
          The query cache wraps everything, including the marketing routes.
          It has to sit at the root rather than inside /app: a provider mounted
          per-section is a cache created per-section, so moving from a public
          course page into the app would throw away the catalog that page just
          fetched. One provider, one cache, for the life of the tab.

          It is a client component with a server-rendered subtree, which is
          allowed and costs nothing extra — `children` is already rendered by
          the time it is passed in, so nothing below here becomes a client
          component by being wrapped.
        */}
        <QueryProvider>
          {children}
          {SHOW_PERF_HUD ? <DevPerfHud /> : null}
        </QueryProvider>
      </body>
    </html>
  );
}
