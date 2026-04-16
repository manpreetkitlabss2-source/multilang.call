import type { SupportedLanguageCode } from "@multilang-call/shared";

export const buildLanguageFanout = (
  sourceLanguage: SupportedLanguageCode,
  targetLanguages: SupportedLanguageCode[]
) => targetLanguages.filter((language) => language !== sourceLanguage);
