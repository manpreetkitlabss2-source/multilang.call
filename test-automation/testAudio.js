// utils/testAudio.js
export const injectAudioStream = async (meetingId, participantId) => {
  try {
    // 1. Load the file
    const response = await fetch('/test-audio.wav');
    const arrayBuffer = await response.arrayBuffer();
    
    // 2. Convert to Base64 (to match your JSON structure)
    const base64Audio = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // 3. Construct Payload
    const payload = {
      meetingId: meetingId,
      participantId: participantId,
      sourceLanguage: "en-US",
      targetLanguages: ["pa-IN", "hi-IN"],
      audioBase64: base64Audio
    };

    // 4. Send to your backend API
    const result = await fetch('/api/audio/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log("Test Audio Injected:", await result.json());
  } catch (err) {
    console.error("Injection failed:", err);
  }
};