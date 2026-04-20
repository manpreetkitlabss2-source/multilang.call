import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
export const AudioTestInjector = ({ meetingId, participantId }) => {
    const [isLooping, setIsLooping] = useState(false);
    const intervalRef = useRef(null);
    const injectAudioStream = async () => {
        try {
            // 1. Fetch file from /public folder
            const response = await fetch('/test-audio.wav');
            const arrayBuffer = await response.arrayBuffer();
            // 2. Convert to Base64
            const base64Audio = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            // 3. Prepare payload
            const payload = {
                meetingId,
                participantId,
                sourceLanguage: "en-US",
                targetLanguages: ["pa-IN", "hi-IN"],
                audioBase64: base64Audio
            };
            // 4. Send to your API (Update endpoint if necessary)
            const result = await fetch('/api/audio/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("Test Audio Injected:", await result.json());
        }
        catch (err) {
            console.error("Injection failed:", err);
        }
    };
    const handleStartLoop = () => {
        if (isLooping)
            return;
        setIsLooping(true);
        injectAudioStream(); // Send first one immediately
        intervalRef.current = setInterval(() => {
            console.log("Auto-sending audio...");
            injectAudioStream();
        }, 5000); // 5000ms = 5 seconds
    };
    const handleStopLoop = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsLooping(false);
    };
    return (_jsxs("div", { style: { padding: '16px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '10px' }, children: [_jsx("h4", { children: "Test Audio Injector" }), _jsxs("div", { style: { fontSize: '12px', color: '#666' }, children: [_jsxs("div", { children: ["Meeting: ", meetingId] }), _jsxs("div", { children: ["User: ", participantId] })] }), _jsx("button", { onClick: injectAudioStream, style: { padding: '8px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }, children: "Send 1x Audio" }), isLooping ? (_jsx("button", { onClick: handleStopLoop, style: { padding: '8px', background: '#e00', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }, children: "Stop Auto-Loop" })) : (_jsx("button", { onClick: handleStartLoop, style: { padding: '8px', background: '#0a0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }, children: "Start 5s Auto-Loop" }))] }));
};
