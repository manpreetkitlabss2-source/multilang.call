import Redis from "ioredis";
import { AUDIO_CACHE_TTL_SECONDS } from "@multilang-call/shared";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 1
});

const ensureRedis = async () => {
  if (redis.status === "wait") {
    await redis.connect();
  }
};

const cacheKey = (sourceText: string, sourceLanguage: string, targetLanguage: string) =>
  `translation:${sourceText}:${sourceLanguage}:${targetLanguage}`;

export const cacheLayer = {
  async get(sourceText: string, sourceLanguage: string, targetLanguage: string) {
    await ensureRedis();
    return redis.get(cacheKey(sourceText, sourceLanguage, targetLanguage));
  },

  async set(
    sourceText: string,
    sourceLanguage: string,
    targetLanguage: string,
    translatedText: string
  ) {
    await ensureRedis();
    await redis.set(
      cacheKey(sourceText, sourceLanguage, targetLanguage),
      translatedText,
      "EX",
      AUDIO_CACHE_TTL_SECONDS
    );
  }
};
