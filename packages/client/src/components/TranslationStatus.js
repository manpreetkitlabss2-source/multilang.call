import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslationStore } from "../store/translationStore";
const translationLabels = {
    idle: "Waiting for speech",
    capturing: "Capturing audio",
    translating: "Translating speech",
    ready: "Translated audio ready"
};
const TranslationStatus = () => {
    const status = useTranslationStore((state) => state.status);
    const transcript = useTranslationStore((state) => state.activeTranscript);
    return (_jsxs("section", { className: "rounded-3xl bg-white/90 p-5 shadow-panel", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold text-ink", children: "Translation Status" }), _jsx("span", { className: "rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent", children: translationLabels[status] })] }), _jsx("p", { className: "mt-4 min-h-12 text-sm text-slate-600", children: transcript || "Translated transcripts will appear here as each queued TTS clip plays." })] }));
};
export default TranslationStatus;
