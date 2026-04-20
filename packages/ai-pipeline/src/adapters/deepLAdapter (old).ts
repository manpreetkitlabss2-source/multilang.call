// import * as deepl from "deepl-node";
// import "dotenv/config";
// const translator = new deepl.Translator(process.env.DEEPL_API_KEY ?? "");

// const LANG_MAP: Record<string, string> = { en: "EN-US", hi: "HI", pa: "PA" };

// export const deepLAdapter = {
//   async translateText(text: string, source: string, target: string): Promise<string> {
//     try {
//       const result = await translator.translateText(
//         text,
//         LANG_MAP[source] as deepl.SourceLanguageCode,
//         LANG_MAP[target] as deepl.TargetLanguageCode
//       );
//       return Array.isArray(result) ? result[0].text : result.text;
//     } catch {
//       console.warn(`DeepL: unsupported ${source}->${target}, returning source text`);
//       return text;
//     }
//   }
// };


import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import "dotenv/config";

/**
 * Amazon Translate adapter — drop-in replacement for deepLAdapter.
 *
 * Required env vars (same AWS credentials already used by Polly):
 *   AWS_REGION          e.g. "ap-south-1"
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *
 * Amazon Translate language codes for the supported set:
 *   en  → "en"
 *   hi  → "hi"
 *   pa  → "pa"   (Punjabi — supported by Amazon Translate)
 *
 * No mapping table needed — AWS uses the same short codes we already use
 * internally, unlike DeepL which needed "EN-US", "HI", etc.
 */

const client = new TranslateClient({
  region: process.env.AWS_REGION ?? "ap-south-1"
});

export const deepLAdapter = {
  async translateText(text: string, source: string, target: string): Promise<string> {
    try {
      const command = new TranslateTextCommand({
        Text: text,
        SourceLanguageCode: source,   // "en" | "hi" | "pa"
        TargetLanguageCode: target
      });

      const response = await client.send(command);
      return response.TranslatedText ?? text;
    } catch (error) {
      console.warn(`AmazonTranslate: failed ${source}->${target}:`, error);
      return text;   // graceful fallback — same behaviour as the DeepL version
    }
  }
};