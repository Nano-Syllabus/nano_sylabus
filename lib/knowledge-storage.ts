import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const KNOWLEDGE_SOURCE_BUCKET = "knowledge-sources";

function sanitizeFilename(filename: string) {
  return (
    filename
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "source-file"
  );
}

export function buildKnowledgeSourceStoragePath(documentId: string, filename: string) {
  return `${documentId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

export async function ensureKnowledgeSourceBucket() {
  const supabase = createSupabaseAdminClient();
  const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(KNOWLEDGE_SOURCE_BUCKET);
  if (!getBucketError && bucket) return;

  const { error: createBucketError } = await supabase.storage.createBucket(KNOWLEDGE_SOURCE_BUCKET, {
    public: false,
    fileSizeLimit: "15MB",
  });

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    throw createBucketError;
  }
}

export async function uploadKnowledgeSourceFile(documentId: string, file: File) {
  await ensureKnowledgeSourceBucket();
  const supabase = createSupabaseAdminClient();
  const path = buildKnowledgeSourceStoragePath(documentId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(KNOWLEDGE_SOURCE_BUCKET).upload(path, buffer, {
    contentType: file.type || undefined,
    upsert: true,
  });

  if (error) throw error;

  return {
    storageBucket: KNOWLEDGE_SOURCE_BUCKET,
    storagePath: path,
    sourceMimeType: file.type || "application/octet-stream",
    sourceSizeBytes: file.size,
  };
}

export async function removeKnowledgeSourceFile(storagePath: string | null | undefined) {
  if (!storagePath) return;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(KNOWLEDGE_SOURCE_BUCKET).remove([storagePath]);
  if (error) throw error;
}

export async function createKnowledgeSourceSignedUrl(options: {
  storageBucket: string;
  storagePath: string;
  sourceName: string;
  download?: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(options.storageBucket)
    .createSignedUrl(options.storagePath, 60, {
      download: options.download ? options.sourceName : false,
    });

  if (error || !data) throw error || new Error("Failed to create source file URL.");
  return data.signedUrl;
}
