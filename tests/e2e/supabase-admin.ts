import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createDeterministicEmbedding } from "../../lib/ai/e2e-harness";

type TestUser = {
  email: string;
  password: string;
  userId: string;
};

type SeededKnowledgeChunk = {
  documentId: string;
  chunkId: string;
  title: string;
};

type SeededEnglishStudyFixture = {
  sessionId: string;
  assistantMessageId: string;
  question: string;
  source: SeededKnowledgeChunk;
};

let envCache: Map<string, string> | null = null;

function loadEnvFile(fileName: string) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) return [] as string[];
  return readFileSync(filePath, "utf8").split(/\r?\n/);
}

function getLocalEnv(key: string) {
  if (!envCache) {
    envCache = new Map<string, string>();
    const lines = [...loadEnvFile(".env.local"), ...loadEnvFile(".env")];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, envKey, rawValue] = match;
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (!envCache.has(envKey)) {
        envCache.set(envKey, value);
      }
    }
  }

  return process.env[key] || envCache.get(key) || "";
}

function createAdminClient() {
  const url = getLocalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getLocalEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for E2E tests.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function assertE2ESchemaReady() {
  const admin = createAdminClient();
  const { error } = await admin
    .from("chat_sessions")
    .select("id, subject_context, subject_tags")
    .limit(0);

  if (error) {
    throw new Error(
      `E2E schema preflight failed: ${error.message}. Run the latest Supabase migrations before running browser E2E.`,
    );
  }
}

export async function createE2ETestUser() {
  const admin = createAdminClient();
  const slug = randomUUID().slice(0, 8);
  const email = `e2e.nano.${slug}@example.com`;
  const password = `NanoE2E!${randomUUID().slice(0, 8)}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "E2E Nano Student",
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message || "Failed to create E2E test user.");
  }

  return {
    email,
    password,
    userId: data.user.id,
  } satisfies TestUser;
}

export async function deleteE2ETestUser(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function seedStaticKnowledgeChunk(input: {
  board: string;
  grade: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  title: string;
  sourceName: string;
  content: string;
}) {
  const admin = createAdminClient();
  const { data: document, error: documentError } = await admin
    .from("knowledge_documents")
    .insert({
      board: input.board,
      grade: input.grade,
      subject: input.subject,
      chapter: input.chapter,
      title: input.title,
      source_name: input.sourceName,
      source_type: "pdf",
    })
    .select("id, title")
    .single();

  if (documentError || !document) {
    throw new Error(documentError?.message || "Failed to seed static knowledge document.");
  }

  const { data: chunk, error: chunkError } = await admin
    .from("knowledge_chunks")
    .insert({
      document_id: document.id,
      board: input.board,
      grade: input.grade,
      subject: input.subject,
      chapter: input.chapter,
      topic: input.topic,
      content: input.content,
      embedding: createDeterministicEmbedding(input.content),
      chunk_index: 0,
    })
    .select("id")
    .single();

  if (chunkError || !chunk) {
    throw new Error(chunkError?.message || "Failed to seed static knowledge chunk.");
  }

  return {
    documentId: document.id,
    chunkId: chunk.id,
    title: document.title,
  } satisfies SeededKnowledgeChunk;
}

export async function cleanupStaticKnowledgeChunk(fixture: SeededKnowledgeChunk | null | undefined) {
  if (!fixture) return;
  const admin = createAdminClient();
  const { error: chunkError } = await admin.from("knowledge_chunks").delete().eq("id", fixture.chunkId);
  if (chunkError) {
    throw new Error(chunkError.message);
  }

  const { error: documentError } = await admin
    .from("knowledge_documents")
    .delete()
    .eq("id", fixture.documentId);
  if (documentError) {
    throw new Error(documentError.message);
  }
}

export async function seedEnglishStudyFixture(userId: string) {
  const admin = createAdminClient();
  const source = await seedStaticKnowledgeChunk({
    board: "NEB",
    grade: "Class 11",
    subject: "English",
    chapter: "Unit 1",
    topic: "Serendipity",
    title: "Class 11 English Serendipity",
    sourceName: "english-serendipity.pdf",
    content:
      "Taking my Son to College, Where Technology has Replaced Serendipity reflects on campus life, discovery, and the loss of unplanned encounters.",
  });

  const question =
    "In English, summarize Taking my Son to College, Where Technology has Replaced Serendipity.";

  const { data: session, error: sessionError } = await admin
    .from("chat_sessions")
    .insert({
      user_id: userId,
      title: "Taking my Son to College summary",
      subject_tags: ["English"],
      subject_context: "English",
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    throw new Error(sessionError?.message || "Failed to seed E2E chat session.");
  }

  const { data: insertedMessages, error: messageError } = await admin
    .from("chat_messages")
    .insert([
      {
        session_id: session.id,
        role: "user",
        content: question,
        language: "EN",
        grounded: false,
        citations: [],
        follow_up_suggestions: [],
      },
      {
        session_id: session.id,
        role: "assistant",
        content:
          "The essay reflects on how technology changes campus discovery and human connection in college life.",
        language: "EN",
        grounded: true,
        citations: [
          {
            chunkId: source.chunkId,
            documentId: source.documentId,
            sourceLabel: "English · Unit 1",
            sourceTitle: source.title,
            sourceName: "english-serendipity.pdf",
            subject: "English",
            chapter: "Unit 1",
            topic: "Serendipity",
            excerpt:
              "Taking my Son to College, Where Technology has Replaced Serendipity reflects on campus life, discovery, and the loss of unplanned encounters.",
          },
        ],
        follow_up_suggestions: [
          "What does serendipity mean in this essay?",
          "How does technology affect student life here?",
        ],
      },
    ])
    .select("id, role");

  if (messageError || !insertedMessages || insertedMessages.length !== 2) {
    throw new Error(messageError?.message || "Failed to seed E2E chat messages.");
  }

  const assistantMessageId =
    insertedMessages.find((message) => message.role === "assistant")?.id ?? null;

  if (!assistantMessageId) {
    throw new Error("Failed to find seeded assistant message.");
  }

  return {
    sessionId: session.id,
    assistantMessageId,
    question,
    source,
  } satisfies SeededEnglishStudyFixture;
}
