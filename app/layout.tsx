import type { Metadata } from "next";
import { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";

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
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
