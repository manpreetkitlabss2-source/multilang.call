import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
const VideoTile = ({ participant, stream, isMuted, isMirrored = false, isVideoEnabled = true }) => {
    const videoRef = useRef(null);
    useEffect(() => {
        if (!videoRef.current) {
            return;
        }
        videoRef.current.srcObject = stream;
        videoRef.current.muted = isMuted;
        videoRef.current.volume = isMuted ? 0 : 0.9;
    }, [isMuted, stream]);
    return (_jsxs("article", { className: `relative overflow-hidden rounded-[40px] bg-ink text-white shadow-panel transition ${participant.isSpeaking ? "ring-4 ring-accent/40" : "ring-1 ring-white/10"}`, children: [stream && isVideoEnabled ? (_jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, className: `h-72 w-full bg-slate-950 object-cover ${isMirrored ? "scale-x-[-1]" : ""}` })) : (_jsx("div", { className: "flex h-72 items-center justify-center bg-ink", children: _jsx("div", { className: "flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 text-3xl font-semibold text-white", children: participant.displayName.slice(0, 1).toUpperCase() }) })), _jsxs("div", { className: "absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold", children: participant.displayName }), _jsxs("p", { className: "text-xs uppercase tracking-[0.18em] text-sky", children: ["Listening in ", participant.preferredLanguage] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [participant.isMuted ? (_jsx("span", { className: "rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white", children: "Muted" })) : null, _jsx("span", { className: `rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${participant.isSpeaking ? "bg-accent text-white" : "bg-white/10 text-white"}`, children: participant.isSpeaking ? "Speaking" : "Idle" })] })] })] }));
};
export default VideoTile;
