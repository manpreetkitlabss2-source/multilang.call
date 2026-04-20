import { jsx as _jsx } from "react/jsx-runtime";
const TranslationOverlay = ({ subtitle }) => {
    if (!subtitle) {
        return null;
    }
    return (_jsx("div", { className: "pointer-events-none fixed bottom-24 left-1/2 z-50 w-[min(90vw,42rem)] -translate-x-1/2 rounded-[28px] bg-ink/90 px-6 py-4 text-center text-sm font-semibold text-white shadow-panel backdrop-blur", children: subtitle }));
};
export default TranslationOverlay;
