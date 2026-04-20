import { DeepgramClient } from "@deepgram/sdk";

const deepgram = new DeepgramClient({
  apiKey: process.env.DEEPGRAM_API_KEY ?? ""
});

const LANGUAGE_MAP: Record<string, string> = {
  en: "en-US",
  hi: "hi",
  pa: "pa-IN"
};

export const deepgramAdapter = {
  async transcribeAudio(audioBase64: string, sourceLanguage: string): Promise<string> {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const response = await deepgram.listen.v1.media.transcribeFile(audioBuffer, {
      model: "nova-2",
      language: LANGUAGE_MAP[sourceLanguage] ?? "en-US",
      smart_format: true
    });

    if (!("results" in response)) {
      throw new Error(`Deepgram request accepted asynchronously: ${response.request_id}`);
    }

    const firstChannel = response.results.channels[0];
    const firstAlternative = firstChannel?.alternatives?.[0];
    return firstAlternative?.transcript ?? "";
  }
};
