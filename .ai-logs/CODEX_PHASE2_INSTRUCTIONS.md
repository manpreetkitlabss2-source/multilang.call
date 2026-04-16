# CODEX_PHASE2_INSTRUCTIONS.md
**Project:** AI-Powered Multilingual Video Calling Web App — Phase 2
**Extends:** `./.ai-logs/CODEX_SYSTEM_INSTRUCTIONS.01.md` (read that file first — all rules from Phase 1 remain in force)
**Stack additions:** JWT (jsonwebtoken), bcryptjs, nanoid, date-fns, nodemailer (or Resend SDK)

---

## 0. Golden Rules for This Phase

* **Never break existing translation pipeline.** The STT → DeepL → Polly flow and all Socket.io audio events defined in Phase 1 are untouchable.
* **UI consistency is mandatory.** Every new button, input, card, and modal must use the same Tailwind tokens already in the codebase:
  * Colors: `bg-accent` (teal-700), `bg-ink` (dark navy), `bg-sky` (light blue), `bg-warm` (amber)
  * Border-radius: `rounded-2xl` for inputs/buttons, `rounded-[28px]`–`rounded-[40px]` for cards/panels
  * Shadow: `shadow-panel`
  * Button pattern — primary: `rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60`
  * Button pattern — danger: `rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white`
  * Button pattern — ghost: `rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-white`
  * Input pattern: `rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent`
  * Label/badge: `inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent`
* **Keep Zustand store boundaries.** Only UI-driven, per-session data in Zustand. Nothing persisted.
* **No new third-party auth providers** (no Auth0, no Clerk). Implement lightweight JWT-based auth in-house as described below.

---

## 1. Database Schema Extensions (Prisma — `packages/server/prisma/schema.prisma`)

Add the following models **alongside** the existing `Meeting` model. Do not alter the existing `Meeting` model fields — only add a relation field.

### 1.1 New models to add

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  displayName  String
  passwordHash String
  role         UserRole @default(PARTICIPANT)
  createdAt    DateTime @default(now())

  hostedMeetings   Meeting[]         @relation("HostedMeetings")
  magicLinks       MagicLink[]
  scheduledMeetings ScheduledMeeting[]
}

model MagicLink {
  id         String    @id @default(cuid())
  token      String    @unique   // nanoid(32) — URL-safe, 32 chars
  meetingId  String
  inviteeEmail String?           // null = open invite anyone who has the link
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime  @default(now())

  meeting    Meeting   @relation(fields: [meetingId], references: [id])
  createdBy  User      @relation(fields: [createdByUserId], references: [id])
  createdByUserId String
}

model ScheduledMeeting {
  id              String    @id @default(cuid())
  title           String
  scheduledAt     DateTime
  durationMinutes Int       @default(60)
  timezone        String    @default("UTC")
  hostId          String
  meetingId       String?   @unique  // set when the meeting is actually created
  shareToken      String    @unique  // nanoid(16) — short shareable slug
  createdAt       DateTime  @default(now())

  host    User     @relation(fields: [hostId], references: [id])
  meeting Meeting? @relation(fields: [meetingId], references: [id])
}

enum UserRole {
  HOST
  PARTICIPANT
}
```

### 1.2 Extend the existing `Meeting` model — add only these fields/relations

```prisma
// Inside the existing Meeting model, append:
hostUserId        String?
scheduledMeetingId String? @unique
admitList          String  @default("[]")  // JSON array of participantIds admitted by host

hostUser           User?             @relation("HostedMeetings", fields: [hostUserId], references: [id])
scheduledMeeting   ScheduledMeeting? @relation(fields: [scheduledMeetingId], references: [id])
magicLinks         MagicLink[]
```

### 1.3 Run migration after changes

```bash
npx prisma migrate dev --name phase2_auth_and_scheduling
npx prisma generate
```

---

## 2. Shared Types (`packages/shared`)

### 2.1 Add to `types.ts`

```typescript
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'HOST' | 'PARTICIPANT';
}

export interface JwtPayload {
  userId: string;
  email: string;
  displayName: string;
  role: 'HOST' | 'PARTICIPANT';
  iat?: number;
  exp?: number;
}

export interface MagicLinkRecord {
  id: string;
  token: string;
  meetingId: string;
  inviteeEmail?: string | null;
  expiresAt: string;
  usedAt?: string | null;
}

export interface ScheduledMeetingRecord {
  id: string;
  title: string;
  scheduledAt: string;       // ISO string
  durationMinutes: number;
  timezone: string;
  hostId: string;
  meetingId?: string | null;
  shareToken: string;
}

// Waiting room participant (pending host admission)
export interface WaitingParticipant {
  socketId: string;
  participantId: string;
  displayName: string;
  preferredLanguage: SupportedLanguageCode;
  requestedAt: number;       // Date.now() timestamp
}
```

### 2.2 Add to `events.ts`

```typescript
// Auth events
export const SOCKET_EVENTS = {
  ...existing_events,

  // Waiting room / host-admit
  PARTICIPANT_KNOCK:    'participant:knock',       // participant → server
  ADMIT_PARTICIPANT:    'host:admit',              // host → server
  DENY_PARTICIPANT:     'host:deny',               // host → server
  KNOCK_ACCEPTED:       'participant:knock_accepted', // server → participant
  KNOCK_DENIED:         'participant:knock_denied',   // server → participant
  WAITING_ROOM_UPDATE:  'host:waiting_room_update',   // server → host (list changed)
} as const;
```

---

## 3. Backend — Authentication (`packages/server`)

### 3.1 Install dependencies (run in `packages/server`)

```bash
npm install jsonwebtoken bcryptjs nanoid zod
npm install --save-dev @types/jsonwebtoken @types/bcryptjs
```

### 3.2 Environment variables — add to `packages/server/.env` and root `.env.example`

```
JWT_SECRET=change_this_to_a_long_random_string_min_32_chars
JWT_EXPIRES_IN=7d
MAGIC_LINK_EXPIRES_HOURS=48
BASE_URL=http://localhost:3000
```

### 3.3 Create `packages/server/src/services/authService.ts`

Implement the following functions — no skeletons, full working logic:

**`registerUser(email, displayName, password, role)`**
1. Hash password with `bcrypt.hash(password, 12)`.
2. Create `User` record via Prisma.
3. Return `AuthUser` (omit `passwordHash`).

**`loginUser(email, password)`**
1. Fetch user by email.
2. Compare with `bcrypt.compare`.
3. If valid, sign a JWT with `jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })`.
4. Return `{ user: AuthUser, token: string }`.

**`verifyToken(token)`**
1. Verify with `jwt.verify(token, JWT_SECRET)`.
2. Return decoded `JwtPayload` or throw.

### 3.4 Replace `packages/server/src/middleware/auth.ts`

The current stub just calls `next()`. Replace it with real middleware:

```typescript
// Full implementation logic:
// 1. Read Authorization header: "Bearer <token>"
// 2. If missing and route is public (/auth/* and /invite/*), call next()
// 3. Otherwise call verifyToken(); attach decoded payload to req.user
// 4. On failure respond 401 { error: 'Unauthorized' }
// Export: authMiddleware (Express middleware)
// Export: requireRole(role: UserRole) — middleware factory that checks req.user.role
```

### 3.5 Create `packages/server/src/routes/auth.ts`

Register these REST endpoints:

| Method | Path | Auth required | Description |
|--------|------|--------------|-------------|
| POST | `/auth/register` | No | Register new user. Body: `{ email, displayName, password, role? }`. Returns `{ user, token }`. |
| POST | `/auth/login` | No | Login. Body: `{ email, password }`. Returns `{ user, token }`. |
| GET | `/auth/me` | Yes | Returns `req.user` (from JWT). |

Validation with `zod`:
* `email` — valid email format
* `password` — min 8 chars
* `displayName` — min 2 chars, max 40 chars

### 3.6 Create `packages/server/src/routes/magicLinks.ts`

| Method | Path | Auth required | Description |
|--------|------|--------------|-------------|
| POST | `/meetings/:meetingId/magic-links` | Yes (HOST role) | Generate magic link(s). Body: `{ inviteeEmails?: string[], expiresHours?: number }`. Returns array of `{ token, url, inviteeEmail }`. |
| GET | `/invite/:token` | No | Validate token, return meeting info. Used by client before showing the Join page. |

**Magic link generation logic:**
1. Verify caller is the host of the meeting (`meeting.hostUserId === req.user.userId`).
2. For each `inviteeEmail` (or once if `inviteeEmails` is empty — open invite), generate `nanoid(32)` token.
3. Set `expiresAt = now + (expiresHours ?? MAGIC_LINK_EXPIRES_HOURS) hours`.
4. Persist `MagicLink` record.
5. Construct `url = ${BASE_URL}/join/${meetingId}?invite=${token}`.
6. Return URLs — do **not** send email in this phase; just return URLs (email integration is optional Phase 3).

**Token validation logic (`GET /invite/:token`):**
1. Find `MagicLink` where `token = :token`.
2. Check `expiresAt > now` and `usedAt == null`.
3. Return `{ valid: true, meetingId, inviteeEmail, meetingDefaultLanguage }` or `{ valid: false, reason }`.
4. Do **not** mark `usedAt` here — mark it when the participant actually joins the meeting (in the socket join handler).

### 3.7 Create `packages/server/src/routes/scheduling.ts`

| Method | Path | Auth required | Description |
|--------|------|--------------|-------------|
| POST | `/scheduled-meetings` | Yes (HOST role) | Create scheduled meeting. Body: `{ title, scheduledAt, durationMinutes?, timezone? }`. Auto-generates `shareToken` with `nanoid(16)`. Returns `ScheduledMeetingRecord`. |
| GET | `/scheduled-meetings` | Yes | List caller's scheduled meetings (as host). |
| GET | `/s/:shareToken` | No | Public lookup by share token. Returns meeting info + countdown. Used for pre-meeting landing page. |
| POST | `/scheduled-meetings/:id/start` | Yes (HOST role) | Converts scheduled meeting into a live `Meeting` record. Sets `scheduledMeeting.meetingId`. Returns `{ meetingId, joinUrl }`. |
| DELETE | `/scheduled-meetings/:id` | Yes (HOST role) | Cancel/delete. |

### 3.8 Register all new routes in `packages/server/src/index.ts`

```typescript
// Add after existing route registrations:
import { registerAuthRoutes } from './routes/auth.js';
import { registerMagicLinkRoutes } from './routes/magicLinks.js';
import { registerSchedulingRoutes } from './routes/scheduling.js';

registerAuthRoutes(app);
registerMagicLinkRoutes(app, meetingService);
registerSchedulingRoutes(app);

// Apply authMiddleware to all routes EXCEPT /auth/* and /invite/* and /s/*
// Use express.Router with selective middleware application.
```

---

## 4. Backend — Waiting Room & Host-Admit Handshake (`packages/server/src/socket`)

### 4.1 Extend `roomManager.ts` — add waiting room methods to the `RoomManager` interface and implementation

Redis key pattern: `meeting:{id}.waiting`  (Hash: socketId → JSON of `WaitingParticipant`)

Add to the interface and `createRoomManager()`:

**`addToWaiting(meetingId, participant: WaitingParticipant): Promise<WaitingParticipant[]>`**
— `hset` the waiting hash, return all current waiters.

**`removeFromWaiting(meetingId, socketId): Promise<WaitingParticipant[]>`**
— `hdel` from hash, return remaining waiters.

**`getWaitingParticipants(meetingId): Promise<WaitingParticipant[]>`**
— `hgetall` the waiting hash, parse and return array.

**`isHostOnline(meetingId): Promise<boolean>`**
— Check if any participant in the live participants hash has `participantId === meeting.hostUserId` (pass hostUserId as arg).

### 4.2 Extend `meetingHandlers.ts` — handshake flow

Replace the direct `MEETING_JOIN` admit logic with a two-step knock/admit flow:

**Step A — Participant knocks (`SOCKET_EVENTS.PARTICIPANT_KNOCK`)**

```
Payload: { meetingId, participantId, displayName, preferredLanguage, inviteToken? }
```

Logic:
1. Validate `meetingId` exists in DB.
2. If `inviteToken` provided: call magic link validation logic — if invalid, emit error to socket and return.
3. Build a `WaitingParticipant` object and call `roomManager.addToWaiting(meetingId, waiter)`.
4. Store `socket.data.meetingId = meetingId` and `socket.data.pending = true`.
5. Emit `SOCKET_EVENTS.WAITING_ROOM_UPDATE` with the updated waiting list to the host's socket room (`${meetingId}:host`).

**Step B — Host admits (`SOCKET_EVENTS.ADMIT_PARTICIPANT`)**

```
Payload: { meetingId, targetSocketId }
```

Logic:
1. Verify `socket.data.isHost === true`, else emit error.
2. Find the waiter in Redis by `targetSocketId`.
3. Call `roomManager.removeFromWaiting(meetingId, targetSocketId)`.
4. Call `roomManager.addParticipant(meetingId, participant)` (same logic as before).
5. Emit `SOCKET_EVENTS.KNOCK_ACCEPTED` directly to `targetSocketId`.
6. In the accepted participant's socket handler: join the meeting room, join the language room, mark invite token `usedAt` if applicable.
7. Broadcast updated `MEETING_STATE` to the full meeting room.
8. Emit updated `WAITING_ROOM_UPDATE` to the host.

**Step C — Host denies (`SOCKET_EVENTS.DENY_PARTICIPANT`)**

```
Payload: { meetingId, targetSocketId }
```

Logic:
1. Verify `socket.data.isHost === true`.
2. `roomManager.removeFromWaiting(meetingId, targetSocketId)`.
3. Emit `SOCKET_EVENTS.KNOCK_DENIED` to `targetSocketId`.
4. Emit updated `WAITING_ROOM_UPDATE` to the host.

**Host socket room setup**

When a user joins as the meeting host, in the `MEETING_JOIN` (or new equivalent) handler:
1. Check `meeting.hostUserId === socket.data.userId` (set by Socket.io auth middleware — see §4.3).
2. If host: `socket.join(`${meetingId}:host`)` and `socket.data.isHost = true`.
3. Skip the waiting room for the host — add them directly to live participants.

### 4.3 Socket.io authentication middleware (`packages/server/src/socket/index.ts`)

Add a Socket.io middleware before registering handlers:

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) {
    // Allow unauthenticated for now — participant will provide identity via knock payload
    // Set socket.data.userId = null
    return next();
  }
  try {
    const payload = verifyToken(token);
    socket.data.userId = payload.userId;
    socket.data.displayName = payload.displayName;
    socket.data.role = payload.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});
```

---

## 5. Frontend — Authentication (`packages/client`)

### 5.1 New Zustand store: `packages/client/src/store/authStore.ts`

```typescript
// State shape:
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
}
// Persist token in localStorage under key 'mlc_token'
// On store init, check localStorage and populate state if valid
// Use zustand/middleware persist with partialize to only persist { token }
```

### 5.2 New hook: `packages/client/src/hooks/useAuth.ts`

```typescript
// Exports:
// - useAuth() → { user, token, isLoading, login, register, logout }
// login(email, password): POST /auth/login → setAuth
// register(email, displayName, password, role): POST /auth/register → setAuth
// logout(): clearAuth, clear localStorage, navigate('/')
// On mount: if token in store, GET /auth/me to re-validate; on 401 clear token
```

### 5.3 New page: `packages/client/src/pages/AuthPage.tsx`

Single page with two tabs: **Sign in** and **Create account**.

UI requirements (match existing design language):
* Outer wrapper: `mx-auto flex min-h-screen max-w-md items-center px-6 py-12`
* Card: `w-full rounded-[36px] bg-white/90 p-8 shadow-panel`
* Tab switcher: two `button` elements side-by-side inside a `rounded-full bg-sky p-1` pill container. Active tab: `rounded-full bg-accent text-white px-5 py-2 text-sm font-semibold`. Inactive: `px-5 py-2 text-sm font-medium text-slate-600`.
* All inputs use the existing `rounded-2xl border border-teal-200 bg-white px-4 py-3` pattern.
* The "role" field on the register form is a `<select>` styled with the same input class, offering "Participant" and "Host".
* Submit button: existing primary button pattern (`bg-accent`).
* Error messages: `text-sm text-rose-600 mt-2`.

Route: `/auth` — add to `App.tsx`.

### 5.4 Protect routes in `App.tsx`

Create a `<ProtectedRoute>` wrapper component:
* If `authStore.token` is null, redirect to `/auth`.
* Apply to `/meet/:meetingId`.
* Home (`/`) and `/join/:meetingId` and `/auth` and `/s/:shareToken` are public.

### 5.5 Pass JWT to Socket.io

In `packages/client/src/hooks/useSocket.ts`, when creating the socket, pass auth token:

```typescript
const token = useAuthStore.getState().token;
const socket = io(SOCKET_URL, {
  auth: { token: token ?? '' },
  // ...existing options
});
```

---

## 6. Frontend — Waiting Room & Host-Admit UI

### 6.1 Participant waiting screen

When a participant's socket emits `PARTICIPANT_KNOCK`, show a waiting state inside `Meet.tsx`:

Add a `waitingForAdmission` boolean to `meetingStore` (set to `true` after knock emitted, `false` when `KNOCK_ACCEPTED` or `KNOCK_DENIED` is received).

If `waitingForAdmission === true`, render instead of the video grid:

```tsx
// UI design:
// Full-width card: rounded-[40px] bg-white/90 p-12 shadow-panel text-center
// Animated pulsing teal circle (CSS animation: ping) as visual indicator
// Heading: "Waiting for host to admit you" — text-2xl font-bold text-ink
// Subtext: "The host will let you in shortly" — text-sm text-slate-600
// Meeting ID badge: inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs... (existing badge style)
```

On `KNOCK_DENIED`: show an inline error card with message "The host has declined your request to join." and a "Back to home" button (existing danger/ghost style).

### 6.2 Host waiting room panel

In `Meet.tsx`, for the authenticated host, add a new sidebar section **above** the Participants panel.

Show only if `waitingParticipants.length > 0`.

```tsx
// Section card: rounded-3xl bg-white/90 p-5 shadow-panel
// Header row: "Waiting to join" h2 (text-lg font-semibold text-ink) + pulsing badge count
// For each waiter:
//   li: flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3
//     Left: displayName (text-sm font-semibold text-ink), preferredLanguage badge
//     Right: two buttons side by side —
//       Admit: rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white
//       Deny:  rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700
```

Add `waitingParticipants: WaitingParticipant[]` and `setWaitingParticipants` to `meetingStore`.

Listen for `SOCKET_EVENTS.WAITING_ROOM_UPDATE` in the Meet.tsx socket effect block (already set up) and call `setWaitingParticipants(payload.waitingParticipants)`.

On Admit button click: `socket.emit(SOCKET_EVENTS.ADMIT_PARTICIPANT, { meetingId, targetSocketId: waiter.socketId })`.
On Deny button click: `socket.emit(SOCKET_EVENTS.DENY_PARTICIPANT, { meetingId, targetSocketId: waiter.socketId })`.

---

## 7. Frontend — Magic Links UI

### 7.1 Magic link panel in `Meet.tsx` (host only)

Add a collapsible section in the sidebar for the host, below the waiting room panel:

```tsx
// Toggle button (collapsed by default): rounded-2xl bg-sky px-4 py-3 text-sm font-medium text-accent w-full text-left
// Label: "Invite participants" + chevron icon
// When expanded, show:
//   "Copy meeting link" button (copies window.location.href) — ghost button style
//   "Generate magic invite link" button — primary button style
//     On click: POST /meetings/:meetingId/magic-links → get URL → copy to clipboard + show "Copied!" toast
//   Optional email input (text-sm, existing input style) + "Send invite" — for named invites
// Toast: fixed bottom-right, rounded-2xl bg-ink text-white px-5 py-3 shadow-panel, auto-dismiss 3s
```

### 7.2 Invite token handling in `Join.tsx`

When the Join page loads, read `inviteToken` from URL search params (`?invite=`):

1. If present, `GET /invite/:token` to validate. Show loading state.
2. If invalid/expired: show error card — `rounded-[36px] bg-white/90 p-8 shadow-panel` with message and "Back to home" link.
3. If valid: pre-fill meeting info, hide the manual `meetingId` input (it's already in the URL), proceed normally.
4. Pass `inviteToken` in the `PARTICIPANT_KNOCK` socket event payload.

---

## 8. Frontend — Meeting Scheduling UI

### 8.1 New page: `packages/client/src/pages/SchedulePage.tsx`

Route: `/schedule` — add to `App.tsx`. Protected (host only — check `user.role === 'HOST'`, else redirect home).

Layout: same outer wrapper pattern as `Home.tsx` (`mx-auto max-w-5xl px-6 py-16`).

**Left column** — form card (`rounded-[40px] bg-white/90 p-8 shadow-panel`):
* `title` input — existing input style, label "Meeting title"
* `scheduledAt` — `<input type="datetime-local">` — same input style
* `durationMinutes` — `<input type="number" min="15" step="15">` — default 60
* `timezone` — `<select>` with common timezone options (UTC, IST, EST, PST, CET) — same input style
* Submit button — existing primary pattern — "Schedule meeting"
* On submit: `POST /scheduled-meetings`, then append result to the list.

**Right column** — list of scheduled meetings (fetched from `GET /scheduled-meetings` on mount):
* Each item: `rounded-[28px] bg-sky p-5` card
* Shows: title, formatted date/time, duration, share link (`${BASE_URL}/s/${shareToken}`)
* "Copy share link" button — `rounded-full bg-white px-4 py-2 text-xs font-semibold text-accent border border-teal-200`
* "Start now" button (only if `scheduledAt` is within 15 min of now OR in the past, and `meetingId` is null) — primary button style — calls `POST /scheduled-meetings/:id/start` → navigate to `/meet/:meetingId`
* "Open meeting room" link button if `meetingId` already set — navigate to `/meet/:meetingId`

### 8.2 New page: `packages/client/src/pages/ScheduleLanding.tsx`

Route: `/s/:shareToken` — public, no auth required.

Fetches `GET /s/:shareToken`. Shows:
* Meeting title, host display name, scheduled time (formatted in user's local timezone using `Intl.DateTimeFormat`)
* Countdown timer (days / hours / minutes / seconds) — React `useEffect` with 1-second interval
* "Join meeting" button — if `meetingId` exists (meeting has started), navigate to `/join/:meetingId`; else show "Meeting hasn't started yet — come back at [time]"
* Card: `mx-auto max-w-md rounded-[36px] bg-white/90 p-8 shadow-panel text-center`

### 8.3 Add navigation links to `Home.tsx`

In `Home.tsx`, below the "Create meeting" form panel, add a subtle nav row:

```tsx
<nav className="mt-6 flex gap-4 justify-center">
  <a href="/schedule" className="text-sm font-medium text-accent hover:underline">
    Schedule a meeting
  </a>
  <span className="text-slate-300">|</span>
  <a href="/auth" className="text-sm font-medium text-accent hover:underline">
    Sign in / Register
  </a>
</nav>
```

---

## 9. Shared Package — Update `packages/shared/types.ts` Exports

Ensure all new types from §2.1 are exported from the package's `index.ts` so both `packages/client` and `packages/server` can import them.

---

## 10. Feature Implementation Order (for Codex to follow)

Implement in exactly this sequence to avoid dependency issues:

1. **Database** — Apply Prisma schema additions (§1). Run migration.
2. **Shared types** — Add all types and socket events (§2).
3. **Auth service + middleware** — `authService.ts` and updated `auth.ts` middleware (§3.3–3.4).
4. **Auth routes** — `/auth/register`, `/auth/login`, `/auth/me` (§3.5).
5. **Magic link routes** — `magicLinks.ts` (§3.6).
6. **Scheduling routes** — `scheduling.ts` (§3.7).
7. **Register all routes in server index** (§3.8).
8. **Waiting room in RoomManager** — Redis methods (§4.1).
9. **Socket handshake flow** — knock/admit/deny handlers (§4.2–4.3).
10. **Client auth store + hook** — `authStore.ts` and `useAuth.ts` (§5.1–5.2).
11. **AuthPage** — `/auth` route (§5.3).
12. **Route protection** — `ProtectedRoute`, update `App.tsx` (§5.4–5.5).
13. **Waiting room UI** — participant waiting screen + host admit panel in `Meet.tsx` (§6).
14. **Magic links UI** — host invite panel + `Join.tsx` token handling (§7).
15. **Schedule page** — `SchedulePage.tsx` + `ScheduleLanding.tsx` + nav links (§8–8.3).

---

## 11. What NOT to Do

* Do **not** add video track mute controls — that is Phase 1 scope and already handled.
* Do **not** add billing, subscription tiers, or payment UI.
* Do **not** replace Zustand with Context API or Redux.
* Do **not** install Tailwind plugins or change `tailwind.config.js` — use only existing tokens.
* Do **not** change the AI pipeline package (`packages/ai-pipeline`) — it is out of scope for this phase.
* Do **not** add email-sending logic without a dedicated adapter in `packages/server/src/services/emailService.ts` — keep it optional and behind a feature flag env var `ENABLE_EMAIL_INVITES=false`.
* Do **not** store JWT in cookies — use `localStorage` as defined in §5.1.
* Do **not** auto-admit participants without host interaction — the waiting room step is mandatory.
