import type { TranslationRequest, TranslationResult } from "@multilang-call/shared";

const aiPipelineUrl = process.env.AI_PIPELINE_URL ?? "http://localhost:5001";

export interface PipelineClient {
  translate(request: TranslationRequest): Promise<TranslationResult[]>;
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
  }
});
