import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Language, PromptPurpose, PromptTemplate } from "@/lib/types";

interface PromptTemplateRow {
  id: string;
  name: string;
  slug: string;
  purpose: PromptPurpose;
  language: Language;
  description: string | null;
  content: string;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPromptTemplateInput {
  name: string;
  slug: string;
  purpose: PromptPurpose;
  language: Language;
  description: string;
  content: string;
  isActive: boolean;
}

function slugifyPrompt(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-prompt";
}

function toPromptTemplate(row: PromptTemplateRow): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    purpose: row.purpose,
    language: row.language,
    description: row.description,
    content: row.content,
    isActive: row.is_active,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function deactivateSiblingPrompts(purpose: PromptPurpose, language: Language, excludedId?: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("prompt_templates")
    .update({ is_active: false })
    .eq("purpose", purpose)
    .eq("language", language)
    .eq("is_active", true);

  if (excludedId) {
    query = query.neq("id", excludedId);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function listPromptTemplates(filters?: { q?: string }) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("prompt_templates")
    .select("*")
    .order("purpose", { ascending: true })
    .order("language", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(200);

  const q = filters?.q?.trim();
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,slug.ilike.%${q}%,description.ilike.%${q}%,content.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as PromptTemplateRow[]).map(toPromptTemplate);
}

export async function getPromptTemplate(promptId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("*")
    .eq("id", promptId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toPromptTemplate(data as PromptTemplateRow);
}

export async function createPromptTemplate(input: AdminPromptTemplateInput, updatedBy: string) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    name: input.name.trim(),
    slug: slugifyPrompt(input.slug || input.name),
    purpose: input.purpose,
    language: input.language,
    description: input.description.trim() || null,
    content: input.content.trim(),
    is_active: input.isActive,
    updated_by: updatedBy,
  };

  if (payload.is_active) {
    await deactivateSiblingPrompts(payload.purpose, payload.language);
  }

  const { data, error } = await supabase
    .from("prompt_templates")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) throw error || new Error("Failed to create prompt template.");
  return getPromptTemplate(data.id);
}

export async function updatePromptTemplate(
  promptId: string,
  input: AdminPromptTemplateInput,
  updatedBy: string,
) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    name: input.name.trim(),
    slug: slugifyPrompt(input.slug || input.name),
    purpose: input.purpose,
    language: input.language,
    description: input.description.trim() || null,
    content: input.content.trim(),
    is_active: input.isActive,
    updated_by: updatedBy,
  };

  if (payload.is_active) {
    await deactivateSiblingPrompts(payload.purpose, payload.language, promptId);
  }

  const { error } = await supabase.from("prompt_templates").update(payload).eq("id", promptId);
  if (error) throw error;
  return getPromptTemplate(promptId);
}

export async function deletePromptTemplate(promptId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("prompt_templates").delete().eq("id", promptId);
  if (error) throw error;
}

export async function listActivePromptTemplates() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("*")
    .eq("is_active", true);

  if (error) throw error;
  return ((data ?? []) as PromptTemplateRow[]).map(toPromptTemplate);
}
