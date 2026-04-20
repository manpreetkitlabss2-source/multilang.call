import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import LanguageSelector from "./LanguageSelector";
const MeetingControls = ({ isMuted, isVideoEnabled, preferredLanguage, onToggleMute, onToggleVideo, onLanguageChange, onLeave }) => (_jsxs("div", { className: "flex flex-wrap items-end gap-3 rounded-[36px] bg-ink p-4 text-white shadow-panel", children: [_jsx("button", { type: "button", onClick: onToggleMute, className: isMuted
                ? "rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white"
                : "rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-white", children: isMuted ? "Unmute microphone" : "Mute microphone" }), _jsx("button", { type: "button", onClick: onToggleVideo, className: isVideoEnabled
                ? "rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-white"
                : "rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white", children: isVideoEnabled ? "Turn video off" : "Turn video on" }), _jsx("div", { className: "min-w-[220px] flex-1", children: _jsx(LanguageSelector, { label: "Listening language", value: preferredLanguage, onChange: onLanguageChange, variant: "dark" }) }), _jsx("button", { type: "button", onClick: onLeave, className: "rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white", children: "Leave meeting" })] }));
export default MeetingControls;
