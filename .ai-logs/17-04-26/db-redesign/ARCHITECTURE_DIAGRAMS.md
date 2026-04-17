# Architecture & Flow Diagrams
## Redesigned Participant Join System

---

## 1. NEW DATABASE SCHEMA (Entity Relationship Diagram)

```
┌─────────────────────────────────────────────────────────────┐
│                      USER MANAGEMENT                         │
└─────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │      User        │
    ├──────────────────┤
    │ id (PK)          │
    │ email (UNIQUE)   │
    │ displayName      │
    │ passwordHash     │
    │ createdAt        │
    │ updatedAt        │
    └────┬─────────────┘
         │
         │ 1:N
         │
         ├─────→ [HostedMeetings]     (User hosts meetings)
         ├─────→ [MeetingParticipants] (User joins meetings)
         ├─────→ [MagicLinks]         (User created invites)
         └─────→ [ScheduledMeetings]  (User scheduled meetings)


┌─────────────────────────────────────────────────────────────┐
│                    MEETING MANAGEMENT                        │
└─────────────────────────────────────────────────────────────┘

    ┌──────────────────────────┐
    │      Meeting             │
    ├──────────────────────────┤
    │ id (PK)                  │
    │ hostId (FK → User)       │
    │ defaultLanguage          │
    │ status                   │ ←─ ACTIVE | ENDED | ARCHIVED
    │ createdAt                │
    │ updatedAt                │
    │ endedAt (nullable)       │ ←─ When host ends meeting
    │ expiresAt (nullable)     │ ←─ Auto-delete after 30d
    │ scheduledMeetingId (FK)  │
    └────┬──────────────────────┘
         │
         │ 1:N (CASCADE delete)
         │
         ├─────→ [MeetingParticipant]  ← THE KEY NEW TABLE
         │          │ ├─ participantId ✓
         │          │ ├─ role (HOST/PARTICIPANT) ✓ PER-MEETING
         │          │ ├─ preferredLanguage
         │          │ ├─ joinedAt
         │          │ └─ leftAt
         │          │
         │          └─→ [ParticipantLog] (audit trail)
         │                 │ ├─ eventType
         │                 │ ├─ metadata
         │                 │ └─ createdAt (TTL: 90 days)
         │
         ├─────→ [MagicLink]
         │          │ ├─ token (UNIQUE)
         │          │ ├─ inviteeEmail (nullable)
         │          │ ├─ expiresAt
         │          │ ├─ usedAt (nullable)
         │          │ ├─ usedByUserId (nullable) ← NEW
         │          │ └─ createdByUserId
         │
         └─────→ [ScheduledMeeting]
              │
              └─→ Links back to Meeting when scheduled time comes


┌─────────────────────────────────────────────────────────────┐
│                  MEETING PARTICIPANT ROLES                   │
└─────────────────────────────────────────────────────────────┘

OLD MODEL (❌ Inflexible):
┌─────────────┐
│ User.role   │  = HOST or PARTICIPANT  (fixed at registration)
└─────────────┘
    │
    └─→ User ALWAYS HOST or ALWAYS PARTICIPANT
    └─→ Cannot host one meeting and join another as participant


NEW MODEL (✓ Flexible):
┌───────────────────────────────┐
│ MeetingParticipant.role       │ = HOST, PARTICIPANT, or CO_HOST
├───────────────────────────────┤
│ Unique per (Meeting, User)    │
│ Can change role across meetings
└───────────────────────────────┘
    │
    └─→ Alice hosts Meeting-1 (role = HOST)
    └─→ Alice joins Meeting-2 as PARTICIPANT (role = PARTICIPANT)
    └─→ Bob joins Meeting-1 as PARTICIPANT (role = PARTICIPANT)
    └─→ Host can admit/deny Bob independently

```

---

## 2. PARTICIPANT JOIN FLOW (Fixed)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PARTICIPANT JOIN FLOW (FIXED)                     │
└──────────────────────────────────────────────────────────────────────┘


SCENARIO A: AUTHENTICATED HOST JOINING THEIR OWN MEETING
═════════════════════════════════════════════════════════

    CLIENT                          SERVER                      DATABASE
    ├─ User logs in                                       
    │  ├─ POST /auth/login
    │  ├─ ← token (JWT)
    │  └─ Store in localStorage
    │
    ├─ Navigate to /meet/:meetingId
    │  ├─ Socket connects
    │  │  └─ Sends: auth: { token: "eyJa..." }
    │  │
    │  └─ Socket.on('connect') ✓
    │     └─ authMiddleware.verify(token)
    │        ├─ Decode JWT
    │        └─ socket.data.userId = "user-123" ✓
    │
    ├─ socket.emit(MEETING_JOIN, {           server.on(MEETING_JOIN)
    │    meetingId: "m-456",                    ├─ Get meeting
    │    participantId: "user-123", ─────────→ │  └─ Check: hostId = "user-123" ✓
    │    displayName: "Alice",                  │
    │    preferredLanguage: "en"                ├─ Validate: socket.data.userId = "user-123"
    │  })                                       │     ✓ Matches hostId ✓
    │                                           │
    │                                           ├─ socket.join("m-456")
    │                                           ├─ socket.join("m-456:host")
    │                                           ├─ socket.join("m-456:en")
    │                                           │
    │                                           ├─ roomManager.addParticipant(...)
    │                                           │
    │                                           ├─ meetingService.addParticipantToMeeting(
    │                                           │    meetingId, userId, "HOST")  ──────────→ Create
    │                                           │                                    MeetingParticipant
    │  ← socket.emit(HOST_JOIN_SUCCESS)◄────── ├─ socket.emit(HOST_JOIN_SUCCESS)
    │      { meetingId: "m-456" }               │
    │                                           └─ io.to("m-456")
    │  Meeting video grid renders               emit(MEETING_STATE, {...})
    │  ✓ Can see waiting room
    │  ✓ Can admit/deny participants
    │

SCENARIO B: UNAUTHENTICATED PARTICIPANT USING INVITE
════════════════════════════════════════════════════════

    CLIENT                          SERVER                      DATABASE
    ├─ Open: /join/:meetingId?invite=TOKEN
    │  ├─ NO auth token
    │  │
    │  └─ socket.emit(PARTICIPANT_KNOCK, {
    │     meetingId: "m-456",
    │     participantId: "guest-789",    ────→  server.on(PARTICIPANT_KNOCK)
    │     displayName: "Bob",                    ├─ Get meeting ✓
    │     preferredLanguage: "hi",              │
    │     inviteToken: "TOKEN"                  ├─ Validate inviteToken
    │   })                                       │  └─ Check expiry + meetingId ✓
    │                                           │
    │  socket.data.userId = undefined            ├─ Create WaitingParticipant
    │  (no auth, so can't join directly)         │
    │                                           ├─ roomManager.addToWaiting(...)
    │  Display: "Waiting for host..."            │
    │                                           ├─ io.to("m-456:host")
    │                                           │  emit(WAITING_ROOM_UPDATE, {...})
    │  [Waiting screen shows]                    │
    │   ├─ Name: Bob                             └─ No DB record yet
    │   ├─ Language: Hindi                        (pending admission)
    │   └─ Spinner animation
    │
    │  ↓ HOST REVIEWS & ADMITS BOB
    │
    │                                       server.on(ADMIT_PARTICIPANT)
    │  Waiting screen disappears            ├─ Validate: socket.isHost ✓
    │                                        ├─ targetSocket.join("m-456")
    │  ← socket.emit(KNOCK_ACCEPTED)◄────── ├─ roomManager.addParticipant(...)
    │                                        │
    │  Video grid renders                    ├─ meetingService.addParticipantToMeeting(
    │  ✓ Can see host + other participants  │    meetingId, userId, "PARTICIPANT") ───→ Create
    │                                        │                                   MeetingParticipant
    │                                        ├─ meetingService.markMagicLinkUsed(TOKEN)
    │                                        │
    │                                        ├─ Emit MEETING_STATE
    │                                        └─ Emit WAITING_ROOM_UPDATE


SCENARIO C: BUG - HOST TRIES TO JOIN WITHOUT TOKEN (OLD CODE)
══════════════════════════════════════════════════════════════

    CLIENT                          SERVER (BROKEN)           DATABASE
    ├─ No token provided
    │
    ├─ socket.emit(MEETING_JOIN, {...})
    │                               ──────→ authMiddleware:
    │                                      socket.data.userId = undefined ✗
    │
    │                                      server.on(MEETING_JOIN)
    │  STUCK: No response!                  ├─ Check: hostId === socket.data.userId
    │  No error message shown               │        vs  "m-host" === undefined ✗
    │                                       │
    │  User confused ❌                     ├─ SILENTLY FAILS
    │  No clear error ❌                    │  (socket.emit error not caught)
    │  Retry doesn't help ❌                │
    │                                       └─ Never joins


OLD CODE (meetingHandlers.ts:57):
    const isHost = meeting.hostUserId === socket.data.userId;
    if (!isHost) {
      socket.emit("error", {...});  ← Error emitted but might not be received
      return;
    }

NEW CODE (Fixed):
    const userId = socket.data.userId;
    
    if (userId && userId === meeting.hostId) {
      // Proceed to join ✓
    } else if (userId && userId !== meeting.hostId) {
      // Explicit error: "You are not the host"
      socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, {...});  ← CLEAR ERROR
    } else {
      // No auth: redirect to login
      socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, {
        message: "Authentication required",
        code: "AUTH_REQUIRED"
      });  ← ACTIONABLE ERROR
    }
```

---

## 3. SOCKET EVENT SEQUENCE (UML Sequence Diagram)

```
┌─ HOST JOINING MEETING ─────────────────────────────────────────────┐
│                                                                      │
│  HOST CLIENT        Socket.io            SERVER             Database│
│     │                                        │                    │ │
│     │  1. Connect with auth token            │                    │ │
│     │─────────────────────────────────────→ │                    │ │
│     │                                    authMiddleware          │ │
│     │                                        │ verify JWT        │ │
│     │     ✓ socket.data.userId = "h1"       │                    │ │
│     │←───────────────────────────────────────│                    │ │
│     │                                        │                    │ │
│     │  2. socket.emit(MEETING_JOIN)          │                    │ │
│     │─────────────────────────────────────→ │                    │ │
│     │    { meetingId, participantId, ... }  │ getMeeting()        │ │
│     │                                        │────────────────────→│ │
│     │                                        │←───────────────────│ │
│     │                                        │ Validate: h1===hostId ✓
│     │                                        │                    │ │
│     │                                        │ addParticipant()    │ │
│     │                                        │                    │ │
│     │                                        │ MeetingParticipant.create()
│     │                                        │────────────────────→│ │
│     │                                        │←───────────────────│ │
│     │                                        │                    │ │
│     │  3. socket.emit(HOST_JOIN_SUCCESS)    │                    │ │
│     │←───────────────────────────────────────│                    │ │
│     │                                        │ Broadcast:         │ │
│     │                                        │ io.to("meeting-1") │ │
│     │                                        │   .emit(MEETING_STATE)
│     │   setAdmittedToMeeting(true)           │                    │ │
│     │   renderVideoGrid()                    │                    │ │
│     │                                        │                    │ │
└────────────────────────────────────────────────────────────────────┘


┌─ PARTICIPANT JOINING (KNOCK → WAIT → ADMIT) ───────────────────────┐
│                                                                      │
│  PARTICIPANT        Socket.io               HOST           SERVER   │
│  CLIENT (P1)                              CLIENT                    │
│     │                                        │            │        │
│     │  1. socket.emit(PARTICIPANT_KNOCK)     │            │        │
│     │────────────────────────────────────────────────────→│        │
│     │    { meetingId, participantId, ... }                │        │
│     │                                                      │        │
│     │    socket.data.pending = true                       │        │
│     │                                        ← WAITING_ROOM_UPDATE  │
│     │                                        │ emit to host         │
│     │   Display "Waiting..." screen          │←───────────│        │
│     │                                        │            │        │
│     │                                        │  setWaitingParticipants([P1])
│     │                                        │  Show: "P1 is waiting"
│     │                                        │  [Admit] [Deny] buttons
│     │                                        │            │        │
│     │                                        │  (Host clicks ADMIT)│
│     │                                        │─────────────→│      │
│     │                                               │ emit ADMIT_PARTICIPANT
│     │                                               │──────────────→│
│     │                                               │      │        │
│     │                                               │      │ P1 joins rooms
│     │                                               │      │ roomManager.add()
│     │                                               │      │ MeetingParticipant.create()
│     │                                               │      │        │
│     │  2. socket.emit(KNOCK_ACCEPTED)◄──────────────────────────  │
│     │                                               │      │        │
│     │   socket.data.pending = false                │      │        │
│     │   Display video grid                         │      │        │
│     │                                        ← MEETING_STATE       │
│     │                                        broadcast to all      │
│     │   Participants: [Host, P1]             │      │        │
│     │                                        │      │        │
└────────────────────────────────────────────────────────────────────┘


┌─ MAGIC LINK INVITE FLOW ─────────────────────────────────────────────┐
│                                                                        │
│  HOST               CLIENT           SERVER         Database          │
│   │                                    │                │            │
│   │  Clicks "Generate Invite"          │                │            │
│   ├─────────────────────────────────→ │                │            │
│   │                          POST /magic-links           │            │
│   │                                    │ Create token   │            │
│   │                                    │────────────────→            │
│   │                                    │←────────────────            │
│   │←──────────────────────────────────│                │            │
│   │  URL: /join/m-1?invite=abc123     │                │            │
│   │                                    │                │            │
│   │  Shares with PARTICIPANT           │                │            │
│   │                                    │                │            │
│   │                          ↓         │                │            │
│   │                                    │                │            │
│   │ PARTICIPANT opens URL              │                │            │
│   ├──────────────────────────────────→ │ GET /invite/abc123         │
│   │                                    │────────────────→ Query      │
│   │                                    │←──────────────── MagicLink  │
│   │                                    │ ✓ Valid, not expired       │
│   │←──────────────────────────────────│                │            │
│   │  Invite valid, show form           │                │            │
│   │                                    │                │            │
│   │ [Enter meeting]                    │                │            │
│   ├─────────────────────────────────→ │                │            │
│   │ socket.emit(PARTICIPANT_KNOCK)    │ inviteToken    │            │
│   │  + inviteToken: "abc123"           │ = "abc123"     │            │
│   │                                    │ ✓ Validate     │            │
│   │                                    │ ✓ Check expiry │            │
│   │                                    │                │            │
│   │ (Then same flow as SCENARIO B)    │                │            │
│   │                                    │                │            │
│   │ [Host admits]                      │                │            │
│   │                                    │ markMagicLinkUsed()        │
│   │                                    │────────────────→ usedAt=NOW │
│   │                                    │ usedByUserId="p-2"         │
│   │                                    │←──────────────── ✓          │
│   │                                    │                │            │
│   │ [Participant now in meeting]       │                │            │
│   │                                    │                │            │
└────────────────────────────────────────────────────────────────────────┘

```

---

## 4. DATA CLEANUP LIFECYCLE

```
┌─────────────────────────────────────────────────────────────────────┐
│               MEETING & DATA CLEANUP LIFECYCLE                       │
└─────────────────────────────────────────────────────────────────────┘


IMMEDIATE (When host ends meeting)
═════════════════════════════════════

    Host clicks "End meeting"
         │
         ├─ socket.emit(END_MEETING)
         │        │
         │        └─→ Server:
         │            ├─ Meeting.update({ status: 'ENDED', endedAt: now })
         │            └─ expiresAt = now + 30 days ← Marked for deletion
         │
         └─ All participants disconnected
            ├─ socket.disconnect() for each participant
            ├─ roomManager.removeParticipant(...) ← Clear from memory
            └─ ParticipantLog recorded ✓ (kept for 90 days)


SHORT TERM (1-30 days)
═════════════════════════════════════

    Meeting status: ENDED
    MeetingParticipant: Records remain (history)
    MagicLinks: Deleted if expired AND already used
    ParticipantLogs: All preserved


LONG TERM (30+ days)
═════════════════════════════════════

    Cleanup Job runs DAILY at 2 AM UTC
    (CloudTask / Cron / Lambda)
         │
         ├─ DELETE ParticipantLog WHERE createdAt < NOW - 90 days
         │       ✓ Keeps audit trail for reasonable time
         │       ✓ Complies with privacy (auto-forget)
         │       └─ Prevents database bloat
         │
         ├─ DELETE MagicLink WHERE:
         │       ├─ expiresAt < NOW AND
         │       └─ usedAt IS NOT NULL
         │       ✓ Removes used-up invite links
         │
         ├─ UPDATE Meeting SET status='ARCHIVED' WHERE:
         │       ├─ status = 'ENDED' AND
         │       └─ endedAt < NOW - 30 days
         │       ✓ Archives old meetings
         │
         └─ DELETE MeetingParticipant WHERE:
                 └─ meeting.status = 'ARCHIVED'
                 ✓ Removes participant records after 30 days
                 ✓ Can still query from logs for history


ARCHIVE LAYER (Optional, for compliance)
═════════════════════════════════════════════════════════════

    Before deletion, export to:
    ├─ JSON backups (for audit)
    ├─ S3 cold storage (for compliance)
    └─ Analytics warehouse (for metrics)


┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE SIZE PROJECTION                         │
└─────────────────────────────────────────────────────────────────────┘

    Assuming:
    - 100 meetings/day
    - 5 participants/meeting
    - 20 logs/participant

    Per day: 100 × 5 × 20 = 10,000 log entries

    WITHOUT CLEANUP:
    ├─ 30 days: 300,000 rows
    ├─ 1 year:  3,650,000 rows
    ├─ DB size: 500+ MB (bloat)
    └─ Query time: SLOW

    WITH CLEANUP (90-day TTL):
    ├─ 90 days max: 900,000 rows (bounded)
    ├─ DB size: ~150 MB (stable)
    └─ Query time: FAST
```

---

## 5. ERROR HANDLING TREE

```
┌──────────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING & USER FLOWS                       │
└──────────────────────────────────────────────────────────────────────┘


User wants to JOIN MEETING
└─ Is user authenticated?
   │
   ├─ YES: Is user the meeting host?
   │   │
   │   ├─ YES:
   │   │   ├─ socket.emit(MEETING_JOIN) with token
   │   │   └─ Server validates:
   │   │       ├─ ✓ Meeting exists? → Proceed
   │   │       │   └─ socket.data.userId === meeting.hostId ✓
   │   │       │       └─ socket.join rooms
   │   │       │           └─ emit HOST_JOIN_SUCCESS ✓
   │   │       │
   │   │       ├─ ✗ Meeting doesn't exist?
   │   │       │   └─ emit HOST_JOIN_ERROR { code: MEETING_NOT_FOUND }
   │   │       │       → User redirected to home
   │   │       │
   │   │       └─ ✗ User is not host?
   │   │           └─ emit HOST_JOIN_ERROR { code: NOT_HOST }
   │   │               → Suggest to use participant flow
   │   │
   │   └─ NO (authenticated but not host):
   │       ├─ Option 1: Has magic invite link?
   │       │   │
   │       │   ├─ YES (invite=token in URL):
   │       │   │   └─ GET /invite/:token
   │       │   │       ├─ ✓ Valid?
   │       │   │       │   └─ socket.emit(PARTICIPANT_KNOCK)
   │       │   │       │       └─ Added to waiting room
   │       │   │       │
   │       │   │       └─ ✗ Invalid/expired?
   │       │   │           └─ Display error card
   │       │   │               "Invite is not valid"
   │       │   │
   │       │   └─ NO invite link:
   │       │       └─ socket.emit(PARTICIPANT_KNOCK)
   │       │           ├─ No token validation needed
   │       │           └─ Added to waiting room
   │       │
   │       └─ Host admits participant?
   │           │
   │           ├─ ✓ YES:
   │           │   ├─ socket.join(meetingId)
   │           │   ├─ emit KNOCK_ACCEPTED ✓
   │           │   └─ Participant joins meeting
   │           │
   │           └─ ✗ NO (denied):
   │               ├─ emit KNOCK_DENIED
   │               └─ Show: "Host declined your request"
   │
   │
   └─ NO: User not authenticated
       │
       ├─ Has magic invite link?
       │   │
       │   ├─ YES:
       │   │   └─ GET /invite/:token
       │   │       ├─ ✓ Valid?
       │   │       │   └─ socket.emit(PARTICIPANT_KNOCK)
       │   │       │       └─ Added to waiting room ✓
       │   │       │
       │   │       └─ ✗ Invalid/expired?
       │   │           └─ Display error
       │   │               "Invite expired or invalid"
       │   │
       │   └─ NO:
       │       └─ Open /join/:meetingId without token
       │           └─ socket.emit(PARTICIPANT_KNOCK)
       │               └─ Added to waiting room ✓
       │
       └─ [For future: Add auth option]
           ├─ "Sign in with existing account"
           └─ "Continue as guest"


┌──────────────────────────────────────────────────────────────────────┐
│                    ERROR STATES & RECOVERY                          │
└──────────────────────────────────────────────────────────────────────┘

SCENARIO: Participant stuck in waiting room

    Problem: Participant doesn't see "Admit" button after host joins
    
    Root causes:
    ├─ Socket disconnect/reconnect (race condition)
    ├─ Host refresh (lost waiting room state)
    ├─ Network latency (messages out of order)
    
    Solutions:
    ├─ Client: Re-emit WAITING_ROOM_UPDATE on socket reconnect
    ├─ Server: Send waiting room state on MEETING_JOIN
    └─ UI: Show "Retrying..." if waiting list empty


SCENARIO: Participant can't see video after admitted

    Problem: MEETING_STATE event not received
    
    Root causes:
    ├─ Socket rooms not joined properly
    ├─ Event not emitted by server
    ├─ Client not listening
    
    Solutions:
    ├─ Server: Always emit MEETING_STATE after KNOCK_ACCEPTED
    ├─ Client: Listen for MEETING_STATE regardless of join order
    └─ Fallback: Request state explicitly


SCENARIO: Host admits participant, but participant stuck

    Problem: socket.join(meetingId) failed on server
    
    Root causes:
    ├─ targetSocket.io disconnected
    ├─ roomManager.addParticipant threw error
    ├─ Database transaction failed
    
    Solutions:
    ├─ Server: Check if targetSocket.connected before join
    ├─ Server: Wrap in try-catch, emit error to host
    └─ Client: Show error: "Failed to admit, try again"

```

---

## 6. ROLE MODEL COMPARISON

```
┌──────────────────────────────────────────────────────────────────────┐
│              OLD VS NEW ROLE ASSIGNMENT MODEL                       │
└──────────────────────────────────────────────────────────────────────┘


OLD MODEL (Before Redesign)
════════════════════════════════════════════════════════════════════════

    User table has role: HOST or PARTICIPANT (immutable)
    
    ┌──────────────┐
    │ User         │
    ├──────────────┤
    │ id: "alice"  │
    │ role: HOST   │  ← FIXED at registration
    └──────────────┘
    
    Constraints:
    ├─ Alice is always HOST
    ├─ Alice cannot join another meeting as PARTICIPANT
    ├─ Every meeting needs a HOST user
    └─ Cannot support flexible permission model
    
    Problems:
    ├─ ❌ "Alice hosts Meeting-1, joins Meeting-2 as participant"
    │      → Violates current model
    ├─ ❌ "Bob is PARTICIPANT, but wants to host a meeting"
    │      → Need to create separate HOST account
    └─ ❌ "Grant Maria co-host permissions for meeting"
         → No place to store per-meeting permissions


NEW MODEL (After Redesign)
════════════════════════════════════════════════════════════════════════

    User table has NO role
    MeetingParticipant table has per-meeting role
    
    ┌──────────────┐                ┌────────────────────────────┐
    │ User         │                │ MeetingParticipant         │
    ├──────────────┤                ├────────────────────────────┤
    │ id: "alice"  │                │ meetingId: "m-1"           │
    │ email: ...   │  ──(many)──→  │ userId: "alice"            │
    │ (no role)    │                │ role: HOST                 │
    └──────────────┘                │                            │
                                    └────────────────────────────┘
                                    
                                    ┌────────────────────────────┐
                                    │ MeetingParticipant         │
                                    ├────────────────────────────┤
                                    │ meetingId: "m-2"           │
                                    │ userId: "alice"            │
                                    │ role: PARTICIPANT          │
                                    └────────────────────────────┘
    
    Benefits:
    ✓ Alice can host M-1 and join M-2 as participant
    ✓ Bob (no HOST designation) can host Meeting-3
    ✓ Maria can be PARTICIPANT in M-1, but co-host in M-2
    ✓ Roles are per-meeting context
    ✓ Supports future: dynamic permissions updates
    ✓ Scalable: add more role types (SPEAKER, MODERATOR, etc.)


EXAMPLE SCENARIO
════════════════════════════════════════════════════════════════════════

    User: Alice { id: "alice" }
    User: Bob { id: "bob" }
    User: Carol { id: "carol" }
    
    Meeting-1: Tech Standup
    ├─ MeetingParticipant { meetingId: "m-1", userId: "alice", role: HOST }
    ├─ MeetingParticipant { meetingId: "m-1", userId: "bob", role: PARTICIPANT }
    └─ MeetingParticipant { meetingId: "m-1", userId: "carol", role: CO_HOST }
    
    Meeting-2: Client Call
    ├─ MeetingParticipant { meetingId: "m-2", userId: "bob", role: HOST }
    └─ MeetingParticipant { meetingId: "m-2", userId: "alice", role: PARTICIPANT }
    
    Meeting-3: Training Session
    ├─ MeetingParticipant { meetingId: "m-3", userId: "carol", role: HOST }
    └─ MeetingParticipant { meetingId: "m-3", userId: "bob", role: PARTICIPANT }
    
    
    ANALYSIS:
    ├─ Alice: HOST in M-1, PARTICIPANT in M-2
    ├─ Bob: PARTICIPANT in M-1, HOST in M-2, PARTICIPANT in M-3
    ├─ Carol: CO_HOST in M-1, HOST in M-3
    │
    └─ Result: ✓ Perfect flexibility!
               ✓ Any user can host any meeting
               ✓ Roles are context-dependent
               ✓ Scalable for future features

```

---

## 7. MIGRATION PATH

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DATABASE MIGRATION STRATEGY                       │
└──────────────────────────────────────────────────────────────────────┘


PHASE 0: Pre-Migration Validation
══════════════════════════════════════════════════════════════════════

    ├─ Backup production database
    ├─ Backup code
    ├─ Stop accepting new meetings (optional)
    └─ Run on STAGING first


PHASE 1: Schema Changes
══════════════════════════════════════════════════════════════════════

    npx prisma migrate dev --name scalable_participant_roles
    
    Creates:
    ├─ CREATE TABLE MeetingParticipant (new)
    ├─ CREATE TABLE ParticipantLog (renamed + extended)
    ├─ ALTER TABLE Meeting (add: status, endedAt, expiresAt)
    ├─ ALTER TABLE MagicLink (add: usedByUserId)
    ├─ ALTER TABLE ScheduledMeeting (add: status, cancelledAt)
    └─ Indexes for cleanup queries


PHASE 2: Data Migration
══════════════════════════════════════════════════════════════════════

    Script: migrate_data.ts
    
    FOR EACH existing Meeting:
    ├─ IF meeting.hostUserId exists:
    │   └─ CREATE MeetingParticipant {
    │       meetingId: meeting.id,
    │       userId: meeting.hostUserId,
    │       role: 'HOST',
    │       joinedAt: meeting.createdAt
    │     }
    ├─ IF meeting.ParticipantLogs exist:
    │   └─ Rename table references
    └─ Validate: count(MeetingParticipant) == count(hosts)


PHASE 3: Code Deployment
══════════════════════════════════════════════════════════════════════

    Deploy updated backend:
    ├─ New socket handlers (MEETING_JOIN fix)
    ├─ New auth middleware
    ├─ New service methods
    ├─ Cleanup job service
    └─ Error event handlers
    
    Deploy updated frontend:
    ├─ Updated meetingStore
    ├─ Error handling in Meet.tsx
    ├─ Updated socket listeners
    └─ Clear browser cache


PHASE 4: Validation & Monitoring
══════════════════════════════════════════════════════════════════════

    ├─ Test scenarios (see Testing section)
    ├─ Monitor logs for errors
    ├─ Check database integrity
    ├─ Verify cleanup job runs
    └─ Performance test with 50+ participants


PHASE 5: Rollback Plan (if needed)
══════════════════════════════════════════════════════════════════════

    IF issues detected:
    ├─ Stop accepting new meetings
    ├─ Revert code: git revert <commit>
    ├─ Rollback database: npx prisma migrate resolve --rolled-back
    ├─ Restore from backup if needed
    └─ Investigate root cause


Timeline:
═════════════════════════════════════════════════════════════════════

    Day 1: Staging migration + testing
    Day 2: Code review + final testing
    Day 3: Production backup + Phase 1-2
    Day 4: Phase 3 deployment (low-traffic window, e.g., 2 AM)
    Day 5: Validation + monitoring
    Day 6-7: Monitor for issues, continue normal ops

```

---

**End of Architecture & Flow Diagrams**

*Use these diagrams alongside IMPLEMENTATION_GUIDE.md for complete understanding of the redesigned system.*
