import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, Inter, Inter_Tight, Outfit } from "next/font/google";
import { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

const examDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-exam-display",
  display: "swap",
});

const examSans = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-exam-sans",
  display: "swap",
});

const themeBootScript = `
(function(){try{
  var k='ns-theme-v2';
  var v=localStorage.getItem(k);
  if(v!=='light'&&v!=='dark'){
    v='dark';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${inter.variable} ${dmMono.variable} ${examDisplay.variable} ${examSans.variable} font-sans antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
