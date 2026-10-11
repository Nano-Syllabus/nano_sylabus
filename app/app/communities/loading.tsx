import { CollectionLoading } from "@/components/loading-states";

export default function SubjectExplorerLoading() {
  return (
    <main className="student-page-frame" aria-label="Loading Subject Explorer">
      <CollectionLoading title="Subject Explorer" label="Loading communities and subjects" />
    </main>
  );
}
