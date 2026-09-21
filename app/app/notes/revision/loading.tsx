import { RevisionDocsSkeleton } from "@/components/revision-docs-client";

/** This path only redirects to the docs at `/app/notes`; it loads as them. */
export default function RevisionLoading() {
  return <RevisionDocsSkeleton />;
}
