# agent.md — Multilingual Video Streaming (WebRTC) Feature Implementation

**Project:** AI-Powered Multilingual Video Calling Web App  
**Feature:** End-to-End WebRTC Video Streaming with Hybrid Multilingual Audio Translation  
**Stack:** React (frontend) · Node.js + Socket.io (server) · AI Pipeline (STT → Translate → TTS) · WebRTC

---

## 0. Pre-Flight Rules (Read Before Writing a Single Line)

1. **Never break existing translation pipeline.** The `audioHandlers.ts` → `pipelineClient.ts` → `ai-pipeline` STT→DeepL→Polly chain is untouchable. All new code integrates *alongside* it.
2. **UI consistency is mandatory.** Every new component must use the existing Tailwind design tokens:
   - Colors: `bg-accent` (teal-700), `bg-ink` (dark navy), `bg-sky` (light blue), `bg-warm` (amber)
   - Radius: `rounded-2xl` for buttons/inputs, `rounded-[28px]`–`rounded-[40px]` for cards/panels
   - Shadow: `shadow-panel`
   - Primary button: `rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60`
   - Danger button: `rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white`
   - Ghost button: `rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-white`
   - Input: `rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent`
3. **Keep Zustand store boundaries.** Only UI-driven, per-session state in Zustand. Nothing persisted.
4. **Architecture decision — Hybrid Mode 2.** Client-side STT (Web Speech API) + server-side translation (existing AI pipeline) + client-side TTS (Web Speech Synthesis API). Audio chunks are **not** sent for video participants — only raw audio streams via WebRTC. Translation pipeline fires only when a participant speaks.
5. **Do not duplicate socket events.** Existing events in `packages/shared/events.ts` (`WEBRTC_OFFER`, `WEBRTC_ANSWER`, `WEBRTC_ICE_CANDIDATE`, `AUDIO_TRANSLATED`, `SPEAKING_STATUS`, etc.) are already defined. Reuse them — never redeclare.
6. **Run `npm run build` in the repo root after completing each phase.** Fix TypeScript errors before moving to the next phase.

---

## 1. Architecture Overview

```
Participant A (Speaker)
  MediaStream → WebRTC peer connections to all others (video/audio direct P2P)
  Web Speech API → transcript text → socket "transcript:ready" → server

Server (packages/server)
  WebRTC signalling (offer/answer/ICE already implemented — just wire the frontend)
  Receives transcript → calls AI Pipeline → broadcasts "audio:translated"

Participant B/C (Listener)
  Receives WebRTC stream (original face/lip-sync, muted or live)
  Receives "audio:translated" blob → plays via AudioContext
  Sees subtitle in TranslationOverlay
```

**Key design decisions:**
- WebRTC tracks carry the original live audio/video (identity, face, lip-sync).
- The AI translation pipeline produces a *separate* translated audio blob per utterance.
- Listeners hear translated audio (AI pipeline output). Original WebRTC audio track can be muted.
- The server's existing `audioHandlers.ts` already handles `audio:chunk`. We add a parallel `transcript:ready` path that skips STT since the client already transcribed.

---

## 2. Shared Package Changes (`packages/shared`)

### 2.1 Add new socket events to `events.ts`

Open `packages/shared/events.ts`. Append inside the existing `SOCKET_EVENTS` object — do NOT replace anything:

```typescript
TRANSCRIPT_READY: "transcript:ready",
```

### 2.2 Add types to `types.ts`

Append to `packages/shared/types.ts`:

```typescript
export interface TranscriptPayload {
  meetingId: string;
  participantId: string;
  sourceLanguage: SupportedLanguageCode;
  text: string;
}

export interface VideoParticipant extends Participant {
  isVideoEnabled: boolean;
}
```

### 2.3 Build shared package

```bash
cd packages/shared && npm run build
```

---

## 3. Server Changes (`packages/server`)

### 3.1 Add `transcript:ready` handler inside `registerAudioHandlers` in `audioHandlers.ts`

Import `TranscriptPayload` and `SupportedLanguageCode` from `@multilang-call/shared`.

Add this socket listener below the existing `AUDIO_CHUNK` handler:

```typescript
socket.on(SOCKET_EVENTS.TRANSCRIPT_READY, async (payload: TranscriptPayload) => {
  if (socket.data.pending) return;

  const { meetingId, participantId, sourceLanguage, text } = payload;

  await roomManager.setSpeaking(meetingId, socket.id, true);
  io.to(meetingId).emit(SOCKET_EVENTS.SPEAKING_STATUS, {
    socketId: socket.id,
    isSpeaking: true
  });

  const participants = await roomManager.getMeetingParticipants(meetingId);
  const targetLanguages = [
    ...new Set(
      participants
        .map((p) => p.preferredLanguage)
        .filter((lang) => lang !== sourceLanguage)
    )
  ] as SupportedLanguageCode[];

  try {
    if (targetLanguages.length > 0) {
      const results = await pipelineClient.translateText({
        meetingId,
        participantId,
        sourceLanguage,
        targetLanguages,
        text
      });

      for (const result of results) {
        io.to(`${meetingId}:${result.targetLanguage}`).emit(
          SOCKET_EVENTS.AUDIO_TRANSLATED,
          result
        );
      }
    }

    io.to(meetingId).emit(SOCKET_EVENTS.TRANSLATION_STATUS, {
      socketId: socket.id,
      participantId,
      sourceLanguage,
      transcript: text
    });
  } finally {
    await roomManager.setSpeaking(meetingId, socket.id, false);
    io.to(meetingId).emit(SOCKET_EVENTS.SPEAKING_STATUS, {
      socketId: socket.id,
      isSpeaking: false
    });
  }
});
```

### 3.2 Add `translateText` method to `PipelineClient` in `pipelineClient.ts`

Add the following interface and implementation alongside the existing `translate` method:

```typescript
export interface TextTranslationRequest {
  meetingId: string;
  participantId: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguages: SupportedLanguageCode[];
  text: string;
}

// Add to PipelineClient interface:
translateText(request: TextTranslationRequest): Promise<TranslationResult[]>;

// Add to createPipelineClient() return object:
async translateText(request) {
  const response = await fetch(`${aiPipelineUrl}/pipeline/translate-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) throw new Error(`Pipeline text-translate failed: ${response.status}`);
  const data = (await response.json()) as { results: TranslationResult[] };
  return data.results;
}
```

---

## 4. AI Pipeline Changes (`packages/ai-pipeline`)

### 4.1 Add `/pipeline/translate-text` endpoint to `server.ts`

Add this route after the existing `/pipeline/translate` route:

```typescript
interface TextTranslateRequest {
  meetingId: string;
  participantId: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguages: SupportedLanguageCode[];
  text: string;
}

app.post("/pipeline/translate-text", async (req, res) => {
  const { text, sourceLanguage, targetLanguages, meetingId, participantId } =
    req.body as TextTranslateRequest;

  const targets = buildLanguageFanout(sourceLanguage, targetLanguages);
  const results: TranslationResult[] = [];

  for (const targetLanguage of targets) {
    const translation = await translateStage.run(text, sourceLanguage, targetLanguage);
    const audioBase64 = await ttsStage.run(translation.translatedText, targetLanguage);

    results.push({
      meetingId,
      participantId,
      sourceLanguage,
      targetLanguage,
      transcript: text,
      translatedText: translation.translatedText,
      audioBase64,
      cacheHit: translation.cacheHit
    });
  }

  res.json({ results });
});
```

### 4.2 Replace adapter stubs with real API implementations

**Install dependencies inside `packages/ai-pipeline`:**

```bash
npm install @deepgram/sdk deepl-node @aws-sdk/client-polly
```

**`src/adapters/deepgramAdapter.ts`** — replace entire file:

```typescript
import { createClient } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY ?? "");

const LANGUAGE_MAP: Record<string, string> = {
  en: "en-US",
  hi: "hi",
  pa: "pa-IN"
};

export const deepgramAdapter = {
  async transcribeAudio(audioBase64: string, sourceLanguage: string): Promise<string> {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      { model: "nova-2", language: LANGUAGE_MAP[sourceLanguage] ?? "en-US", smart_format: true }
    );
    if (error) throw new Error(`Deepgram error: ${error.message}`);
    return result?.results?.channels[0]?.alternatives[0]?.transcript ?? "";
  }
};
```

**`src/adapters/deepLAdapter.ts`** — replace entire file:

```typescript
import * as deepl from "deepl-node";

const translator = new deepl.Translator(process.env.DEEPL_API_KEY ?? "");

const LANG_MAP: Record<string, string> = { en: "EN-US", hi: "HI", pa: "PA" };

export const deepLAdapter = {
  async translateText(text: string, source: string, target: string): Promise<string> {
    try {
      const result = await translator.translateText(
        text,
        LANG_MAP[source] as deepl.SourceLanguageCode,
        LANG_MAP[target] as deepl.TargetLanguageCode
      );
      return Array.isArray(result) ? result[0].text : result.text;
    } catch {
      console.warn(`DeepL: unsupported ${source}→${target}, returning source text`);
      return text;
    }
  }
};
```

**`src/adapters/pollyAdapter.ts`** — replace entire file:

```typescript
import {
  PollyClient, SynthesizeSpeechCommand,
  Engine, OutputFormat, TextType, VoiceId
} from "@aws-sdk/client-polly";

const polly = new PollyClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ""
  }
});

const VOICE_MAP: Record<string, VoiceId> = {
  en: VoiceId.Joanna,
  hi: VoiceId.Aditi,
  pa: VoiceId.Aditi
};

export const pollyAdapter = {
  async synthesizeSpeech(text: string, targetLanguage: string): Promise<string> {
    const command = new SynthesizeSpeechCommand({
      Text: text,
      TextType: TextType.TEXT,
      OutputFormat: OutputFormat.MP3,
      VoiceId: VOICE_MAP[targetLanguage] ?? VoiceId.Joanna,
      Engine: Engine.NEURAL
    });
    const response = await polly.send(command);
    if (!response.AudioStream) throw new Error("Polly returned no audio stream");
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("base64");
  }
};
```

### 4.3 Add environment variables to `packages/ai-pipeline/.env` and `.env.example`

```env
DEEPGRAM_API_KEY=
DEEPL_API_KEY=
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## 5. Frontend Implementation (`packages/client`)

> The frontend app was not included in the source zip. Create it as `packages/client` inside the existing monorepo, following the same package pattern as server/shared/ai-pipeline.

### 5.1 Bootstrap the client package

```bash
cd packages && mkdir client && cd client
```

**`package.json`:**

```json
{
  "name": "@multilang-call/client",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@multilang-call/shared": "*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "socket.io-client": "^4.7.5",
    "zustand": "^4.5.2",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.2.11"
  }
}
```

**`tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

**`vite.config.ts`:**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, "")
      },
      "/socket.io": { target: "http://localhost:4000", ws: true }
    }
  }
});
```

**`tailwind.config.js`:**

```js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#0f766e",
        ink: "#0f172a",
        sky: "#e0f2fe",
        warm: "#fbbf24"
      },
      boxShadow: {
        panel: "0 8px 32px rgba(0,0,0,0.18)"
      }
    }
  },
  plugins: []
};
```

**`postcss.config.js`:**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

**`index.html`:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Multilang Call</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run `npm install` inside `packages/client`.

### 5.2 File structure to create

```
packages/client/src/
  main.tsx
  App.tsx
  index.css
  socket.ts
  store/
    meetingStore.ts
  hooks/
    useWebRTC.ts
    useSpeechRecognition.ts
    useTranslatedAudio.ts
  pages/
    HomePage.tsx
    MeetingPage.tsx
  components/
    VideoGrid.tsx
    VideoTile.tsx
    ControlBar.tsx
    LanguageSelector.tsx
    TranslationOverlay.tsx
    WaitingRoom.tsx
```

### 5.3 `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  background: #0f172a;
  color: white;
  font-family: system-ui, sans-serif;
}
```

### 5.4 `src/main.tsx`

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 5.5 `src/socket.ts`

```typescript
import { io } from "socket.io-client";

const token = localStorage.getItem("auth_token") ?? undefined;

export const socket = io("/", {
  auth: { token },
  autoConnect: false
});
```

### 5.6 `src/store/meetingStore.ts`

```typescript
import { create } from "zustand";
import type { Participant, SupportedLanguageCode, MeetingRecord } from "@multilang-call/shared";

interface MeetingStore {
  meetingId: string | null;
  meeting: MeetingRecord | null;
  participants: Participant[];
  localParticipantId: string | null;
  preferredLanguage: SupportedLanguageCode;
  isMuted: boolean;
  isVideoEnabled: boolean;
  speakingSocketIds: Set<string>;
  waitingParticipants: any[];
  translationSubtitle: string | null;

  setMeeting: (meeting: MeetingRecord) => void;
  setParticipants: (participants: Participant[]) => void;
  setLocalParticipantId: (id: string) => void;
  setPreferredLanguage: (lang: SupportedLanguageCode) => void;
  setMuted: (muted: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  setSpeaking: (socketId: string, isSpeaking: boolean) => void;
  setWaitingParticipants: (list: any[]) => void;
  setTranslationSubtitle: (text: string | null) => void;
  reset: () => void;
}

const DEFAULT: Omit<MeetingStore, keyof { [K in keyof MeetingStore as MeetingStore[K] extends Function ? K : never]: true }> = {
  meetingId: null,
  meeting: null,
  participants: [],
  localParticipantId: null,
  preferredLanguage: "en",
  isMuted: false,
  isVideoEnabled: true,
  speakingSocketIds: new Set(),
  waitingParticipants: [],
  translationSubtitle: null
};

export const useMeetingStore = create<MeetingStore>((set) => ({
  ...DEFAULT,
  setMeeting: (meeting) => set({ meeting, meetingId: meeting.id }),
  setParticipants: (participants) => set({ participants }),
  setLocalParticipantId: (id) => set({ localParticipantId: id }),
  setPreferredLanguage: (lang) => set({ preferredLanguage: lang }),
  setMuted: (muted) => set({ isMuted: muted }),
  setVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),
  setSpeaking: (socketId, isSpeaking) =>
    set((state) => {
      const next = new Set(state.speakingSocketIds);
      isSpeaking ? next.add(socketId) : next.delete(socketId);
      return { speakingSocketIds: next };
    }),
  setWaitingParticipants: (list) => set({ waitingParticipants: list }),
  setTranslationSubtitle: (text) => set({ translationSubtitle: text }),
  reset: () =>
    set({
      ...DEFAULT,
      speakingSocketIds: new Set()
    })
}));
```

### 5.7 `src/hooks/useWebRTC.ts`

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../socket";
import { SOCKET_EVENTS } from "@multilang-call/shared";

interface PeerEntry {
  connection: RTCPeerConnection;
  stream: MediaStream | null;
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

export function useWebRTC(meetingId: string | null) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const cleanupPeer = useCallback((socketId: string) => {
    peersRef.current.get(socketId)?.connection.close();
    peersRef.current.delete(socketId);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
  }, []);

  const startLocalMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const createPeer = useCallback(
    (remoteSocketId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            targetSocketId: remoteSocketId,
            candidate: candidate.toJSON()
          });
        }
      };

      pc.ontrack = ({ streams }) => {
        if (streams[0]) {
          const entry = peersRef.current.get(remoteSocketId);
          if (entry) entry.stream = streams[0];
          setRemoteStreams((prev) => new Map(prev).set(remoteSocketId, streams[0]));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          cleanupPeer(remoteSocketId);
        }
      };

      peersRef.current.set(remoteSocketId, { connection: pc, stream: null });
      return pc;
    },
    [cleanupPeer]
  );

  const callPeer = useCallback(
    async (remoteSocketId: string) => {
      const pc = createPeer(remoteSocketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit(SOCKET_EVENTS.WEBRTC_OFFER, {
        targetSocketId: remoteSocketId,
        description: offer
      });
    },
    [createPeer]
  );

  useEffect(() => {
    if (!meetingId) return;

    const handleOffer = async ({ sourceSocketId, description }: any) => {
      const pc = createPeer(sourceSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(description));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
        targetSocketId: sourceSocketId,
        description: answer
      });
    };

    const handleAnswer = async ({ sourceSocketId, description }: any) => {
      const peer = peersRef.current.get(sourceSocketId);
      if (peer) await peer.connection.setRemoteDescription(new RTCSessionDescription(description));
    };

    const handleIce = async ({ sourceSocketId, candidate }: any) => {
      const peer = peersRef.current.get(sourceSocketId);
      if (peer && candidate) {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const handleLeave = ({ socketId }: any) => cleanupPeer(socketId);

    socket.on(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);
    socket.on(SOCKET_EVENTS.PARTICIPANT_LEAVE, handleLeave);

    return () => {
      socket.off(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);
      socket.off(SOCKET_EVENTS.PARTICIPANT_LEAVE, handleLeave);
    };
  }, [meetingId, createPeer, cleanupPeer]);

  const cleanupAll = useCallback(() => {
    for (const [id] of peersRef.current) cleanupPeer(id);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }, [cleanupPeer]);

  return { localStreamRef, remoteStreams, startLocalMedia, callPeer, cleanupAll };
}
```

### 5.8 `src/hooks/useSpeechRecognition.ts`

```typescript
import { useEffect, useRef, useCallback } from "react";
import { socket } from "../socket";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import type { SupportedLanguageCode } from "@multilang-call/shared";

const LANG_BCP47: Record<SupportedLanguageCode, string> = {
  en: "en-US",
  hi: "hi-IN",
  pa: "pa-IN"
};

export function useSpeechRecognition(
  meetingId: string | null,
  participantId: string | null,
  sourceLanguage: SupportedLanguageCode,
  isMuted: boolean
) {
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const langRef = useRef(sourceLanguage);

  useEffect(() => {
    langRef.current = sourceLanguage;
  }, [sourceLanguage]);

  const stop = useCallback(() => {
    activeRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  const start = useCallback(() => {
    if (!meetingId || !participantId || isMuted) return;

    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      console.warn("Web Speech API not supported. Translation unavailable in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = LANG_BCP47[langRef.current];

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        const text = result[0].transcript.trim();
        if (text.length < 2) return;
        socket.emit(SOCKET_EVENTS.TRANSCRIPT_READY, {
          meetingId,
          participantId,
          sourceLanguage: langRef.current,
          text
        });
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.error("Speech recognition error:", e.error);
    };

    recognition.onend = () => {
      if (activeRef.current && !isMuted) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    activeRef.current = true;
    try { recognition.start(); } catch {}
  }, [meetingId, participantId, isMuted]);

  // Restart when language changes
  useEffect(() => {
    if (activeRef.current) {
      stop();
      setTimeout(start, 200);
    }
  }, [sourceLanguage]);

  // Toggle on mute change
  useEffect(() => {
    if (isMuted) {
      stop();
    } else {
      start();
    }
  }, [isMuted, meetingId, participantId]);

  useEffect(() => () => stop(), []);

  return { start, stop };
}
```

### 5.9 `src/hooks/useTranslatedAudio.ts`

```typescript
import { useEffect, useRef } from "react";
import { socket } from "../socket";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import type { TranslationResult } from "@multilang-call/shared";
import { useMeetingStore } from "../store/meetingStore";

export function useTranslatedAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const setSubtitle = useMeetingStore((s) => s.setTranslationSubtitle);

  useEffect(() => {
    const getCtx = () => {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }
      return audioContextRef.current;
    };

    const handleTranslated = async (result: TranslationResult) => {
      setSubtitle(result.translatedText);
      setTimeout(() => setSubtitle(null), 5000);

      try {
        const ctx = getCtx();
        if (ctx.state === "suspended") await ctx.resume();

        const bytes = atob(result.audioBase64);
        const buffer = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);

        const audioBuffer = await ctx.decodeAudioData(buffer.buffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (err) {
        console.warn("Could not play translated audio:", err);
      }
    };

    socket.on(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslated);
    return () => { socket.off(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslated); };
  }, [setSubtitle]);
}
```

### 5.10 `src/pages/MeetingPage.tsx`

```typescript
import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import { useMeetingStore } from "../store/meetingStore";
import { useWebRTC } from "../hooks/useWebRTC";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useTranslatedAudio } from "../hooks/useTranslatedAudio";
import VideoGrid from "../components/VideoGrid";
import ControlBar from "../components/ControlBar";
import TranslationOverlay from "../components/TranslationOverlay";
import WaitingRoom from "../components/WaitingRoom";

export default function MeetingPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const store = useMeetingStore();
  const isHostRef = useRef(false);
  const joinedRef = useRef(false);
  const knownPeersRef = useRef(new Set<string>());

  const { localStreamRef, remoteStreams, startLocalMedia, callPeer, cleanupAll } =
    useWebRTC(meetingId ?? null);

  useSpeechRecognition(
    meetingId ?? null,
    store.localParticipantId,
    store.preferredLanguage,
    store.isMuted
  );

  useTranslatedAudio();

  useEffect(() => {
    if (!meetingId || joinedRef.current) return;
    joinedRef.current = true;

    const authData = JSON.parse(localStorage.getItem("auth_user") ?? "{}");
    const participantId = authData?.id ?? `guest-${Date.now()}`;
    const displayName = authData?.displayName ?? "Guest";
    const preferredLanguage = store.preferredLanguage;
    isHostRef.current = authData?.role === "HOST";

    store.setLocalParticipantId(participantId);

    socket.connect();

    startLocalMedia().then(() => {
      if (isHostRef.current) {
        socket.emit(SOCKET_EVENTS.MEETING_JOIN, {
          meetingId, participantId, displayName, preferredLanguage
        });
      } else {
        socket.emit(SOCKET_EVENTS.PARTICIPANT_KNOCK, {
          meetingId, participantId, displayName, preferredLanguage
        });
      }
    });

    socket.on(SOCKET_EVENTS.MEETING_STATE, (state: any) => {
      store.setParticipants(state.participants ?? []);

      for (const p of state.participants ?? []) {
        if (p.socketId !== socket.id && !knownPeersRef.current.has(p.socketId)) {
          knownPeersRef.current.add(p.socketId);
          // Avoid double-offer: the socket with the lexicographically smaller ID initiates
          if ((socket.id ?? "") < p.socketId) {
            callPeer(p.socketId);
          }
        }
      }
    });

    socket.on(SOCKET_EVENTS.KNOCK_ACCEPTED, () => {
      // Participant was admitted — meeting state will follow via MEETING_STATE
    });

    socket.on(SOCKET_EVENTS.KNOCK_DENIED, () => {
      navigate("/");
    });

    socket.on(SOCKET_EVENTS.SPEAKING_STATUS, ({ socketId, isSpeaking }: any) => {
      store.setSpeaking(socketId, isSpeaking);
    });

    socket.on(SOCKET_EVENTS.WAITING_ROOM_UPDATE, ({ waitingParticipants }: any) => {
      store.setWaitingParticipants(waitingParticipants ?? []);
    });

    return () => {
      cleanupAll();
      socket.off(SOCKET_EVENTS.MEETING_STATE);
      socket.off(SOCKET_EVENTS.KNOCK_ACCEPTED);
      socket.off(SOCKET_EVENTS.KNOCK_DENIED);
      socket.off(SOCKET_EVENTS.SPEAKING_STATUS);
      socket.off(SOCKET_EVENTS.WAITING_ROOM_UPDATE);
      socket.disconnect();
      store.reset();
      joinedRef.current = false;
      knownPeersRef.current.clear();
    };
  }, [meetingId]);

  const handleLeave = () => {
    cleanupAll();
    socket.disconnect();
    store.reset();
    navigate("/");
  };

  const handleToggleMute = () => {
    const next = !store.isMuted;
    store.setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    socket.emit(SOCKET_EVENTS.MUTE_STATUS, { meetingId, isMuted: next });
  };

  const handleToggleVideo = () => {
    const next = !store.isVideoEnabled;
    store.setVideoEnabled(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
  };

  const handleLanguageChange = (lang: any) => {
    store.setPreferredLanguage(lang);
    socket.emit(SOCKET_EVENTS.LANGUAGE_CHANGE, { meetingId, preferredLanguage: lang });
  };

  return (
    <div className="flex h-screen flex-col bg-ink text-white">
      <div className="flex flex-1 overflow-hidden">
        <VideoGrid
          localStream={localStreamRef.current}
          remoteStreams={remoteStreams}
          participants={store.participants}
          speakingSocketIds={store.speakingSocketIds}
          localSocketId={socket.id ?? ""}
          isVideoEnabled={store.isVideoEnabled}
        />
        {isHostRef.current && store.waitingParticipants.length > 0 && (
          <WaitingRoom meetingId={meetingId!} waitingParticipants={store.waitingParticipants} />
        )}
      </div>
      <TranslationOverlay subtitle={store.translationSubtitle} />
      <ControlBar
        isMuted={store.isMuted}
        isVideoEnabled={store.isVideoEnabled}
        preferredLanguage={store.preferredLanguage}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onLanguageChange={handleLanguageChange}
        onLeave={handleLeave}
      />
    </div>
  );
}
```

### 5.11 `src/components/VideoGrid.tsx`

```typescript
import VideoTile from "./VideoTile";
import type { Participant } from "@multilang-call/shared";

interface Props {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  speakingSocketIds: Set<string>;
  localSocketId: string;
  isVideoEnabled: boolean;
}

export default function VideoGrid({
  localStream, remoteStreams, participants, speakingSocketIds, localSocketId, isVideoEnabled
}: Props) {
  const total = 1 + remoteStreams.size;
  const cols = total === 1 ? "grid-cols-1" : total <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className={`grid ${cols} gap-3 flex-1 p-4 overflow-auto`}>
      <VideoTile
        stream={localStream}
        displayName="You"
        isSpeaking={speakingSocketIds.has(localSocketId)}
        isMirrored
        isVideoEnabled={isVideoEnabled}
      />
      {[...remoteStreams.entries()].map(([socketId, stream]) => {
        const p = participants.find((x) => x.socketId === socketId);
        return (
          <VideoTile
            key={socketId}
            stream={stream}
            displayName={p?.displayName ?? "Participant"}
            isSpeaking={speakingSocketIds.has(socketId)}
            isMuted={p?.isMuted ?? false}
          />
        );
      })}
    </div>
  );
}
```

### 5.12 `src/components/VideoTile.tsx`

```typescript
import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  displayName: string;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isMirrored?: boolean;
  isVideoEnabled?: boolean;
}

export default function VideoTile({
  stream, displayName, isSpeaking, isMuted, isMirrored, isVideoEnabled = true
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`relative rounded-[28px] overflow-hidden bg-ink/80 border-2 transition-all duration-200 min-h-[180px] ${
      isSpeaking
        ? "border-accent shadow-[0_0_0_3px_rgba(15,118,110,0.4)]"
        : "border-white/10"
    }`}>
      {isVideoEnabled && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMirrored}
          className={`w-full h-full object-cover ${isMirrored ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex h-full min-h-[180px] items-center justify-center">
          <div className="rounded-full bg-accent/20 p-6 text-3xl font-bold text-accent">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {displayName}
        </span>
        {isMuted && (
          <span className="rounded-full bg-rose-500/80 px-2 py-1 text-xs text-white">🔇</span>
        )}
      </div>
    </div>
  );
}
```

### 5.13 `src/components/ControlBar.tsx`

```typescript
import LanguageSelector from "./LanguageSelector";
import type { SupportedLanguageCode } from "@multilang-call/shared";

interface Props {
  isMuted: boolean;
  isVideoEnabled: boolean;
  preferredLanguage: SupportedLanguageCode;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLanguageChange: (lang: SupportedLanguageCode) => void;
  onLeave: () => void;
}

export default function ControlBar({
  isMuted, isVideoEnabled, preferredLanguage,
  onToggleMute, onToggleVideo, onLanguageChange, onLeave
}: Props) {
  return (
    <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-ink px-6 py-4">
      <button
        onClick={onToggleMute}
        className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
          isMuted ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {isMuted ? "🔇 Unmute" : "🎤 Mute"}
      </button>

      <button
        onClick={onToggleVideo}
        className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
          !isVideoEnabled ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {isVideoEnabled ? "📷 Video On" : "📷 Video Off"}
      </button>

      <LanguageSelector value={preferredLanguage} onChange={onLanguageChange} />

      <button
        onClick={onLeave}
        className="rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
      >
        ✕ Leave
      </button>
    </div>
  );
}
```

### 5.14 `src/components/LanguageSelector.tsx`

```typescript
import { SUPPORTED_LANGUAGES } from "@multilang-call/shared";
import type { SupportedLanguageCode } from "@multilang-call/shared";

interface Props {
  value: SupportedLanguageCode;
  onChange: (lang: SupportedLanguageCode) => void;
}

export default function LanguageSelector({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SupportedLanguageCode)}
      className="rounded-2xl border border-teal-200/30 bg-white/10 px-4 py-3 text-sm text-white outline-none focus:border-accent cursor-pointer"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code} className="bg-ink text-white">
          🌐 {lang.label}
        </option>
      ))}
    </select>
  );
}
```

### 5.15 `src/components/TranslationOverlay.tsx`

```typescript
interface Props { subtitle: string | null; }

export default function TranslationOverlay({ subtitle }: Props) {
  if (!subtitle) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 max-w-lg rounded-2xl bg-black/70 px-6 py-3 text-center text-sm font-semibold text-white shadow-panel backdrop-blur">
      {subtitle}
    </div>
  );
}
```

### 5.16 `src/components/WaitingRoom.tsx`

```typescript
import { socket } from "../socket";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import type { WaitingParticipant } from "@multilang-call/shared";

interface Props {
  meetingId: string;
  waitingParticipants: WaitingParticipant[];
}

export default function WaitingRoom({ meetingId, waitingParticipants }: Props) {
  const admit = (socketId: string) =>
    socket.emit(SOCKET_EVENTS.ADMIT_PARTICIPANT, { meetingId, targetSocketId: socketId });

  const deny = (socketId: string) =>
    socket.emit(SOCKET_EVENTS.DENY_PARTICIPANT, { meetingId, targetSocketId: socketId });

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-white/10 bg-ink/60 p-4">
      <div className="mb-3 inline-flex rounded-full bg-teal-100/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
        Waiting ({waitingParticipants.length})
      </div>
      <ul className="space-y-2">
        {waitingParticipants.map((p) => (
          <li key={p.socketId} className="rounded-[28px] bg-white/5 p-3 shadow-panel">
            <p className="mb-2 truncate text-sm font-semibold text-white">{p.displayName}</p>
            <p className="mb-3 text-xs text-white/50">
              Prefers: {p.preferredLanguage.toUpperCase()}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => admit(p.socketId)}
                className="rounded-2xl bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition"
              >
                Admit
              </button>
              <button
                onClick={() => deny(p.socketId)}
                className="rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 transition"
              >
                Deny
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

### 5.17 `src/pages/HomePage.tsx`

Create/join meeting entry page. Use the existing REST API:

- `POST /meetings` with `{ hostId, defaultLanguage }` → returns `{ meeting, joinUrl }`
- Navigate to `/meeting/:meetingId` after creation

Use design tokens. Include a language picker for default meeting language. Store `auth_user` in `localStorage` after login (use existing `POST /auth/login` endpoint).

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LanguageSelector from "../components/LanguageSelector";
import type { SupportedLanguageCode } from "@multilang-call/shared";

export default function HomePage() {
  const navigate = useNavigate();
  const [defaultLanguage, setDefaultLanguage] = useState<SupportedLanguageCode>("en");
  const [meetingIdInput, setMeetingIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authData = JSON.parse(localStorage.getItem("auth_user") ?? "{}");

  const createMeeting = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}`
        },
        body: JSON.stringify({ hostId: authData?.id ?? "anon", defaultLanguage })
      });
      if (!res.ok) throw new Error("Failed to create meeting");
      const data = await res.json();
      navigate(`/meeting/${data.meeting.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const joinMeeting = () => {
    const id = meetingIdInput.trim();
    if (id) navigate(`/meeting/${id}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md rounded-[40px] bg-white/5 p-8 shadow-panel">
        <h1 className="mb-2 text-2xl font-bold text-white">Multilang Call</h1>
        <p className="mb-8 text-sm text-white/50">Real-time multilingual video calls</p>

        {/* Create Meeting */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-accent">
            Default Language
          </label>
          <LanguageSelector value={defaultLanguage} onChange={setDefaultLanguage} />
          <button
            onClick={createMeeting}
            disabled={loading}
            className="mt-3 w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Meeting"}
          </button>
        </div>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-white/30">or join existing</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Join Meeting */}
        <div>
          <input
            value={meetingIdInput}
            onChange={(e) => setMeetingIdInput(e.target.value)}
            placeholder="Enter meeting ID"
            className="mb-3 w-full rounded-2xl border border-teal-200/30 bg-white/10 px-4 py-3 text-sm text-white outline-none focus:border-accent placeholder:text-white/30"
          />
          <button
            onClick={joinMeeting}
            className="w-full rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Join Meeting
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-rose-500/20 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
```

### 5.18 `src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import MeetingPage from "./pages/MeetingPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/meeting/:meetingId" element={<MeetingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 6. Environment & Monorepo Wiring

### 6.1 Add `packages/client` to root `package.json` workspaces

Ensure the root `package.json` has:

```json
{
  "workspaces": ["packages/*"]
}
```

### 6.2 Update root `.env.example` with all pipeline keys

```env
PORT=4000
DATABASE_URL=mysql://user:password@localhost:3306/multilang_call
JWT_SECRET=your_jwt_secret_here
REDIS_URL=redis://localhost:6379
AI_PIPELINE_PORT=5001
AI_PIPELINE_URL=http://localhost:5001
DEEPGRAM_API_KEY=
DEEPL_API_KEY=
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

### 6.3 Update `docker-compose.yml` — add client service

```yaml
  client:
    build:
      context: ./packages/client
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - server
```

Create `packages/client/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Create `packages/client/nginx.conf`:

```nginx
server {
  listen 80;
  location / {
    root /usr/share/nginx/html;
    index index.html;
    try_files $uri $uri/ /index.html;
  }
  location /socket.io/ {
    proxy_pass http://server:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
  location /api/ {
    proxy_pass http://server:4000/;
  }
}
```

### 6.4 Update `turbo.json` — ensure client is included

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## 7. Testing Checklist

Verify each item passes before marking the feature complete:

- [ ] `npm run build` from repo root exits zero with no TypeScript errors
- [ ] `packages/shared` exports `SOCKET_EVENTS.TRANSCRIPT_READY`
- [ ] `GET http://localhost:5001/health` returns `{ ok: true }`
- [ ] `POST http://localhost:5001/pipeline/translate-text` with `{ meetingId, participantId, sourceLanguage: "en", targetLanguages: ["hi"], text: "Hello" }` returns results array
- [ ] `GET http://localhost:4000/health` returns `{ ok: true }`
- [ ] Open `http://localhost:3000` — HomePage renders with design tokens
- [ ] Create meeting as host → redirected to `/meeting/:id`
- [ ] Local video tile appears with camera feed
- [ ] Open second browser tab → join as participant → waiting room shows on host side
- [ ] Host admits participant → both see each other's video tiles via WebRTC
- [ ] Speak in Browser A → `transcript:ready` fires → `audio:translated` received in Browser B → subtitle appears → translated audio plays
- [ ] Mute toggle → audio track disabled → other participant sees mute icon
- [ ] Language change → subsequent translations arrive in new language
- [ ] Leave button → connections close cleanly → navigated to HomePage
- [ ] Speaking indicator (border glow on tile) appears when participant speaks

---

## 8. Browser Compatibility Notes

- **Web Speech API** works in Chrome and Edge only. Firefox does not support it. The `useSpeechRecognition` hook gracefully falls back with a console warning — video still works, only translation/subtitles are unavailable.
- **WebRTC** works in all modern browsers.
- **AudioContext** requires a prior user gesture before audio playback is allowed. The `useTranslatedAudio` hook calls `ctx.resume()` before each playback attempt, which satisfies this requirement as long as the user has interacted with the page (e.g., clicked "Join").
- **HTTPS required in production** for `getUserMedia` (camera/mic access). Local development on `localhost` is exempt.

---

## 9. Security & Performance Notes

- Never commit `.env` files. All secrets via environment variables only.
- The existing JWT middleware in `packages/server/src/middleware/auth.ts` protects all `/meetings` REST routes. Do not bypass it.
- The `TRANSCRIPT_READY` socket handler gates on `socket.data.pending === false` to prevent unadmitted participants from triggering translations.
- Translation results are cached in Redis (1-hour TTL via `cacheLayer.ts`). Repeated phrases cost nothing.
- Each WebRTC `AudioBufferSourceNode` is used once and garbage-collected after playback.
- For production with more than 10 participants behind symmetric NAT, add a TURN server URL to the `ICE_SERVERS` array in `useWebRTC.ts`.

---

## End of Instructions

After all steps are implemented:

```bash
npm install          # from repo root
npm run build        # verify zero errors
npm run dev          # start all services
```

Open `http://localhost:3000` to test the complete end-to-end multilingual WebRTC video call feature.
