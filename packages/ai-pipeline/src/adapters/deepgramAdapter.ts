// export const deepgramAdapter = {
//   async transcribeAudio(audioBase64: string, sourceLanguage: string) {
//     const bytes = Math.ceil(audioBase64.length * 0.75);
//     return `Detected ${sourceLanguage} speech payload (${bytes} bytes)`;
//   }
// };


import { DeepgramClient } from "@deepgram/sdk";
import { Readable } from "stream";

const deepgram = new DeepgramClient({
  apiKey: process.env.DEEPGRAM_API_KEY!,
});
  
export const deepgramAdapter = {
  async transcribeAudio(audioBase64: string, sourceLanguage: string) {
    try {
      const audioBuffer = Buffer.from(audioBase64, "base64");

      // ✅ Convert buffer → stream
      const stream = Readable.from(audioBuffer);

      const response = await deepgram.listen.v1.media.transcribeUrl(
        stream as any, // 🔥 SDK typing workaround
        {
          model: "nova-3",
          language: sourceLanguage.split("-")[0],
          smart_format: true,
        }
      );

      const transcript =
        response.results?.channels?.[0]?.alternatives?.[0]?.transcript;

      return transcript || "";
    } catch (err) {
      console.error("🔥 Deepgram STT Error:", err);
      return "";
    }
  },
};