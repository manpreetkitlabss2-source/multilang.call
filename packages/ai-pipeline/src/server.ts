import express from "express";
import type { TranslationRequest, TranslationResult } from "@multilang-call/shared";
import { normalizeAudioBuffer } from "./middleware/audioBuffer.js";
import { buildLanguageFanout } from "./middleware/langRouter.js";
import { sttStage } from "./stages/stt.js";
import { translateStage } from "./stages/translate.js";
import { ttsStage } from "./stages/tts.js";

const app = express();
const port = Number(process.env.AI_PIPELINE_PORT ?? 5001);

app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/pipeline/translate", async (req, res) => {
  const request = req.body as TranslationRequest;
  const normalizedAudio = normalizeAudioBuffer(request.audioBase64);
  const transcript = await sttStage.run(normalizedAudio, request.sourceLanguage);
  const targetLanguages = buildLanguageFanout(
    request.sourceLanguage,
    request.targetLanguages
  );

  const results: TranslationResult[] = [];

  for (const targetLanguage of targetLanguages) {
    const translation = await translateStage.run(
      transcript,
      request.sourceLanguage,
      targetLanguage
    );
    const audioBase64 = await ttsStage.run(
      translation.translatedText,
      targetLanguage
    );

    results.push({
      meetingId: request.meetingId,
      participantId: request.participantId,
      sourceLanguage: request.sourceLanguage,
      targetLanguage,
      transcript,
      translatedText: translation.translatedText,
      audioBase64,
      cacheHit: translation.cacheHit
    });
  }

  res.json({ results });
});

app.listen(port, () => {
  console.log(`ai-pipeline listening on ${port}`);
});
