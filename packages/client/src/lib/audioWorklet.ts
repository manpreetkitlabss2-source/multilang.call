export const audioWorkletProcessor = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = [];
    this.chunkSize = Math.round((sampleRate / 1000) * 250);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    for (const sample of input[0]) {
      this.chunk.push(sample);
      if (this.chunk.length >= this.chunkSize) {
        this.port.postMessage(Float32Array.from(this.chunk));
        this.chunk = [];
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
`;

export const registerAudioWorklet = async (audioContext: AudioContext) => {
  const blob = new Blob([audioWorkletProcessor], {
    type: "application/javascript"
  });
  const url = URL.createObjectURL(blob);
  await audioContext.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
};
