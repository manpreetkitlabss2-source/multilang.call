export const deepgramAdapter = {
  async transcribeAudio(audioBase64: string, sourceLanguage: string) {
    const bytes = Math.ceil(audioBase64.length * 0.75);
    return `Detected ${sourceLanguage} speech payload (${bytes} bytes)`;
  }
};
