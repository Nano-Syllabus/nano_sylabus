/**
 * Which faculty's workspace a creator-workspace request is working in.
 *
 * A faculty is shared by its creator and its faculty ambassadors (the people on
 * /admin/faculties, user 2026-10-09): they all edit the SAME subjects and files,
 * which live in the creator's collection. The workspace tab sends the faculty it
 * has open on every /api/teacher request, so two tabs on two faculties never
 * cross; the server checks the caller may manage it (lib/data/faculty-share.ts)
 * before using the creator's collection.
 *
 * Client-safe: no server imports.
 */
export const WORKSPACE_FACULTY_HEADER = "x-nsdi-workspace-faculty";

let current = "";
let installed = false;

/** Set by the workspace when a SHARED faculty is open; "" for the caller's own. */
export function setWorkspaceFaculty(slug: string) {
  current = slug;
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (!current) return original(input, init);
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const target = new URL(url, window.location.href);
    if (target.origin !== window.location.origin || !target.pathname.startsWith("/api/teacher/"))
      return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(WORKSPACE_FACULTY_HEADER)) headers.set(WORKSPACE_FACULTY_HEADER, current);
    return original(input, { ...init, headers });
  };
}
