import { deepLAdapter } from "../adapters/deepLAdapter.js";
import { cacheLayer } from "../middleware/cacheLayer.js";

export const translateStage = {
  async run(text: string, sourceLanguage: string, targetLanguage: string) {
    const cached = await cacheLayer.get(text, sourceLanguage, targetLanguage);
    if (cached) {
      return { translatedText: cached, cacheHit: true };
    }

    const translatedText = await deepLAdapter.translateText(
      text,
      sourceLanguage,
      targetLanguage
    );
    await cacheLayer.set(text, sourceLanguage, targetLanguage, translatedText);
    return { translatedText, cacheHit: false };
  }
};
