import { useTranslationStore } from "../store/translationStore";

const translationLabels = {
  idle: "Waiting for speech",
  capturing: "Capturing audio",
  translating: "Translating speech",
  ready: "Translated audio ready"
} as const;

const TranslationStatus = () => {
  const status = useTranslationStore((state) => state.status);
  const transcript = useTranslationStore((state) => state.activeTranscript);

  return (
    <section className="rounded-3xl bg-white/90 p-5 shadow-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Translation Status</h2>
        <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          {translationLabels[status]}
        </span>
      </div>
      <p className="mt-4 min-h-12 text-sm text-slate-600">
        {transcript || "Translated transcripts will appear here as each queued TTS clip plays."}
      </p>
    </section>
  );
};

export default TranslationStatus;
