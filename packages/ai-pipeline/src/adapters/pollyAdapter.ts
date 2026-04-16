const encodeWavLikeAudio = (text: string) =>
  Buffer.from(`WAV:${text}`, "utf8").toString("base64");

export const pollyAdapter = {
  async synthesizeSpeech(text: string, targetLanguage: string) {
    return encodeWavLikeAudio(`${targetLanguage}:${text}`);
  }
};
