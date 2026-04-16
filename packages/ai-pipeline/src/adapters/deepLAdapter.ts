export const deepLAdapter = {
  async translateText(text: string, sourceLanguage: string, targetLanguage: string) {
    return `[${sourceLanguage}->${targetLanguage}] ${text}`;
  }
};
