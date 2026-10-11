import { CollectionLoading } from "@/components/loading-states";

export default function CommunitiesLoading() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <main
        className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
        aria-label="Loading communities"
      >
        <CollectionLoading title="Explore communities" label="Loading communities" />
      </main>
    </div>
  );
}
