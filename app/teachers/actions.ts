"use server";

import http from "node:http";
import https from "node:https";
import { revalidatePath } from "next/cache";
import { getTenantApiEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  askTeacherQuestion,
  createTeacherFolder,
  createTeacherSubject,
  deleteTeacherDocument,
  deleteTeacherPath,
  deleteTeacherSubject,
  getTeacherDocument,
  getTeacherDocuments,
  getTeacherJob,
  getTeacherMe,
  getTeacherSourceTree,
  getTeacherSubjects,
  indexAllTeacherDocuments,
  indexTeacherDocument,
  regenerateTeacherCollectionKey,
  retrieveTeacherChunks,
} from "@/lib/teacher-app/client";

type TeacherProfile = {
  id: string;
  user_id: string;
  handle: string;
  collection_sk: string;
};

export async function getTeacherProfile(): Promise<TeacherProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("teachers")
    .select("id,user_id,handle,collection_sk")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as TeacherProfile | null;
}

async function requireTeacher() {
  const teacher = await getTeacherProfile();
  if (!teacher) throw new Error("Not authorized as a teacher.");
  return teacher;
}

export async function onboardTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in to become a teacher.");

  const existing = await getTeacherProfile();
  if (existing) return { handle: existing.handle };

  const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const token = process.env.TEACHER_APP_API_TOKEN;
  if (!token) throw new Error("Missing TEACHER_APP_API_TOKEN.");

  const prefix = user.email?.split("@")[0].replace(/[^a-zA-Z0-9]/g, "") || "teacher";
  const handle = `${prefix}_${user.id.slice(0, 5)}`;
  const body = JSON.stringify({
    handle,
    name: user.email?.split("@")[0] || "Teacher",
    email: user.email,
    create_login: false,
  });

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const url = new URL("/v1/teacher-app/teachers", baseUrl);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "POST",
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (raw += chunk));
        response.on("end", () => {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw);
          } catch {
            reject(new Error(`Invalid onboarding response: ${raw.slice(0, 300)}`));
            return;
          }
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(String(parsed.detail ?? "Teacher onboarding failed.")));
          } else resolve(parsed);
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Teacher onboarding timed out.")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });

  const collectionSk = result.api_key;
  if (typeof collectionSk !== "string" || !collectionSk) {
    throw new Error("Teacher API did not return a collection key.");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("teachers").insert({
    user_id: user.id,
    handle,
    collection_sk: collectionSk,
  });
  if (error) throw new Error(`Could not save teacher profile: ${error.message}`);
  revalidatePath("/teachers");
  return { handle };
}

export async function getTeacherWorkspaceAction() {
  const teacher = await requireTeacher();
  const [me, subjects, tree, documents] = await Promise.all([
    getTeacherMe(teacher.collection_sk),
    getTeacherSubjects(teacher.collection_sk),
    getTeacherSourceTree(teacher.collection_sk),
    getTeacherDocuments(teacher.collection_sk),
  ]);
  return { me, subjects, tree, documents };
}

export async function createTeacherSubjectAction(name: string) {
  const teacher = await requireTeacher();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Subject name is required.");
  const result = await createTeacherSubject(teacher.collection_sk, trimmed);
  revalidatePath("/teachers");
  return result;
}

export async function deleteTeacherSubjectAction(slug: string) {
  const teacher = await requireTeacher();
  const trimmed = slug.trim();
  if (!trimmed) throw new Error("Subject slug is required.");
  const result = await deleteTeacherSubject(teacher.collection_sk, trimmed);
  revalidatePath("/teachers");
  return result;
}

export async function createTeacherFolderAction(path: string) {
  const teacher = await requireTeacher();
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Folder path is required.");
  const result = await createTeacherFolder(teacher.collection_sk, trimmed);
  revalidatePath("/teachers");
  return result;
}

export async function deleteTeacherPathAction(path: string) {
  const teacher = await requireTeacher();
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Path is required.");
  const result = await deleteTeacherPath(teacher.collection_sk, trimmed);
  revalidatePath("/teachers");
  return result;
}

export async function deleteTeacherDocumentAction(documentId: string) {
  const teacher = await requireTeacher();
  const trimmed = documentId.trim();
  if (!trimmed) throw new Error("Document ID is required.");
  const result = await deleteTeacherDocument(teacher.collection_sk, trimmed);
  revalidatePath("/teachers");
  return result;
}

export async function getTeacherDocumentAction(documentId: string) {
  const teacher = await requireTeacher();
  return getTeacherDocument(teacher.collection_sk, documentId);
}

export async function getTeacherJobAction(jobId: string) {
  const teacher = await requireTeacher();
  return getTeacherJob(teacher.collection_sk, jobId);
}

export async function indexAllTeacherDocumentsAction() {
  const teacher = await requireTeacher();
  return indexAllTeacherDocuments(teacher.collection_sk);
}

export async function indexTeacherDocumentAction(input: {
  documentId?: string;
  path?: string;
}) {
  const teacher = await requireTeacher();
  const documentId = input.documentId?.trim();
  const path = input.path?.trim();
  if (!documentId && !path) {
    throw new Error("A document ID or collection path is required.");
  }
  return indexTeacherDocument(teacher.collection_sk, { documentId, path });
}

export async function rotateTeacherCollectionKeyAction() {
  const teacher = await requireTeacher();
  const result = await regenerateTeacherCollectionKey(teacher.collection_sk);
  const nextKey =
    (typeof result.api_key === "string" && result.api_key) ||
    (typeof result.collection_api_key === "string" && result.collection_api_key) ||
    (typeof result.key === "string" && result.key);

  if (!nextKey) {
    throw new Error("Teacher API rotated the key but did not return the replacement key.");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("teachers")
    .update({ collection_sk: nextKey })
    .eq("id", teacher.id)
    .eq("user_id", teacher.user_id);

  if (error) {
    throw new Error(
      `The API key was rotated, but the new key could not be saved: ${error.message}`,
    );
  }

  revalidatePath("/teachers");
  return { rotated: true };
}

export async function askTeacherQuestionAction(question: string, topK: number, namespace: string) {
  const teacher = await requireTeacher();
  const trimmed = question.trim();
  if (!trimmed) throw new Error("Question is required.");
  if (!namespace) throw new Error("Namespace is required.");
  return askTeacherQuestion(teacher.collection_sk, trimmed, Math.min(20, Math.max(1, topK)), namespace);
}

export async function retrieveTeacherChunksAction(question: string, topK: number, namespace: string) {
  const teacher = await requireTeacher();
  const trimmed = question.trim();
  if (!trimmed) throw new Error("Question is required.");
  if (!namespace) throw new Error("Namespace is required.");
  return retrieveTeacherChunks(
    teacher.collection_sk,
    trimmed,
    Math.min(20, Math.max(1, topK)),
    namespace
  );
}
