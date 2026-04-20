import * as deepl from "deepl-node";
import "dotenv/config";
const translator = new deepl.Translator(process.env.DEEPL_API_KEY ?? "");

const LANG_MAP: Record<string, string> = { en: "EN-US", hi: "HI", pa: "PA" };

export const deepLAdapter = {
  async translateText(text: string, source: string, target: string): Promise<string> {
    try {
      const result = await translator.translateText(
        text,
        LANG_MAP[source] as deepl.SourceLanguageCode,
        LANG_MAP[target] as deepl.TargetLanguageCode
      );
      return Array.isArray(result) ? result[0].text : result.text;
    } catch {
      console.warn(`DeepL: unsupported ${source}->${target}, returning source text`);
      return text;
    }
  }
};
