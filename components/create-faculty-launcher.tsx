"use client";

import dynamic from "next/dynamic";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";

// The dialog's type pairing, the same faces the Browse page loads for it.
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-jakarta" });

const loadCatalog = () => import("@/components/community-catalog-client");

/** Fetch the dialog's code ahead of the click (hover, focus, idle). */
export function preloadCommunityCatalog() {
  void loadCatalog();
}

/**
 * The dimmed backdrop, shown the instant Create faculty is pressed while the
 * dialog's code arrives, so the click never lands on a still screen. It matches
 * the dialog's own overlay, which then takes over without fading in again.
 */
export function CreateFacultyBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[1000] backdrop-blur-[3px]"
      style={{ background: "rgba(12, 16, 30, .46)" }}
    />
  );
}

// Loaded with the dialog, not with the workspace: it brings the whole Browse
// component and its styles with it.
const CommunityCatalogClient = dynamic(() => loadCatalog().then((m) => m.CommunityCatalogClient), {
  ssr: false,
  loading: CreateFacultyBackdrop,
});

/** The Create faculty dialog, opened over the creator workspace instead of on Browse. */
export function CreateFacultyDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className={`${dmSans.variable} ${jakarta.variable}`}>
      <CommunityCatalogClient initialCommunities={[]} signedIn createOnly onCreateClose={onClose} />
    </div>
  );
}
