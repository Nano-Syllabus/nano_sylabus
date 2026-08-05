import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";

const teacherDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-teacher-display",
  display: "swap",
});

const teacherBody = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-teacher-body",
  display: "swap",
});

const teacherMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-teacher-mono",
  display: "swap",
});

export default function TeachersV2Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${teacherDisplay.variable} ${teacherBody.variable} ${teacherMono.variable} teacher-html-parity`}>
      {children}
    </div>
  );
}
