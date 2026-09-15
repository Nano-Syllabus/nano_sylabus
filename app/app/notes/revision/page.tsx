import { redirect } from "next/navigation";

/**
 * The docs moved up to `/app/notes`, which is where "Revision" in the nav lands.
 *
 * Kept as a redirect rather than deleted: this path was linked from the notes
 * header for months and is in browser histories and bookmarks, and a 404 on it
 * would read as the feature having been removed.
 */
export default function RevisionDocsRedirect() {
  redirect("/app/notes");
}
