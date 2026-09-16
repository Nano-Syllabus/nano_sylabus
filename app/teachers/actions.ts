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
import { getVerifiedUser } from "@/lib/supabase/verified-user";

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
  } = await getVerifiedUser(supabase);
  if (!user) return null;

  return getTeacherProfileForUserId(user.id);
}

export async function getTeacherProfileForUserId(userId: string): Promise<TeacherProfile | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("teachers")
    .select("id,user_id,handle,collection_sk")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as TeacherProfile | null;
}

async function requireTeacher() {
  const teacher = await getTeacherProfile();
  if (!teacher) throw new Error("Not authorized as a teacher.");
  return teacher;
}

type TeacherAppTransport = {
  baseUrl: string;
  token: string;
  rejectUnauthorized: boolean;
  timeoutMs: number;
};

type TeacherAppResponse = {
  status: number;
  parsed: Record<string, unknown>;
};

/**
 * One operator-token call to the teacher-app surface.
 *
 * It RESOLVES a 4xx instead of rejecting, because the status is the interesting
 * part: `onboardTeacher` treats 409 as "adopt the collection that is already
 * there" rather than as a failure, and it can only do that if the status
 * survives the call. A rejection from here is a genuine transport fault —
 * connection refused, DNS, a rejected certificate, a timeout.
 */
function teacherAppRequest(
  transport: TeacherAppTransport,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<TeacherAppResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, transport.baseUrl);
    const client = url.protocol === "https:" ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = client.request(
      url,
      {
        method,
        rejectUnauthorized: transport.rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${transport.token}`,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (raw += chunk));
        response.on("end", () => {
          const status = response.statusCode ?? 500;
          if (!raw.trim()) {
            resolve({ status, parsed: {} });
            return;
          }
          try {
            resolve({ status, parsed: JSON.parse(raw) as Record<string, unknown> });
          } catch {
            reject(new Error(`${path} returned a non-JSON response: ${raw.slice(0, 300)}`));
          }
        });
      },
    );
    request.setTimeout(transport.timeoutMs, () =>
      request.destroy(new Error(`${path} timed out after ${transport.timeoutMs}ms.`)),
    );
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

const teacherAppDetail = (parsed: Record<string, unknown>, fallback: string) =>
  typeof parsed.detail === "string" && parsed.detail ? parsed.detail : fallback;

export type OnboardTeacherResult =
  | { ok: true; handle: string }
  | { ok: false; message: string };

/**
 * ERRORS ARE RETURNED HERE, NOT THROWN.
 *
 * Next redacts anything a Server Action throws in a production build: the client
 * receives "An error occurred in the Server Components render. The specific
 * message is omitted in production builds to avoid leaking sensitive details."
 * That is the right default for an unexpected crash and the wrong one for every
 * failure this function actually has — a missing token, a provider that answered
 * 4xx, a timeout, a row that would not insert. Each of those was already written
 * as a precise sentence, and every one of them reached the student as that same
 * paragraph, so the screen could never say what was wrong and the operator had
 * nothing to act on either.
 *
 * A returned result is ordinary data and survives the boundary intact. The cause
 * is also logged under a stable prefix, because the message handed to a browser
 * is deliberately not the whole story — `cause` can carry a hostname or a
 * certificate error that belongs in a log and not on a page.
 */
export async function onboardTeacher(): Promise<OnboardTeacherResult> {
  const fail = (message: string, cause?: unknown): { ok: false; message: string } => {
    console.error(`[creator-onboarding] ${message}`, cause ?? "");
    return { ok: false, message };
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  if (!user) return fail("You must be logged in to create a creator workspace.");

  // `getTeacherProfileForUserId` throws when Supabase itself errors, and a throw
  // from inside a Server Action is exactly what the redacted paragraph is made of.
  let existing: TeacherProfile | null;
  try {
    existing = await getTeacherProfile();
  } catch (cause) {
    return fail("Could not read your workspace from the database. Try again.", cause);
  }
  if (existing) return { ok: true, handle: existing.handle };

  let baseUrl: string;
  let rejectUnauthorized: boolean;
  let timeoutMs: number;
  try {
    ({ baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv());
  } catch (cause) {
    return fail("The course API is not configured on this deployment.", cause);
  }
  const token = process.env.TEACHER_APP_API_TOKEN;
  if (!token) {
    return fail("The course API token is missing on this deployment.");
  }

  const prefix = user.email?.split("@")[0].replace(/[^a-zA-Z0-9]/g, "") || "teacher";
  const handle = `${prefix}_${user.id.slice(0, 5)}`;
  const admin = createSupabaseAdminClient();
  const transport: TeacherAppTransport = { baseUrl, token, rejectUnauthorized, timeoutMs };

  let created: TeacherAppResponse;
  try {
    created = await teacherAppRequest(transport, "POST", "/v1/teacher-app/teachers", {
      handle,
      name: user.email?.split("@")[0] || "Teacher",
      email: user.email,
      create_login: false,
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail(`The course API could not be reached: ${detail}`, cause);
  }

  let collectionSk: string;

  if (created.status === 409) {
    // A COLLECTION THAT ALREADY EXISTS IS ADOPTED, NOT AN ERROR.
    //
    // `handle` is derived from the user id, so it is identical on every attempt.
    // Once the collection exists upstream and the `teachers` row below has not
    // landed, every retry earns this same 409 and the creator is stranded on the
    // activation screen permanently — the button cannot ever succeed, and the
    // workspace they already own is unreachable. That is not hypothetical: it is
    // how `surfwithprashant-18966-teacher` and a dozen collections like it ended
    // up orphaned upstream with no login bound to them.
    //
    // The collection is this user's by construction, so take it back. Its
    // original key was returned once at creation and is gone, so rotate to get a
    // usable one. Rotating is safe precisely BECAUSE no row holds the old key —
    // the ownership check below is what proves that, and it refuses to touch a
    // collection that is already somebody's working workspace.
    const { data: claimed, error: claimedError } = await admin
      .from("teachers")
      .select("user_id")
      .eq("handle", handle)
      .maybeSingle();
    if (claimedError) {
      return fail("Could not check who owns this workspace. Try again.", claimedError);
    }
    if (claimed && claimed.user_id !== user.id) {
      return fail(
        `The workspace ${handle} already belongs to another account. Contact support to free it.`,
        { handle },
      );
    }

    let rotated: TeacherAppResponse;
    try {
      rotated = await teacherAppRequest(
        transport,
        "POST",
        `/v1/teacher-app/teachers/${encodeURIComponent(handle)}/api-key/regenerate`,
      );
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return fail(`The course API could not be reached: ${detail}`, cause);
    }
    if (rotated.status >= 400) {
      return fail(
        `Your workspace exists but its key could not be reissued: ${teacherAppDetail(
          rotated.parsed,
          `the course API answered ${rotated.status}`,
        )}`,
        rotated.parsed,
      );
    }
    const rotatedKey = rotated.parsed.api_key;
    if (typeof rotatedKey !== "string" || !rotatedKey) {
      return fail("The course API did not return a collection key.", rotated.parsed);
    }
    collectionSk = rotatedKey;
    console.info(`[creator-onboarding] adopted existing collection for ${handle}`);
  } else if (created.status >= 400) {
    return fail(
      `The course API refused to create the workspace: ${teacherAppDetail(
        created.parsed,
        `it answered ${created.status}`,
      )}`,
      created.parsed,
    );
  } else {
    const freshKey = created.parsed.api_key;
    if (typeof freshKey !== "string" || !freshKey) {
      return fail("The course API did not return a collection key.", created.parsed);
    }
    collectionSk = freshKey;
  }

  const { error } = await admin.from("teachers").insert({
    user_id: user.id,
    handle,
    collection_sk: collectionSk,
  });
  if (error) {
    // The collection exists upstream at this point, so say so: retrying is safe
    // and the early `existing` check is not reached until this row lands.
    return fail(
      error.code === "23505"
        ? `The handle ${handle} is already taken. Contact support to free it.`
        : "Your workspace was created but could not be saved. Try again.",
      error,
    );
  }
  revalidatePath("/teachers");
  return { ok: true, handle };
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
