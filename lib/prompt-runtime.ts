import { listActivePromptTemplates } from "@/lib/data/admin-prompts";
import type { Language, PromptPurpose, PromptTemplate } from "@/lib/types";

export type PromptTemplateMap = Partial<Record<`${PromptPurpose}:${Language}`, PromptTemplate>>;

function getPromptKey(purpose: PromptPurpose, language: Language) {
  return `${purpose}:${language}` as const;
}

export async function getActivePromptTemplateMap() {
  try {
    const prompts = await listActivePromptTemplates();
    return prompts.reduce<PromptTemplateMap>((map, prompt) => {
      map[getPromptKey(prompt.purpose, prompt.language)] = prompt;
      return map;
    }, {});
  } catch (error) {
    console.error("Failed to load active prompt templates, falling back to code defaults.", error);
    return {};
  }
}

export function getActivePromptContent(
  map: PromptTemplateMap,
  purpose: PromptPurpose,
  language: Language,
) {
  return map[getPromptKey(purpose, language)]?.content ?? null;
}

export function renderPromptTemplate(
  template: string,
  values: Record<string, string | null | undefined>,
) {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value == null ? "" : String(value);
  });
}
