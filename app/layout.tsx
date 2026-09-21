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

/**
 * Keeps extension bookkeeping off the DOM until React has hydrated.
 *
 * Bitdefender's browser extension tags elements with `bis_skin_checked="1"` as
 * the document is parsed — every div in the tree, before any of our JavaScript
 * runs. React then compares the server's markup against what it finds, reports
 * each one as a mismatch it "won't patch up", and the genuine mismatches this
 * warning exists to catch are buried under fifteen lines of somebody's antivirus.
 * Other extensions do the same with their own attribute names.
 *
 * `suppressHydrationWarning` cannot answer this: it applies to one element and
 * does not recurse, so covering a whole tree would mean suppressing the app.
 *
 * So the attributes are removed instead. A MutationObserver is the only thing
 * fast enough — the extension writes as elements are parsed, so a one-shot sweep
 * would miss everything parsed after it ran. Observer callbacks fire at the next
 * microtask checkpoint, and hydration is triggered from a separate script
 * execution, so the strip always lands in between.
 *
 * DEVELOPMENT ONLY, deliberately. The attributes are inert: React logs them and
 * carries on, nothing renders differently, and a real user with this extension
 * sees nothing wrong. Shipping a script that races another program for control of
 * the DOM on every page load, to fix a console message no user reads, is a worse
 * trade than the message. `SHOW_PERF_HUD` below is the same judgement.
 *
 * Only the attributes listed are touched, and only the attributes — no element is
 * added, removed or reordered — so a real hydration mismatch still reports.
 */
const extensionAttributeStripScript = `
(function(){try{
  var names=['bis_skin_checked','bis_register','bis_id','data-new-gr-c-s-check-loaded',
             'data-gr-ext-installed','data-gramm','data-lt-installed'];
  var strip=function(root){
    for(var i=0;i<names.length;i++){
      if(root.hasAttribute&&root.hasAttribute(names[i]))root.removeAttribute(names[i]);
      var found=root.querySelectorAll?root.querySelectorAll('['+names[i]+']'):[];
      for(var j=0;j<found.length;j++)found[j].removeAttribute(names[i]);
    }
  };
  strip(document.documentElement);
  var observer=new MutationObserver(function(records){
    for(var i=0;i<records.length;i++){
      var target=records[i].target;
      if(target&&target.removeAttribute)target.removeAttribute(records[i].attributeName);
    }
  });
  observer.observe(document,{attributes:true,subtree:true,attributeFilter:names});
  // Hydration is long done by load; leaving it running would fight the extension
  // for the rest of the session over attributes that no longer matter.
  addEventListener('load',function(){setTimeout(function(){
    observer.disconnect();
  },2000);});
} catch(e){}})();
`;

export const metadata: Metadata = {
  metadataBase: new URL("https://nanosyllabus.com"),
  applicationName: "NanoSyllabus",
  title: {
    default: "NanoSyllabus — AI Study Companion for Nepal",
    template: "%s | NanoSyllabus",
  },
  description:
    "Bilingual AI study companion for Nepal's curriculum. Prepare for university, licensing, and entrance exams with guided practice, feedback, and personalized study plans.",
  keywords: [
    "AI study companion Nepal",
    "exam preparation Nepal",
    "university exam prep",
    "study planner Nepal",
    "learning platform Nepal",
    "NanoSyllabus",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nanosyllabus.com",
    siteName: "NanoSyllabus",
    title: "NanoSyllabus — AI Study Companion for Nepal",
    description:
      "Bilingual AI study companion for Nepal's curriculum. Prepare for university, licensing, and entrance exams with guided practice, feedback, and personalized study plans.",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "NanoSyllabus logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@nanosyllabus",
    creator: "@nanosyllabus",
    title: "NanoSyllabus — AI Study Companion for Nepal",
    description:
      "Bilingual AI study companion for Nepal's curriculum. Prepare for university, licensing, and entrance exams with guided practice, feedback, and personalized study plans.",
    images: ["/icon.png"],
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

/**
 * The HUD is a development instrument, not a feature. Both sides of this
 * condition are constant-folded at build time, so the component and its module
 * are dropped from the production bundle entirely. Set NEXT_PUBLIC_PERF_HUD=1
 * to opt a production build in deliberately when checking real numbers.
 */
const SHOW_PERF_HUD =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_PERF_HUD === "1";

/** Constant-folded, so the script above is dropped from a production build. */
const STRIP_EXTENSION_ATTRIBUTES = process.env.NODE_ENV === "development";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        `suppressHydrationWarning` on BOTH, and for two different reasons.

        <html> is the theme: `themeBootScript` below stamps the chosen theme onto
        the document before React loads, so the server's markup is deliberately
        not what the client finds.

        <body> is other people's software. Browser extensions write their own
        bookkeeping attributes onto it — Bitdefender's `bis_register`, various
        `__processed_<uuid>__` markers — before hydration, and React reports every
        one as a mismatch it "won't patch up". Nothing is actually wrong and there
        is nothing to fix in this tree, so the noise buries the mismatches that DO
        matter.

        It suppresses this element only: React does not recurse, so a genuine
        mismatch anywhere inside still reports normally. Extensions that decorate
        nested nodes too (`bis_skin_checked` on every div) are therefore still
        noisy in a browser running them, which is the correct trade — silencing
        those would mean suppressing the whole app.
      */}
      <body
        suppressHydrationWarning
        className={`${outfit.variable} ${inter.variable} ${poppins.variable} ${dmMono.variable} font-sans antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {STRIP_EXTENSION_ATTRIBUTES ? (
          <script dangerouslySetInnerHTML={{ __html: extensionAttributeStripScript }} />
        ) : null}
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
