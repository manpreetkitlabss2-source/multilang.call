# CODEX_SYSTEM_INSTRUCTIONS.md
**Project:** AI-Powered Multilingual Video Calling Web App
**Tech Stack:** React, Tailwind CSS, Node.js, WebRTC (Twilio/Agora), Socket.io, Zustand, MySQL (Persistence), Redis (Real-time/Cache), Prisma ORM.

## 0. Primary Directives
* **Strict Adherence:** You must follow the exact directory structure, state management boundaries, database responsibilities, and workflow defined below. Do not deviate or suggest alternative architectures.
* **Scope Focus:** Implement ONLY the features required for the AI audio translation pipeline, WebRTC video grid, and basic meeting creation. Do not build complex user authentication systems or billing modules unless explicitly requested.
* **Component Styling:** Use Tailwind CSS exclusively for frontend styling.

---

## 1. Monorepo Directory Structure
You will build this project as a Monorepo using Turborepo. All code must be placed in the following exact locations.

**Root Configuration:**
* `package.json` (monorepo workspaces setup)
* `.env.example` (must include MySQL `DATABASE_URL` and `REDIS_URL`)
* `docker-compose.yml` (must include MySQL and Redis services)
* `turbo.json`

**Packages:**
### A. `packages/client` (Frontend)
* `src/components/`: `VideoGrid.tsx`, `LanguageSelector.tsx`, `TranslationStatus.tsx`, `SpeakingIndicator.tsx`, `MeetingControls.tsx`.
* `src/hooks/`: `useWebRTC.ts` (WebRTC wrapper), `useSocket.ts`, `useAudioPlayer.ts` (plays translated TTS), `useVAD.ts`.
* `src/store/`: `meetingStore.ts`, `translationStore.ts`, `uiStore.ts` (Zustand stores).
* `src/pages/`: `Home.tsx`, `Meet.tsx`, `Join.tsx`.
* `src/lib/`: `socketEvents.ts`, `audioWorklet.ts` (captures raw PCM from mic).

### B. `packages/server` (Backend Signaling & API)
* `prisma/`: `schema.prisma` (MySQL schema definition).
* `src/socket/`: `index.ts`, `meetingHandlers.ts`, `languageHandlers.ts`, `audioHandlers.ts`, `roomManager.ts`.
* `src/routes/`: `meetings.ts`, `tokens.ts`.
* `src/services/`: `meetingService.ts` (Prisma DB calls), `pipelineClient.ts` (HTTP/gRPC bridge to AI).
* `src/middleware/`: `auth.ts`, `rateLimiter.ts`.

### C. `packages/ai-pipeline` (Dedicated AI Worker)
* `src/server.ts`
* `src/stages/`: `stt.ts`, `translate.ts`, `tts.ts`.
* `src/middleware/`: `audioBuffer.ts`, `langRouter.ts`, `cacheLayer.ts` (Redis integration).
* `src/adapters/`: `deepgramAdapter.ts`, `deepLAdapter.ts`, `pollyAdapter.ts`.

### D. `packages/shared` (Types & Constants)
* `types.ts`, `events.ts`, `constants.ts`.

---

## 2. Database Architecture & Responsibilities (CRITICAL)
You must implement a strict separation of concerns between MySQL and Redis.

* **MySQL (via Prisma ORM): Persistent Storage**
  * Use MySQL ONLY for permanent records.
  * Schema should include: `Meeting` (ID, host ID, default language, created at, status) and `ParticipantLogs` (if needed later).
  * **Rule:** Do not write to MySQL during an active call to update participant state.
* **Redis: Real-time State & Caching**
  * Use Redis as the in-memory store for everything happening *during* the live call.
  * Maintains: `meeting:{id}.participants`, `participant.isMuted` (authoritative), `participant.isSpeaking`.
  * **Language Rooms:** Map `meetingId -> { langCode -> Set<socketId> }`.
  * **Translation Cache:** Store translated phrases (`{sourceText}:{sourceLang}:{targetLang}`) with a 1-hour TTL to bypass AI APIs for repeated words.

---

## 3. State Management Rules (Client vs. Server)
* **React State (Zustand - `packages/client/src/store/`):**
  * ONLY stores UI-driven data: `meetingId`, `participants` array, local `isMuted` (optimistic UI), `layoutMode`, `audioBufferQueue` (TTS playback queue).
* **Ephemeral Data (DO NOT STORE IN GLOBAL STATE):**
  * Raw audio chunks, intermediate STT transcripts, and raw WebRTC video streams must be consumed and immediately discarded.

---

## 4. Audio & AI Pipeline Workflow (Rule of Execution)
When implementing the translation flow, you must follow this exact sequence:

1. **Capture:** `audioWorklet.ts` captures raw PCM chunks (every 250ms).
2. **Gate (VAD):** `audioHandlers.ts` buffers audio and waits for Voice Activity Detection (silence) to indicate the end of speech. Do not send partial syllables to the AI pipeline.
3. **Pipeline Bridge:** Send the buffered audio from the Signaling Server to the AI Worker (`packages/ai-pipeline`) via HTTP/gRPC.
4. **Processing (`packages/ai-pipeline`):**
   * STT (Deepgram) extracts text.
   * Translate (DeepL) fans out to target languages.
   * TTS (Polly/ElevenLabs) generates audio buffers per language.
5. **Targeted Delivery:** The signaling server receives the translated buffers and emits them ONLY to the specific language socket room (e.g., `io.to("meet-X:hi").emit(...)`).

---

## 5. Latency & UX Optimization Requirements
You must implement the following UX fallbacks to mask the 1–3 second translation delay:

* **Audio Crossfade:** WebRTC original audio must play at **20% volume** for all participants. When translated TTS audio arrives, `useAudioPlayer.ts` must crossfade it in at **100% volume**.
* **Sequential Playback:** Incoming TTS chunks must be pushed to `uiStore.audioBufferQueue[]` and played sequentially. They must never overlap or interrupt each other.
* **Translation Caching:** Utilize the Redis cache layer implemented in `packages/ai-pipeline/src/middleware/cacheLayer.ts` to dramatically reduce latency on repeated vocabulary.