import { pollyAdapter } from "../adapters/pollyAdapter.js";

export const ttsStage = {
  async run(text: string, targetLanguage: string) {
    return pollyAdapter.synthesizeSpeech(text, targetLanguage);
  }
};
