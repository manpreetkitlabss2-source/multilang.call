
---

**Step 1 — Client emits `audio:chunk`**

The client continuously sends small audio chunks over the socket while the user is speaking. Each chunk carries `meetingId`, `participantId`, `sourceLanguage`, `audioBase64` (raw PCM/WAV encoded as base64), and `averageLevel` (volume of that chunk, a float).

---

**Step 2 — Server buffers chunks** (`audioHandlers.ts`)

The server does NOT process every chunk immediately. It appends each `audioBase64` chunk into an in-memory `Map` keyed by `meetingId:socketId`. Multiple chunks accumulate there while the person is talking. It also emits a `speaking:status` event to the room so other clients can show the "is speaking" indicator.

---

**Step 3 — Silence detection (the trigger)**

Every chunk's `averageLevel` is checked against a threshold of `0.015`. While the level stays above that, chunks keep buffering. When a chunk arrives with a level below `0.015`, the server treats it as a speech boundary — the user paused. This is the only moment processing actually starts.

---

**Step 4 — Flush and find targets**

The entire buffer is concatenated into one single merged audio blob (base64). The server then looks up every participant currently in the meeting room and collects their `preferredLanguage` values — filtering out the speaker's own language. If no other languages exist (everyone speaks the same language), the audio is simply dropped. Otherwise it moves forward.

---

**Step 5 — HTTP POST to AI pipeline** (`pipelineClient.ts`)

The server calls its own internal AI pipeline service at `http://localhost:5001/pipeline/translate` via a plain `fetch` POST. The payload is `{ meetingId, participantId, sourceLanguage, targetLanguages[], audioBase64 }`.

---

**Step 6 — Three pipeline stages run in sequence** (`ai-pipeline/server.ts`)

For each target language, three stages run one after another:

- **STT** (`stt.ts`) — sends the audio to Deepgram, gets back a text transcript
- **Translate** (`translate.ts`) — sends the transcript to DeepL, gets back the translated text. Before calling DeepL it checks a cache layer; if the exact phrase was translated before, it skips the API call entirely (`cacheHit: true`)
- **TTS** (`tts.ts`) — sends the translated text to AWS Polly, gets back a new `audioBase64` in the target language's voice

This loop runs once per target language, so if there are 3 different languages in the room it runs 3 times.

---

**Step 7 — Results returned and broadcast**

The pipeline returns `{ results[] }` back to the server. The server then iterates those results and emits `audio:translated` to a language-specific socket room (`meetingId:targetLanguage`). This means only the participants who actually speak that language receive each translated audio clip.

---

**Step 8 — Receiver client gets `audio:translated`**

The client on the receiving end gets the event containing `transcript` (what was said), `translatedText` (what it means in their language), `audioBase64` (the translated audio to play), and `cacheHit` (whether it came from cache).

---

**One current issue to be aware of**

The socket auth middleware (`socket/index.ts`) lets bad tokens connect silently — it sets `socket.data.userId = undefined` and calls `next()` instead of rejecting. This is why your bad-token test failed. A socket with no `userId` can still receive `audio:translated` events if it somehow joins a language room, because there's no guard on the broadcast side.