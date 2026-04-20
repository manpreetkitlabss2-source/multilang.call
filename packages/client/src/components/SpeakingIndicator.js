import { jsx as _jsx } from "react/jsx-runtime";
const SpeakingIndicator = ({ isSpeaking }) => (_jsx("span", { className: `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${isSpeaking ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`, children: isSpeaking ? "Speaking" : "Idle" }));
export default SpeakingIndicator;
