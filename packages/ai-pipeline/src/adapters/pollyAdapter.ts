import {
  Engine,
  OutputFormat,
  PollyClient,
  SynthesizeSpeechCommand,
  TextType,
  VoiceId
} from "@aws-sdk/client-polly";

const polly = new PollyClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ""
  }
});

const VOICE_MAP: Record<string, VoiceId> = {
  en: VoiceId.Joanna,
  hi: VoiceId.Aditi,
  pa: VoiceId.Aditi
};

export const pollyAdapter = {
  async synthesizeSpeech(text: string, targetLanguage: string): Promise<string> {
    const command = new SynthesizeSpeechCommand({
      Text: text,
      TextType: TextType.TEXT,
      OutputFormat: OutputFormat.MP3,
      VoiceId: VOICE_MAP[targetLanguage] ?? VoiceId.Joanna,
      Engine: Engine.NEURAL
    });
    const response = await polly.send(command);
    if (!response.AudioStream) {
      throw new Error("Polly returned no audio stream");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString("base64");
  }
};
