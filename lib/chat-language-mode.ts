import type { Language } from "@/lib/types";
import { needsEnglishRewrite, needsRomanNepaliRewrite } from "@/lib/roman-nepali";

export function resolveResponseLanguage({
  chatLanguage,
  messageLanguage,
}: {
  chatLanguage: Language;
  messageLanguage?: Language;
}): Language {
  return messageLanguage ?? chatLanguage;
}

export function isAnswerCompliantWithMode(answer: string, language: Language) {
  if (language === "EN") {
    return !needsEnglishRewrite(answer, language);
  }
  return !needsRomanNepaliRewrite(answer, language);
}

export function describeModeRule(language: Language) {
  if (language === "EN") {
    return "Answer must be in English, even if question is in Nepali.";
  }
  return "Answer must be in Roman Nepali, even if question is in English.";
}
