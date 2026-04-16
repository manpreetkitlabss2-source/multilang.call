import { useEffect, useRef, useState } from "react";
import { useUIStore } from "../store/uiStore";
import { useTranslationStore } from "../store/translationStore";

const fadeIn = (audio: HTMLAudioElement) =>
  new Promise<void>((resolve) => {
    audio.volume = 0;
    const startedAt = performance.now();

    const tick = (time: number) => {
      const progress = Math.min((time - startedAt) / 350, 1);
      audio.volume = progress;
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(tick);
  });

export const useAudioPlayer = () => {
  const queueLength = useUIStore((state) => state.audioBufferQueue.length);
  const dequeueAudio = useUIStore((state) => state.dequeueAudio);
  const setStatus = useTranslationStore((state) => state.setStatus);
  const setTranscript = useTranslationStore((state) => state.setTranscript);
  const isPlayingRef = useRef(false);
  const [playbackTick, setPlaybackTick] = useState(0);

  useEffect(() => {
    if (isPlayingRef.current || queueLength === 0) {
      return;
    }

    const next = dequeueAudio();
    if (!next) {
      return;
    }

    isPlayingRef.current = true;
    setStatus("ready");
    setTranscript(next.transcript);

    const audio = new Audio(`data:audio/wav;base64,${next.audioBase64}`);
    audio.volume = 0;
    void audio
      .play()
      .then(() => fadeIn(audio))
      .catch(() => {
        isPlayingRef.current = false;
      });

    audio.addEventListener(
      "ended",
      () => {
        isPlayingRef.current = false;
        setStatus("idle");
        setPlaybackTick((current) => current + 1);
      },
      { once: true }
    );
  }, [dequeueAudio, playbackTick, queueLength, setStatus, setTranscript]);
};
