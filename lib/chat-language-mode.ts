import type { Language } from "@/lib/types";
import { needsEnglishRewrite, needsRomanNepaliRewrite } from "@/lib/roman-nepali";

export function resolveResponseLanguage({
  chatLanguage,
  messageLanguage: _messageLanguage,
}: {
  chatLanguage: Language;
  messageLanguage?: Language;
}): Language {
  // The language picker is an explicit user preference for the answer. The
  // detected language of the latest question is input metadata only and must
  // never override the selected chat mode (for example, an English question
  // asked while Roman Nepali is selected).
  return chatLanguage;
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
