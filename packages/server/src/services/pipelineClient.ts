import type {
  SupportedLanguageCode,
  TranslationRequest,
  TranslationResult
} from "@multilang-call/shared";

const aiPipelineUrl = process.env.AI_PIPELINE_URL ?? "http://localhost:5001";

export interface TextTranslationRequest {
  meetingId: string;
  participantId: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguages: SupportedLanguageCode[];
  text: string;
}

export interface PipelineClient {
  translate(request: TranslationRequest): Promise<TranslationResult[]>;
  translateText(request: TextTranslationRequest): Promise<TranslationResult[]>;
}

export const createPipelineClient = (): PipelineClient => ({
  async translate(request) {
    const response = await fetch(`${aiPipelineUrl}/pipeline/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Pipeline request failed with ${response.status}`);
    }

    const data = (await response.json()) as { results: TranslationResult[] };
    return data.results;
  },

  async translateText(request) {
    const response = await fetch(`${aiPipelineUrl}/pipeline/translate-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Pipeline text-translate failed: ${response.status}`);
    }

    const data = (await response.json()) as { results: TranslationResult[] };
    return data.results;
  }
});
