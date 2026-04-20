# Project Progress

> Honest status of what is actually working end-to-end vs what exists in code but is not fully functional or not yet built.

---

## ✅ Done — fully working

### Infrastructure
- Docker Compose setup for MySQL and Redis
- Turborepo monorepo with `npm run dev` starting all three services in parallel
- Prisma schema with migrations for all core tables
- Environment config with `.env.example`
- Multi-stage Dockerfile (builder → server runtime)

### Auth
- User registration with email, display name, password (bcrypt), and role (HOST / PARTICIPANT)
- Login returning a signed JWT
- `/auth/me` token validation endpoint
- JWT auth middleware protecting all non-public routes
- Zustand `authStore` with localStorage persistence (`mlc_token`)
- `useAuth` hook hydrating user from token on page load
- `ProtectedRoute` component redirecting unauthenticated users to `/auth`
- Auth page (login + register forms) with redirect-back support

### Meeting creation
- `POST /meetings` — HOST only, creates a meeting with default language
- Meeting stored in MySQL with `hostUserId`, `defaultLanguage`, `status`
- `GET /meetings/:id` — returns meeting details with host display name
- Home page with language selector and create meeting button

### Waiting room
- Participant knock flow: `participant:knock` → host sees waiting room panel → `host:admit` / `host:deny`
- Host join flow: `meeting:join` → 3-way auth check (no token / wrong user / correct host) → `host:join_success` or `host:join_error`
- Waiting room panel in Meet page showing pending participants with admit/deny buttons
- Waiting state UI for participants (animated pulse, "waiting for host" message)
- Denied state UI with reason message
- Waiting participants stored in Redis, cleared on disconnect
- `MeetingParticipant` record written to MySQL on admit (host and participant)

### Magic links (invite system)
- `POST /meetings/:id/magic-links` — generates expirable tokens (default 48h)
- `GET /invite/:token` — validates token, returns meeting default language
- Token marked as used only when participant actually joins (not on validation)
- Re-knock allowed if token was already used but participant was previously admitted
- Invite panel in Meet page (host only) with optional email field and clipboard copy
- Magic link URL uses `BASE_URL` env var (fixed from hardcoded port 3000)

### Scheduled meetings
- `POST /scheduled-meetings` — HOST only, creates a future meeting with title, time, duration, timezone
- `GET /scheduled-meetings` — lists host's scheduled meetings
- `GET /s/:shareToken` — public landing page data with countdown
- `POST /scheduled-meetings/:id/start` — converts scheduled meeting to live meeting (idempotent)
- `DELETE /scheduled-meetings/:id` — HOST only
- Schedule page UI with form and list of upcoming meetings
- Schedule landing page (`/s/:shareToken`) with countdown and join button

### AI translation pipeline
- Deepgram STT adapter
- DeepL translation adapter
- Amazon Polly TTS adapter
- Redis translation cache (1-hour TTL) — repeated phrases skip API calls
- Language fanout middleware — only translates to languages actually present in the room
- `POST /pipeline/translate` — full audio pipeline endpoint
- `POST /pipeline/translate-text` — text-only pipeline endpoint (for testing)
- Audio buffering on server: chunks accumulated until VAD silence boundary, then sent as one batch
- Translated audio delivered only to the correct language room (targeted delivery)

### WebRTC video
- `useWebRTC` hook managing peer connections
- Offer / answer / ICE candidate signalling via Socket.IO relay
- `VideoGrid` and `VideoTile` components rendering local and remote streams
- Mute toggle affecting both local audio track and server-side mute state

### Client audio pipeline
- `AudioWorklet` (`pcm-processor`) capturing raw PCM from microphone
- VAD (`useVAD`) running silence detection before emitting chunks
- Audio chunks emitted as base64 PCM via `audio:chunk` socket event
- `useAudioPlayer` hook playing translated audio at 100% volume
- Original room audio at 20% volume (crossfade logic in audio player)
- TTS audio queued sequentially — no overlap

### Real-time state
- `roomManager` backed by Redis: participants, language rooms, waiting queue
- `meeting:state` broadcast on every join/leave/admit
- `speaking:status` broadcast on VAD transitions
- `mute:status` synced to all participants
- `language:change` moves participant between language rooms in Redis

### Cleanup service
- Background job running every 24 hours
- Deletes `ParticipantLog` entries older than 90 days
- Deletes expired and used `MagicLink` rows
- Archives `Meeting` rows ended more than 30 days ago
- Removes `MeetingParticipant` rows from archived meetings
- Graceful shutdown on `SIGTERM` / `SIGINT`

### Codebase quality
- All duplicate `.js` compiled copies removed from `packages/client/src/`
- Stub pages (`HomePage.tsx`, `MeetingPage.tsx`) removed
- `vite.config.js` duplicate removed; `allowedHosts: true` merged into `vite.config.ts`
- Debug `console.log` and `onAny` event logger removed from `useSocket`
- CORS changed from wildcard `*` to env-driven `CLIENT_URL`
- Backward-compat comment added to `/meeting/:meetingId` route in `App.tsx`

---

## ⚠️ Partially done — code exists but not fully functional

### Prisma migration pending
- The schema has been updated (added `MeetingParticipant`, `ParticipantLog`, extended `Meeting` / `MagicLink` / `ScheduledMeeting`) but `prisma migrate dev` cannot run due to a MySQL `sha256_password` authentication plugin issue in the local environment.
- The schema validates (`prisma validate` passes) and the raw SQL queries include all new columns (`updatedAt`, etc.), so the server runs against the existing DB, but the new tables (`MeetingParticipant`, `ParticipantLog`) do not exist in the database yet.
- **Impact:** `addParticipantToMeeting` calls will fail silently (caught by the server but not fatal to the call flow). Cleanup service queries against `ParticipantLog` and `MeetingParticipant` will also fail.

### Session recovery on page refresh
- `sessionStorage` is used to persist join state (`displayName`, `preferredLanguage`, `inviteToken`) across a refresh.
- The socket reconnects and re-emits the join/knock event, but there is no server-side deduplication — a participant who refreshes will appear in the waiting room again even if they were already admitted.

### `endMeeting` not triggered
- The `endMeeting` service method exists and sets `status = 'ENDED'` with `endedAt` and `expiresAt`, but there is no route or socket event that calls it. Meetings stay in `ACTIVE` status indefinitely.

### `ScheduledMeeting.status` field unused
- The schema has a `status` column (`PENDING` / default) on `ScheduledMeeting` but no code reads or writes it beyond the default. Cancellation (`cancelledAt`) is also schema-only.

---

## ❌ Not done — planned but not built

### Group video (more than 2 participants)
- The current WebRTC implementation is mesh-based (each peer connects to every other peer directly). This works for 2–3 participants but has not been tested or optimised for larger groups. No SFU (selective forwarding unit) is in place.

### Language change during an active call
- The `language:change` socket event updates Redis and moves the participant to the correct language room. However, the client UI language selector in the Meet page triggers a re-render but does not re-negotiate the audio subscription — participants may miss translated audio after switching until they rejoin.

### Real-time subtitles
- Transcript text is available from the STT stage and is included in `TranslationResult`, but there is no subtitle overlay rendered in the meeting UI.

### Speaker identity preservation / voice cloning
- TTS uses Amazon Polly with fixed voices per language. There is no per-speaker voice mapping or voice cloning.

### Email delivery for magic links
- The magic link URL is generated and returned in the API response (and copied to clipboard in the UI), but there is no email sending. The `inviteeEmail` field is stored but never used to send anything.

### Co-host role
- `ParticipantRole.CO_HOST` exists in the schema and shared types but there is no UI to assign it, no socket handler that grants co-host permissions, and no route to promote a participant.

### Meeting recording / export
- Not started.

### Mobile / responsive layout
- The Meet page layout is desktop-first. It has not been tested or adapted for mobile viewports.

### Production deployment
- The Dockerfile builds the server image. There is no CI/CD pipeline, no client static hosting config (Vercel / S3 / nginx), and no production environment configuration beyond what is in `.env.example`.

### Rate limiting
- No rate limiting on auth endpoints (`/auth/login`, `/auth/register`) or the magic link generation endpoint.

### Admin panel
- No admin interface for managing users, meetings, or viewing logs.
