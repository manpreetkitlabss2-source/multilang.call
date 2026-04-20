# multilang-call

An AI-powered multilingual video calling platform. Participants join a shared meeting room and each person hears every speaker translated into their own chosen language in real time — no common language required.

---

## How it works

1. A host registers, creates a meeting room, and shares the link.
2. Each participant opens the link, picks their preferred listening language, and knocks to join.
3. The host admits participants from a waiting room panel.
4. Once inside, every spoken word is captured, sent through an AI pipeline (STT → translate → TTS), and the translated audio is delivered only to participants whose language differs from the speaker's.
5. Original audio plays at 20% volume underneath; translated audio plays at full volume with a crossfade.

---

## Monorepo structure

```
multilang-call/
├── packages/
│   ├── client/          React + Vite frontend
│   ├── server/          Node.js + Express + Socket.IO backend
│   ├── ai-pipeline/     STT → Translation → TTS microservice
│   └── shared/          Types, constants, and socket event names
├── docker-compose.yml   MySQL + Redis infrastructure
├── Dockerfile           Multi-stage build (builder → server runtime)
└── turbo.json           Turborepo pipeline config
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| Realtime | Socket.IO, WebRTC (native) |
| Backend | Node.js, Express, Socket.IO |
| Database | MySQL via Prisma (raw SQL queries) |
| Cache / state | Redis (ioredis) |
| STT | Deepgram |
| Translation | DeepL |
| TTS | Amazon Polly |
| Auth | JWT (stored in localStorage via Zustand persist) |
| Monorepo | Turborepo + npm workspaces |

---

## Supported languages

English (`en`), Hindi (`hi`), Punjabi (`pa`)

---

## Prerequisites

- Node.js 20+
- Docker (for MySQL and Redis)
- API keys: Deepgram, DeepL, AWS (Polly)

---

## Local setup

### 1. Start infrastructure

```bash
docker-compose up -d
```

This starts MySQL on `3306` and Redis on `6379`.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env` in the repo root and in `packages/server/`:

```bash
cp .env.example .env
cp .env.example packages/server/.env
```

Fill in the required values:

```env
DATABASE_URL=mysql://multilang:multilang@localhost:3306/multilang_call
REDIS_URL=redis://localhost:6379
JWT_SECRET=<at_least_32_random_chars>
DEEPGRAM_API_KEY=<your_key>
DEEPL_API_KEY=<your_key>
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your_key>
AWS_SECRET_ACCESS_KEY=<your_key>
BASE_URL=http://localhost:5173
CLIENT_URL=http://localhost:5173
```

### 4. Run database migrations

```bash
cd packages/server
npx prisma migrate dev
```

### 5. Start all services

```bash
npm run dev
```

Turborepo starts all three packages in parallel:

| Service | URL |
|---|---|
| Client | http://localhost:5173 |
| Server | http://localhost:4000 |
| AI pipeline | http://localhost:5001 |

---

## Key API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register (role: HOST or PARTICIPANT) |
| POST | `/auth/login` | — | Login, returns JWT |
| GET | `/auth/me` | JWT | Validate token, return user |
| POST | `/meetings` | HOST | Create a meeting room |
| GET | `/meetings/:id` | JWT | Get meeting details |
| POST | `/meetings/:id/magic-links` | HOST | Generate invite links |
| GET | `/invite/:token` | — | Validate a magic link |
| POST | `/scheduled-meetings` | HOST | Schedule a future meeting |
| GET | `/scheduled-meetings` | HOST | List host's scheduled meetings |
| GET | `/s/:shareToken` | — | Public schedule landing page data |
| POST | `/scheduled-meetings/:id/start` | HOST | Convert scheduled → live meeting |

---

## Socket events

| Event | Direction | Description |
|---|---|---|
| `meeting:join` | client → server | Host joins their own meeting |
| `host:join_success` | server → client | Confirms host was admitted |
| `host:join_error` | server → client | Auth or ownership failure |
| `participant:knock` | client → server | Participant requests to join |
| `host:admit` | client → server | Host admits a waiting participant |
| `host:deny` | client → server | Host denies a waiting participant |
| `participant:knock_accepted` | server → client | Participant is admitted |
| `participant:knock_denied` | server → client | Participant is denied |
| `host:waiting_room_update` | server → host | Waiting room list changed |
| `meeting:state` | server → room | Full participant list broadcast |
| `audio:chunk` | client → server | Raw PCM audio chunk |
| `audio:translated` | server → client | Translated audio result |
| `speaking:status` | server → room | Who is currently speaking |
| `mute:status` | client → server | Mute toggle |
| `language:change` | client → server | Participant changed language |
| `webrtc:offer/answer/ice-candidate` | peer → peer | WebRTC signalling |

---

## AI pipeline

The `ai-pipeline` package runs as a separate HTTP microservice. The server calls it via `POST /pipeline/translate` with buffered PCM audio. The pipeline runs sequentially:

```
Audio (base64 PCM) → Deepgram STT → DeepL translate → Amazon Polly TTS → base64 MP3
```

Translations are cached in Redis with a 1-hour TTL to avoid redundant API calls for repeated phrases.

---

## Database schema (key tables)

- `User` — registered users with role (HOST / PARTICIPANT)
- `Meeting` — live meeting rooms, linked to host user
- `MeetingParticipant` — per-meeting join record with role and language
- `MagicLink` — expirable invite tokens
- `ScheduledMeeting` — future meetings with share token
- `ParticipantLog` — audit log of join/leave events

---

## User roles

| Role | Can do |
|---|---|
| HOST | Create meetings, admit/deny participants, generate invite links, schedule meetings |
| PARTICIPANT | Join via invite link or direct link, select language |

---

## Waiting room flow

```
Participant knocks → Host sees notification → Host admits or denies
→ Admitted: participant enters room
→ Denied: participant sees rejection message
```

No participant is ever auto-admitted. Host approval is always required.

---

## Audio pipeline rules

- VAD (voice activity detection) runs client-side before sending audio
- Audio is buffered until a silence boundary is detected, then sent as one chunk
- Translated audio is delivered only to the language room of the target language
- Original audio plays at 20% volume; translated audio plays at 100% with crossfade
- TTS audio is queued sequentially — no overlap

---

## Cleanup service

A background job runs every 24 hours on the server:
- Deletes participant logs older than 90 days
- Deletes expired and used magic links
- Archives meetings that ended more than 30 days ago
- Removes participant records from archived meetings

---

## Project rules (enforced)

- MySQL stores only persistent data (users, meetings, schedules)
- Redis stores only live state (participants, language rooms, translation cache)
- Live call state is never written to MySQL
- JWT stored in localStorage only (no cookies)
- No auto-admit — host approval is mandatory
- Magic link tokens are not marked used until the participant actually joins
- Scheduled meetings must be converted to live meetings before joining
- The AI pipeline package is not modified by feature work
