import { Bricolage_Grotesque, Inter_Tight } from "next/font/google";

/**
 * Fonts for the exam / public marketing surfaces.
 *
 * These two families used to be declared in the root layout, which meant every
 * signed-in student downloaded ten font files for a theme that only six public
 * screens use. Declaring them here scopes the preload to the routes that
 * actually import this module, the same way `app/teachers-v2/layout.tsx`
 * already scopes its own three.
 */
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

/** Apply to the root element of any screen using the `.exam-prep-theme` styles. */
export const examThemeClass = `${examDisplay.variable} ${examSans.variable} exam-prep-theme`;
