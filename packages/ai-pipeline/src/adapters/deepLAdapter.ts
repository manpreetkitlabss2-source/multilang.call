import "dotenv/config";

/**
 * MyMemory Translation adapter — lightweight & free
 *
 * Docs:
 * https://mymemory.translated.net/doc/spec.php
 *
 * Optional env:
 *   MYMEMORY_EMAIL (recommended to avoid strict rate limits)
 */

export const deepLAdapter = {
  async translateText(
    text: string,
    source: string,
    target: string
  ): Promise<string> {
    try {
      const encodedText = encodeURIComponent(text);

      const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${source}|${target}${
        process.env.MYMEMORY_EMAIL
          ? `&de=${process.env.MYMEMORY_EMAIL}`
          : ""
      }`;

      const res = await fetch(url);
      const data = await res.json();

      if (data?.responseData?.translatedText) {
        return data.responseData.translatedText;
      }

      console.warn(`MyMemory: no translation found ${source}->${target}`);
      return text;
    } catch (error) {
      console.warn(`MyMemory: failed ${source}->${target}:`, error);
      return text; // fallback same as before
    }
  }
};