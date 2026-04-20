import { deepgramAdapter } from "../adapters/deepgramAdapter.js";

export const sttStage = {
  async run(audioBase64: string, sourceLanguage: string) {
    return deepgramAdapter.transcribeAudio(audioBase64, sourceLanguage);
  }
};