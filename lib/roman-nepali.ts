import type { Language } from "@/lib/types";

const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

export function containsDevanagari(text: string) {
  return DEVANAGARI_PATTERN.test(text);
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function needsRomanNepaliRewrite(text: string, language: Language) {
  if (language !== "RN") return false;
  if (containsDevanagari(text)) return true;
  return countWords(text) > 180;
}

