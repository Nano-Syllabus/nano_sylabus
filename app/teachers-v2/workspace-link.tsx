"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

/**
 * A link inside the creator workspace that never leaves the page.
 *
 * Every view of the workspace is the same /teachers page told apart by its
 * query (`?view=subjects&community=…`), and the page reads that query itself.
 * Through the Next router a tab click re-ran the server page and showed the
 * route's full-screen "Loading your workspace…" skeleton in between — the jolt
 * between tabs (user, 2026-10-09). `history.pushState` changes the URL in
 * place (Next keeps `useSearchParams` in step with it), so the view switches on
 * the click, as `openSubject` already does. Anything else — another route, a
 * new tab, a modified click — is an ordinary link.
 */
export function WorkspaceLink({ href, onClick, prefetch, ...props }: ComponentProps<typeof Link>) {
  const target = typeof href === "string" ? href : "";
  const inWorkspace = target === "/teachers" || target.startsWith("/teachers?");

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      !inWorkspace ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank"
    )
      return;
    event.preventDefault();
    if (`${window.location.pathname}${window.location.search}` !== target)
      window.history.pushState(null, "", target);
    window.scrollTo({ top: 0 });
  }

  // Nothing to prefetch for a link that never asks the server.
  return (
    <Link {...props} href={href} onClick={handleClick} prefetch={inWorkspace ? false : prefetch} />
  );
}
