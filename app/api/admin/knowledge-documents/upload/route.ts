import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  createAdminKnowledgeDocument,
  deleteAdminKnowledgeDocument,
  getAdminKnowledgeDocument,
  processAdminKnowledgeDocument,
  updateAdminKnowledgeDocument,
  type AdminKnowledgeDocumentInput,
} from "@/lib/data/admin-knowledge";
import { extractKnowledgeFileContent } from "@/lib/knowledge-upload";
import { removeKnowledgeSourceFile, uploadKnowledgeSourceFile } from "@/lib/knowledge-storage";

export const runtime = "nodejs";

const uploadSchema = z.object({
  documentId: z.string().trim().optional(),
  board: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  faculty: z.string().trim().default(""),
  curriculum: z.string().trim().default(""),
  subject: z.string().trim().min(1),
  chapter: z.string().trim().nullable().optional(),
  title: z.string().trim().default(""),
  sourceName: z.string().trim().default(""),
  documentType: z.enum([
    "micro_syllabus",
    "question_bank",
    "textbook",
    "notes",
    "curriculum",
    "syllabus",
    "other",
  ]),
  autoProcess: z.enum(["true", "false"]).default("false"),
});

export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    }

    const parsed = uploadSchema.parse({
      documentId: formData.get("documentId"),
      board: formData.get("board"),
      grade: formData.get("grade"),
      faculty: formData.get("faculty"),
      curriculum: formData.get("curriculum"),
      subject: formData.get("subject"),
      chapter: formData.get("chapter"),
      title: formData.get("title"),
      sourceName: formData.get("sourceName"),
      documentType: formData.get("documentType"),
      autoProcess: formData.get("autoProcess") ?? "false",
    });

    const extracted = await extractKnowledgeFileContent(file);

    const baseInput: AdminKnowledgeDocumentInput = {
      board: parsed.board,
      grade: parsed.grade,
      faculty: parsed.faculty,
      curriculum: parsed.curriculum,
      subject: parsed.subject,
      chapter: parsed.chapter?.trim() || null,
      title: parsed.title || extracted.suggestedTitle,
      sourceName: parsed.sourceName || extracted.sourceName,
      sourceType: extracted.sourceType,
      documentType: parsed.documentType,
      rawContent: extracted.rawContent,
    };

    const isExistingDocument = Boolean(parsed.documentId && parsed.documentId !== "new");
    const previousDocument = isExistingDocument ? await getAdminKnowledgeDocument(parsed.documentId!) : null;

    let document = isExistingDocument
      ? await updateAdminKnowledgeDocument(parsed.documentId!, {
          ...baseInput,
          storageBucket: previousDocument?.storageBucket ?? null,
          storagePath: previousDocument?.storagePath ?? null,
          sourceMimeType: previousDocument?.sourceMimeType ?? null,
          sourceSizeBytes: previousDocument?.sourceSizeBytes ?? null,
        })
      : await createAdminKnowledgeDocument(baseInput);

    if (!document) {
      throw new Error("Failed to save uploaded document.");
    }
    const savedDocumentId = document.id;

    try {
      const storedFile = await uploadKnowledgeSourceFile(savedDocumentId, file);
      document = await updateAdminKnowledgeDocument(savedDocumentId, {
        ...baseInput,
        storageBucket: storedFile.storageBucket,
        storagePath: storedFile.storagePath,
        sourceMimeType: storedFile.sourceMimeType,
        sourceSizeBytes: storedFile.sourceSizeBytes,
      });

      if (previousDocument?.storagePath && previousDocument.storagePath !== storedFile.storagePath) {
        await removeKnowledgeSourceFile(previousDocument.storagePath);
      }
    } catch (storageError) {
      if (!isExistingDocument) {
        await deleteAdminKnowledgeDocument(savedDocumentId);
      }
      throw storageError;
    }

    if (parsed.autoProcess === "true") {
      document = await processAdminKnowledgeDocument(savedDocumentId);
    } else {
      document = await getAdminKnowledgeDocument(savedDocumentId);
    }

    return NextResponse.json(
      {
        document,
        extracted: {
          sourceName: extracted.sourceName,
          sourceType: extracted.sourceType,
          suggestedTitle: extracted.suggestedTitle,
          characterCount: extracted.rawContent.length,
        },
      },
      { status: parsed.documentId && parsed.documentId !== "new" ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload knowledge document." },
      { status: 500 },
    );
  }
}
