# Comprehensive Implementation Guide
## AI-Powered Multilingual Video Calling Platform

**Date:** April 17, 2026  
**Status:** Complete Code Review + Design Recommendations  
**Phase:** Database Redesign + Bug Fix + Feature Enhancement

---

## TABLE OF CONTENTS

1. [Code Review Summary](#1-code-review-summary)
2. [Critical Issues Identified](#2-critical-issues-identified)
3. [Database Redesign Strategy](#3-database-redesign-strategy)
4. [Participant Join Bug Root Cause](#4-participant-join-bug-root-cause)
5. [Step-by-Step Implementation](#5-step-by-step-implementation)
6. [Testing & Validation](#6-testing--validation)
7. [Deployment Checklist](#7-deployment-checklist)

---

## 1. CODE REVIEW SUMMARY

### Project Structure
- **Monorepo:** Turborepo-based (3 packages + shared)
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express + Socket.io + Prisma ORM
- **Database:** MySQL
- **AI Pipeline:** STT (Deepgram) → Translation (DeepL) → TTS (Amazon Polly)
- **Auth:** JWT-based (Phase 2 implementation in progress)

### Key Findings

#### ✅ STRENGTHS
1. **Clean architecture separation** between client, server, AI pipeline, and shared types
2. **Well-structured Socket.io handlers** for real-time communication
3. **Proper Zustand store usage** for client-side state management
4. **Good TypeScript coverage** across the stack
5. **Tailwind consistency** in UI components
6. **Magic link system** implemented for invite functionality
7. **Waiting room pattern** correctly defined with knock/admit/deny flow

#### ⚠️ WEAKNESSES
1. **Role definition flaw:** `UserRole` stored only in `User` table, not in meeting context
   - Cannot support: "Any user can host a meeting" + roles defined per-meeting
   - Current design: Role is fixed at user registration time (HOST vs PARTICIPANT)
   
2. **No participant role tracking per meeting:**
   - Only `Meeting.hostUserId` exists
   - No `MeetingParticipant` junction table to track individual roles per meeting
   
3. **Participant data cleanup missing:**
   - `ParticipantLogs` table has no TTL/archival mechanism
   - No automated data deletion after meeting ends
   
4. **Meeting cleanup incomplete:**
   - No scheduled cleanup job for inactive meetings
   - No cascade deletion for related records (magic links, participant logs)
   
5. **Join flow authorization issue:**
   - `MEETING_JOIN` event only validates `meeting.hostUserId === socket.data.userId`
   - Regular participants using `PARTICIPANT_KNOCK` → waiting room → admit pattern
   - But if auth token is missing/invalid, `socket.data.userId` is undefined
   - This causes the auth check to fail silently

6. **Inconsistent authentication flow:**
   - Host uses `MEETING_JOIN` (direct auth-based)
   - Participant uses `PARTICIPANT_KNOCK` (optional token-based)
   - Middle ground: authenticated non-host users get confused

---

## 2. CRITICAL ISSUES IDENTIFIED

### Issue #1: Participant Join Authorization Mismatch
**Severity:** HIGH  
**Impact:** Participants unable to join despite valid meeting ID

#### Root Cause Chain:
```
1. Participant attempts to join meeting
   ↓
2. Client calls socket.emit(PARTICIPANT_KNOCK) with optional inviteToken
   ↓
3. Server checks: if (!meeting) → reject
   ↓
4. Server validates inviteToken IF provided
   ↓
5. Server adds to waiting queue → waiting room triggered ✓
   ↓
   BUT: Join.tsx passes undefined participantId → fallback to guest UUID
   AND: Meet.tsx expects authToken to set isHost flag
   AND: If authToken invalid/missing → socket.data.userId = undefined
   ↓
6. Host-side: socket.data.isHost determined by userIdmatch
   → If userIds don't match → host join fails silently
```

#### Why This Breaks:
```typescript
// meetingHandlers.ts:57
const isHost = meeting.hostUserId === socket.data.userId;
// socket.data.userId is set by auth middleware, BUT:
// - If no token OR invalid token → socket.data.userId = undefined
// - Then: undefined !== "valid-user-id" → isHost = false
// - Host gets rejected from their own meeting!
```

### Issue #2: Role Model Doesn't Support "Anyone Can Host"
**Severity:** MEDIUM  
**Impact:** Cannot implement flexible role assignment per meeting

#### Current Model Problems:
```prisma
model User {
  role UserRole @default(PARTICIPANT)  // FIXED at registration
}

enum UserRole {
  HOST
  PARTICIPANT
}
```

#### Why This Is Wrong:
- User role is immutable after registration
- Cannot support: "Alice is PARTICIPANT, but hosts Meeting-1"
- Cannot support: "Bob joins Meeting-2 as HOST via scheduled meeting"
- Breaks scalability: role must be per-meeting, not per-user

### Issue #3: Data Cleanup Missing
**Severity:** MEDIUM  
**Impact:** Database bloat, privacy/compliance risk

#### Current Issues:
- `ParticipantLogs` grows indefinitely
- `MeetingParticipant` entries never deleted
- Magic links don't expire automatically
- No archive strategy for past meetings

---

## 3. DATABASE REDESIGN STRATEGY

### Phase 3A: New Schema (Scalable, Role-Flexible)

#### Key Principles:
1. **Decouple user role from meeting context**
2. **Create MeetingParticipant junction table** for per-meeting roles
3. **Add automatic cleanup triggers/jobs**
4. **Support any user hosting any meeting**
5. **Track participant state separately from user state**

#### Schema Changes:

```prisma
// ============================================
// 1. RENAME & EXTEND User (no role change)
// ============================================
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  displayName  String
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relations
  hostedMeetings       Meeting[]              @relation("HostedMeetings")
  meetingParticipants  MeetingParticipant[]
  magicLinks           MagicLink[]
  scheduledMeetings    ScheduledMeeting[]
}

// ============================================
// 2. EXTEND Meeting with tracking
// ============================================
model Meeting {
  id                  String   @id @default(cuid())
  hostId              String   // FK to User
  defaultLanguage     String
  status              String   @default("ACTIVE")  // ACTIVE, ENDED, ARCHIVED
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  endedAt             DateTime?                     // When host ends meeting
  expiresAt           DateTime?                     // Auto-delete after this
  scheduledMeetingId  String?  @unique

  // Relations
  hostUser            User                    @relation("HostedMeetings", fields: [hostId], references: [id])
  participants        MeetingParticipant[]
  magicLinks          MagicLink[]
  participantLogs     ParticipantLog[]
  scheduledMeeting    ScheduledMeeting?       @relation(fields: [scheduledMeetingId], references: [id])

  // Indexes
  @@index([hostId])
  @@index([status])
  @@index([expiresAt])
}

// ============================================
// 3. NEW: MeetingParticipant (junction table)
// ============================================
model MeetingParticipant {
  id                String   @id @default(cuid())
  meetingId         String
  userId            String
  joinedAt          DateTime @default(now())
  leftAt            DateTime?
  preferredLanguage String   @default("en")
  
  // Per-meeting role (overrides user.role)
  role              ParticipantRole @default(PARTICIPANT)  // HOST, PARTICIPANT, CO_HOST

  // State tracking
  isMuted           Boolean  @default(false)
  isOnline          Boolean  @default(false)
  
  // Cleanup tracking
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  meeting           Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  participant       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Constraints & Indexes
  @@unique([meetingId, userId])
  @@index([meetingId])
  @@index([userId])
  @@index([leftAt])
}

// ============================================
// 4. REPLACE ParticipantLogs → ParticipantLog
// ============================================
model ParticipantLog {
  id                String   @id @default(cuid())
  meetingId         String
  participantId     String   // userId, not email
  eventType         String   // "joined", "left", "muted", "unmuted", "spoke"
  metadata          Json?
  createdAt         DateTime @default(now())

  // Relations
  meeting           Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  // Auto-cleanup: logs older than 90 days archived/deleted
  // Indexes for cleanup queries
  @@index([meetingId, createdAt])
  @@index([participantId])
  @@index([createdAt])  // For TTL cleanup job
}

// ============================================
// 5. EXTEND MagicLink
// ============================================
model MagicLink {
  id              String    @id @default(cuid())
  token           String    @unique
  meetingId       String
  inviteeEmail    String?   // null = open link
  expiresAt       DateTime
  usedAt          DateTime?
  usedByUserId    String?   // Track who actually used it
  createdAt       DateTime  @default(now())
  createdByUserId String

  // Relations
  meeting         Meeting   @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  createdBy       User      @relation(fields: [createdByUserId], references: [id])

  // Cleanup: auto-delete after 30 days
  @@index([token])
  @@index([meetingId])
  @@index([expiresAt])
}

// ============================================
// 6. EXTEND ScheduledMeeting
// ============================================
model ScheduledMeeting {
  id              String   @id @default(cuid())
  title           String
  description     String?  @default("")
  scheduledAt     DateTime
  durationMinutes Int      @default(60)
  timezone        String   @default("UTC")
  hostId          String
  meetingId       String?  @unique
  shareToken      String   @unique
  status          String   @default("PENDING")  // PENDING, STARTED, COMPLETED, CANCELLED
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  cancelledAt     DateTime?

  // Relations
  host            User     @relation(fields: [hostId], references: [id])
  meeting         Meeting? @relation(fields: [meetingId], references: [id], onDelete: SetNull)

  @@index([hostId])
  @@index([scheduledAt])
  @@index([status])
}

// ============================================
// 7. NEW ENUM: ParticipantRole
// ============================================
enum ParticipantRole {
  HOST          // Meeting creator/controller
  CO_HOST       // Can admit/deny (future feature)
  PARTICIPANT   // Regular participant
}
```

---

## 4. PARTICIPANT JOIN BUG ROOT CAUSE

### Detailed Analysis

#### Bug Location: `packages/server/src/socket/meetingHandlers.ts:57`

```typescript
// ❌ PROBLEMATIC CODE
const isHost = meeting.hostUserId === socket.data.userId;

// ❌ socket.data.userId comes from auth middleware:
if (token) {
  // verify JWT → sets socket.data.userId
} else {
  // NO TOKEN → socket.data.userId = undefined
}

// ❌ Then: undefined !== meeting.hostUserId → isHost = false
// ❌ Host trying to join gets rejected!
```

#### Why Participants Are Stuck:

1. **Host joins directly with MEETING_JOIN event:**
   - Should pass auth token
   - Must verify: `socket.data.userId === meeting.hostUserId`
   - If token missing/invalid → join fails silently

2. **Participant flow with PARTICIPANT_KNOCK:**
   - Correctly handled: added to waiting room
   - Correctly handled: waiting for host admit
   - ✓ Works even without token (optiona inviteToken used instead)

3. **The Mismatch:**
   - If non-host authenticated user tries MEETING_JOIN → explicitly rejected
   - But host trying MEETING_JOIN without token → silently fails (no clear error)
   - Participant stuck in waiting room if host can't join

#### Error Messages Are Hidden:
```typescript
// meetingHandlers.ts:74-77
socket.emit("error", {
  message: "You are not authorized as the host...",
  code: "HOST_AUTH_FAILED"
});
// This error is emitted but may not be received if socket handshake incomplete
```

---

## 5. STEP-BY-STEP IMPLEMENTATION

### Implementation Order (Critical):

1. **Database Migration** (must be first)
2. **Shared Types Update**
3. **Server Service Layer Refactor**
4. **Socket Handler Refactor**
5. **Cleanup Jobs & Monitoring**
6. **Client State Management Update**
7. **Client UI Updates**
8. **End-to-End Testing**

---

## STEP 1: Database Migration

### 1.1 Create New Prisma Migration

**File:** `packages/server/prisma/schema.prisma`

**Action:** Replace entire file with new schema above (Section 3)

**Commands:**
```bash
cd packages/server
npx prisma migrate dev --name scalable_participant_roles
npx prisma generate
```

### 1.2 Migration Rollback Strategy (if needed)

Keep backup of old schema:
```bash
cp prisma/migrations/20260416090131_create_new_tables/migration.sql \
   prisma/migrations/20260416090131_create_new_tables/migration.sql.backup
```

If rollback needed:
```bash
npx prisma migrate resolve --rolled-back scalable_participant_roles
```

### 1.3 Data Migration Script (if existing meetings in DB)

**File:** `packages/server/prisma/migrations/[timestamp]_data_migration.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateData() {
  // Migrate existing Meetings to new schema
  const meetings = await prisma.meeting.findMany();
  
  for (const meeting of meetings) {
    // Create MeetingParticipant entry for host
    if (meeting.hostUserId) {
      await prisma.meetingParticipant.create({
        data: {
          meetingId: meeting.id,
          userId: meeting.hostUserId,
          role: 'HOST',
          joinedAt: meeting.createdAt,
        }
      });
    }
  }
  
  console.log(`Migrated ${meetings.length} meetings to new schema`);
}

migrateData().catch(console.error).finally(() => prisma.$disconnect());
```

**Run:** `npx ts-node prisma/migrations/[timestamp]_data_migration.ts`

---

## STEP 2: Update Shared Types

### 2.1 Update `packages/shared/types.ts`

```typescript
// ADD these types
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface MeetingParticipantRecord {
  id: string;
  meetingId: string;
  userId: string;
  role: ParticipantRole;
  preferredLanguage: SupportedLanguageCode;
  joinedAt: string;
  leftAt?: string | null;
  isMuted: boolean;
  isOnline: boolean;
}

export type ParticipantRole = 'HOST' | 'CO_HOST' | 'PARTICIPANT';

export interface WaitingParticipant {
  socketId: string;
  participantId: string;
  displayName: string;
  preferredLanguage: SupportedLanguageCode;
  requestedAt: number;
}

export interface MeetingRecord {
  id: string;
  hostId: string;
  defaultLanguage: string;
  status: 'ACTIVE' | 'ENDED' | 'ARCHIVED';
  createdAt: string;
  endedAt?: string | null;
}
```

### 2.2 Update `packages/shared/events.ts`

```typescript
export const SOCKET_EVENTS = {
  // Existing events (keep all)
  MEETING_JOIN: 'meeting:join',
  PARTICIPANT_KNOCK: 'participant:knock',
  ADMIT_PARTICIPANT: 'host:admit',
  DENY_PARTICIPANT: 'host:deny',
  KNOCK_ACCEPTED: 'participant:knock_accepted',
  KNOCK_DENIED: 'participant:knock_denied',
  WAITING_ROOM_UPDATE: 'host:waiting_room_update',
  MEETING_STATE: 'meeting:state',
  
  // NEW: Explicit auth/join flow events
  HOST_JOIN_ERROR: 'host:join_error',
  HOST_JOIN_SUCCESS: 'host:join_success',
} as const;
```

---

## STEP 3: Server Service Layer Refactor

### 3.1 Update `packages/server/src/services/meetingService.ts`

**Add these methods:**

```typescript
// Get meeting with host info
async getMeetingWithHost(meetingId: string) {
  return await this.prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      hostUser: true,
      participants: {
        include: { participant: true }
      }
    }
  });
}

// Get participant record for user in meeting
async getParticipantRecord(meetingId: string, userId: string) {
  return await this.prisma.meetingParticipant.findUnique({
    where: {
      meetingId_userId: { meetingId, userId }
    }
  });
}

// Create participant record
async addParticipantToMeeting(
  meetingId: string,
  userId: string,
  role: 'HOST' | 'PARTICIPANT' | 'CO_HOST',
  preferredLanguage: string
) {
  return await this.prisma.meetingParticipant.create({
    data: {
      meetingId,
      userId,
      role,
      preferredLanguage,
      isOnline: true
    },
    include: { participant: true }
  });
}

// End meeting (cleanup)
async endMeeting(meetingId: string) {
  const now = new Date();
  return await this.prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: 'ENDED',
      endedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
    }
  });
}

// Clean up old participant logs
async archiveOldLogs(daysOld: number = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return await this.prisma.participantLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate }
    }
  });
}
```

---

## STEP 4: Socket Handler Refactor

### 4.1 Critical Fix: `packages/server/src/socket/meetingHandlers.ts`

**REPLACE the entire `MEETING_JOIN` handler:**

```typescript
socket.on(
  SOCKET_EVENTS.MEETING_JOIN,
  async ({
    meetingId,
    participantId,
    displayName,
    preferredLanguage
  }: JoinMeetingPayload) => {
    // Validate meeting exists
    const meeting = await meetingService.getMeetingWithHost(meetingId);
    if (!meeting) {
      socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, {
        message: "Meeting not found",
        code: "MEETING_NOT_FOUND"
      });
      return;
    }

    // 🔑 CRITICAL FIX: Check if user is authenticated AND is the host
    const userId = socket.data.userId;
    
    // Case 1: Host joining their own meeting
    if (userId && userId === meeting.hostId) {
      const participant: Participant = {
        socketId: socket.id,
        participantId: userId,
        displayName: socket.data.displayName ?? displayName,
        preferredLanguage,
        isMuted: false,
        isSpeaking: false
      };

      // Join socket rooms
      socket.join(meetingId);
      socket.join(`${meetingId}:host`);
      socket.join(`${meetingId}:${preferredLanguage}`);
      
      // Store in socket data
      socket.data.meetingId = meetingId;
      socket.data.pending = false;
      socket.data.isHost = true;

      // Add to participant record
      await roomManager.addParticipant(meetingId, participant);
      
      // Create DB record
      await meetingService.addParticipantToMeeting(
        meetingId,
        userId,
        'HOST',
        preferredLanguage
      );

      // Emit success
      socket.emit(SOCKET_EVENTS.HOST_JOIN_SUCCESS, { meetingId });
      
      // Broadcast meeting state
      await emitMeetingState(io, meetingId, roomManager, meetingService);
      io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
        waitingParticipants: await roomManager.getWaitingParticipants(meetingId)
      });
      
      return;
    }

    // Case 2: Non-host trying to use MEETING_JOIN (invalid flow)
    if (userId) {
      socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, {
        message: "You are not the host of this meeting. Use the join flow instead.",
        code: "NOT_HOST"
      });
      return;
    }

    // Case 3: No auth token provided
    socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, {
      message: "Authentication required. Please log in before joining.",
      code: "AUTH_REQUIRED"
    });
  }
);
```

### 4.2 Enhance `PARTICIPANT_KNOCK` Handler

```typescript
socket.on(
  SOCKET_EVENTS.PARTICIPANT_KNOCK,
  async ({
    meetingId,
    participantId,
    displayName,
    preferredLanguage,
    inviteToken
  }: KnockPayload) => {
    // Validate meeting exists
    const meeting = await meetingService.getMeeting(meetingId);
    if (!meeting) {
      socket.emit("error", { 
        message: "Meeting not found",
        code: "MEETING_NOT_FOUND"
      });
      return;
    }

    // Validate invite token if provided
    if (inviteToken) {
      const inviteValidation = await meetingService.validateMagicLink(inviteToken);
      if (!inviteValidation.valid || inviteValidation.meetingId !== meetingId) {
        socket.emit(SOCKET_EVENTS.KNOCK_DENIED, {
          meetingId,
          reason: inviteValidation.valid
            ? "Invite does not match this meeting"
            : "Invalid or expired invite"
        });
        return;
      }
    }

    // Add to waiting room
    const waiter: WaitingParticipant = {
      socketId: socket.id,
      participantId,
      displayName,
      preferredLanguage,
      requestedAt: Date.now()
    };

    const waitingParticipants = await roomManager.addToWaiting(meetingId, waiter);
    
    // Store socket data
    socket.data.meetingId = meetingId;
    socket.data.pending = true;
    socket.data.pendingParticipant = waiter;
    socket.data.pendingInviteToken = inviteToken ?? null;

    // Notify host of waiting room update
    io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
      waitingParticipants
    });
  }
);
```

### 4.3 Update `ADMIT_PARTICIPANT` Handler

```typescript
socket.on(
  SOCKET_EVENTS.ADMIT_PARTICIPANT,
  async ({
    meetingId,
    targetSocketId
  }: {
    meetingId: string;
    targetSocketId: string;
  }) => {
    // Verify host authorization
    if (!socket.data.isHost) {
      socket.emit("error", { 
        message: "Only the host can admit participants",
        code: "UNAUTHORIZED"
      });
      return;
    }

    const waiters = await roomManager.getWaitingParticipants(meetingId);
    const waiter = waiters.find((entry) => entry.socketId === targetSocketId);
    const targetSocket = io.sockets.sockets.get(targetSocketId);

    if (!waiter || !targetSocket) {
      io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
        waitingParticipants: await roomManager.removeFromWaiting(meetingId, targetSocketId)
      });
      return;
    }

    // Remove from waiting
    const waitingParticipants = await roomManager.removeFromWaiting(meetingId, targetSocketId);

    // Join socket rooms
    targetSocket.join(meetingId);
    targetSocket.join(`${meetingId}:${waiter.preferredLanguage}`);
    
    // Mark as admitted
    targetSocket.data.meetingId = meetingId;
    targetSocket.data.pending = false;
    targetSocket.data.isHost = false;

    // Add to room manager
    await roomManager.addParticipant(meetingId, {
      socketId: waiter.socketId,
      participantId: waiter.participantId,
      displayName: waiter.displayName,
      preferredLanguage: waiter.preferredLanguage,
      isMuted: false,
      isSpeaking: false
    });

    // Create DB record
    await meetingService.addParticipantToMeeting(
      meetingId,
      waiter.participantId,
      'PARTICIPANT',
      waiter.preferredLanguage
    );

    // Mark invite as used
    if (typeof targetSocket.data.pendingInviteToken === "string") {
      await meetingService.markMagicLinkUsed(targetSocket.data.pendingInviteToken);
      targetSocket.data.pendingInviteToken = null;
    }

    // Notify participant of acceptance
    targetSocket.emit(SOCKET_EVENTS.KNOCK_ACCEPTED, { meetingId });

    // Broadcast meeting state
    await emitMeetingState(io, meetingId, roomManager, meetingService);

    // Update host's waiting room
    io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
      waitingParticipants
    });
  }
);
```

---

## STEP 5: Cleanup Jobs & Monitoring

### 5.1 Create Cleanup Service

**File:** `packages/server/src/services/cleanupService.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import type { Cron } from 'cron';
import cron from 'cron';
import pino from 'pino';

const logger = pino();
const prisma = new PrismaClient();

export class CleanupService {
  private cronJobs: Cron[] = [];

  start() {
    // Run every day at 2 AM UTC
    const dailyJob = cron.schedule('0 2 * * *', async () => {
      await this.runCleanup();
    });
    this.cronJobs.push(dailyJob);
    logger.info('Cleanup service started');
  }

  private async runCleanup() {
    try {
      // 1. Clean up old participant logs (>90 days)
      const logsDeleted = await prisma.participantLog.deleteMany({
        where: {
          createdAt: {
            lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          }
        }
      });
      logger.info(`Deleted ${logsDeleted.count} old participant logs`);

      // 2. Clean up expired magic links
      const linksDeleted = await prisma.magicLink.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
          usedAt: { not: null } // Only delete if already used
        }
      });
      logger.info(`Deleted ${linksDeleted.count} expired magic links`);

      // 3. Archive old ended meetings
      const meetingsArchived = await prisma.meeting.updateMany({
        where: {
          status: 'ENDED',
          endedAt: {
            lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // >30 days old
          }
        },
        data: {
          status: 'ARCHIVED'
        }
      });
      logger.info(`Archived ${meetingsArchived.count} old meetings`);

      // 4. Clean up orphaned participant records (meeting ended >30 days ago)
      const participantsDeleted = await prisma.meetingParticipant.deleteMany({
        where: {
          meeting: {
            status: 'ARCHIVED'
          }
        }
      });
      logger.info(`Deleted ${participantsDeleted.count} archived meeting participants`);

    } catch (error) {
      logger.error({ error }, 'Cleanup job failed');
    }
  }

  stop() {
    this.cronJobs.forEach(job => job.stop());
    logger.info('Cleanup service stopped');
  }
}
```

### 5.2 Register in Server

**File:** `packages/server/src/index.ts`

```typescript
import { CleanupService } from './services/cleanupService.js';

const cleanupService = new CleanupService();
cleanupService.start();

// On graceful shutdown:
process.on('SIGTERM', () => {
  cleanupService.stop();
  // ... other cleanup
});
```

---

## STEP 6: Client State Management Update

### 6.1 Update `packages/client/src/store/meetingStore.ts`

```typescript
import { create } from 'zustand';
import type { Participant, MeetingParticipantRecord } from '@multilang-call/shared';

interface MeetingState {
  // Meeting info
  meetingId: string | null;
  hostId: string | null;
  defaultLanguage: string;
  
  // Participants
  participants: Participant[];
  participantRecords: MeetingParticipantRecord[];
  waitingParticipants: any[];
  
  // User state
  userRole: 'HOST' | 'PARTICIPANT' | null;
  admittedToMeeting: boolean;
  waitingForAdmission: boolean;
  
  // Error handling
  joinError: string | null;
  joinErrorCode: string | null;

  // Actions
  setMeetingId: (id: string) => void;
  setHostId: (id: string) => void;
  setUserRole: (role: 'HOST' | 'PARTICIPANT') => void;
  setAdmittedToMeeting: (admitted: boolean) => void;
  setWaitingForAdmission: (waiting: boolean) => void;
  setJoinError: (error: string | null, code?: string) => void;
  setParticipants: (participants: Participant[]) => void;
  setWaitingParticipants: (waiters: any[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (socketId: string) => void;
  reset: () => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  meetingId: null,
  hostId: null,
  defaultLanguage: 'en',
  participants: [],
  participantRecords: [],
  waitingParticipants: [],
  userRole: null,
  admittedToMeeting: false,
  waitingForAdmission: false,
  joinError: null,
  joinErrorCode: null,

  setMeetingId: (id) => set({ meetingId: id }),
  setHostId: (id) => set({ hostId: id }),
  setUserRole: (role) => set({ userRole: role }),
  setAdmittedToMeeting: (admitted) => set({ admittedToMeeting: admitted }),
  setWaitingForAdmission: (waiting) => set({ waitingForAdmission: waiting }),
  setJoinError: (error, code) => set({ 
    joinError: error,
    joinErrorCode: code ?? null
  }),
  setParticipants: (participants) => set({ participants }),
  setWaitingParticipants: (waiters) => set({ waitingParticipants: waiters }),
  
  addParticipant: (participant) =>
    set((state) => ({
      participants: [
        ...state.participants.filter(p => p.socketId !== participant.socketId),
        participant
      ]
    })),

  removeParticipant: (socketId) =>
    set((state) => ({
      participants: state.participants.filter(p => p.socketId !== socketId)
    })),

  reset: () =>
    set({
      meetingId: null,
      hostId: null,
      defaultLanguage: 'en',
      participants: [],
      participantRecords: [],
      waitingParticipants: [],
      userRole: null,
      admittedToMeeting: false,
      waitingForAdmission: false,
      joinError: null,
      joinErrorCode: null
    })
}));
```

---

## STEP 7: Client UI Error Handling Update

### 7.1 Update `packages/client/src/pages/Meet.tsx`

**Replace error handling section:**

```typescript
// Add error listener for HOST_JOIN_ERROR
useEffect(() => {
  if (!socket) return;

  const handleHostJoinError = (data: {
    message: string;
    code: string;
  }) => {
    setMeetingStore.setJoinError(data.message, data.code);
    
    // Log for debugging
    console.error('[HOST JOIN ERROR]', data);
    
    // Redirect based on error code
    switch (data.code) {
      case 'AUTH_REQUIRED':
        // Redirect to auth
        navigate('/auth', {
          state: { redirectTo: `/meet/${meetingId}` }
        });
        break;
      case 'MEETING_NOT_FOUND':
        // Redirect to home with error message
        navigate('/', {
          state: { error: 'Meeting not found or ended' }
        });
        break;
      case 'NOT_HOST':
        // This user is authenticated but not the host - use participant flow
        socket.emit(SOCKET_EVENTS.PARTICIPANT_KNOCK, {
          meetingId,
          participantId: user.id,
          displayName: user.displayName,
          preferredLanguage,
          inviteToken: effectiveInviteToken
        });
        break;
    }
  };

  socket.on(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
  
  return () => {
    socket.off(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
  };
}, [socket, meetingId, user]);

// Add success listener
useEffect(() => {
  if (!socket) return;

  const handleHostJoinSuccess = (data: { meetingId: string }) => {
    console.log('[HOST JOIN SUCCESS]', data);
    setMeetingStore.setAdmittedToMeeting(true);
    setMeetingStore.setWaitingForAdmission(false);
  };

  socket.on(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
  
  return () => {
    socket.off(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
  };
}, [socket]);
```

### 7.2 Add Error Display UI

**In Meet.tsx render:**

```tsx
// If there's a join error, show it prominently
if (joinError && joinErrorCode === 'HOST_JOIN_ERROR') {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-[36px] bg-white/90 p-8 shadow-panel text-center">
        <h1 className="text-2xl font-bold text-rose-600">Unable to Join</h1>
        <p className="mt-4 text-sm text-slate-600">{joinError}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white"
        >
          Back to Home
        </button>
      </section>
    </main>
  );
}

// Waiting room UI (if waiting for admission)
if (waitingForAdmission && !admittedToMeeting) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-[40px] bg-white/90 p-12 shadow-panel text-center">
        <div className="mx-auto mb-6 h-12 w-12 rounded-full bg-accent/20 animate-pulse"></div>
        <h2 className="text-2xl font-bold text-ink">Waiting for host</h2>
        <p className="mt-2 text-sm text-slate-600">
          The host will let you in shortly
        </p>
      </section>
    </main>
  );
}
```

---

## STEP 8: Update Socket Events in Client

### 8.1 Update `packages/client/src/lib/socketEvents.ts`

```typescript
import { SOCKET_EVENTS } from '@multilang-call/shared';

export const setupSocketListeners = (socket: any, meetingStore: any) => {
  // Meeting state
  socket.on(SOCKET_EVENTS.MEETING_STATE, (data) => {
    meetingStore.setParticipants(data.participants);
  });

  // Host join responses
  socket.on(SOCKET_EVENTS.HOST_JOIN_SUCCESS, (data) => {
    meetingStore.setAdmittedToMeeting(true);
    meetingStore.setWaitingForAdmission(false);
  });

  socket.on(SOCKET_EVENTS.HOST_JOIN_ERROR, (data) => {
    meetingStore.setJoinError(data.message, data.code);
  });

  // Participant knock responses
  socket.on(SOCKET_EVENTS.KNOCK_ACCEPTED, (data) => {
    meetingStore.setAdmittedToMeeting(true);
    meetingStore.setWaitingForAdmission(false);
  });

  socket.on(SOCKET_EVENTS.KNOCK_DENIED, (data) => {
    meetingStore.setJoinError(
      data.reason ?? 'Host denied your request to join',
      'KNOCK_DENIED'
    );
  });

  // Waiting room updates (for host)
  socket.on(SOCKET_EVENTS.WAITING_ROOM_UPDATE, (data) => {
    meetingStore.setWaitingParticipants(data.waitingParticipants);
  });

  // Participant leave
  socket.on(SOCKET_EVENTS.PARTICIPANT_LEAVE, (data) => {
    meetingStore.removeParticipant(data.socketId);
  });

  // Generic errors
  socket.on('error', (data) => {
    console.error('[Socket Error]', data);
  });
};
```

---

## STEP 9: Authentication Middleware Fix

### 9.1 Fix `packages/server/src/middleware/auth.ts`

```typescript
import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import pino from 'pino';

const logger = pino();
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

export const authMiddleware = (socket: Socket, next: any) => {
  const token = socket.handshake.auth.token as string | undefined;

  if (!token) {
    // 🔄 IMPORTANT: Don't reject, just don't set userId
    // This allows unauthenticated participants to use invite flow
    socket.data.userId = undefined;
    socket.data.displayName = undefined;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      displayName: string;
      email: string;
      role: string;
    };

    socket.data.userId = decoded.userId;
    socket.data.displayName = decoded.displayName;
    socket.data.email = decoded.email;
    socket.data.role = decoded.role;

    logger.info(`[Socket Auth] User ${decoded.userId} authenticated`);
    next();
  } catch (error) {
    logger.warn(`[Socket Auth] Invalid token: ${error}`);
    // Don't reject - allow fallback to invite-based flow
    socket.data.userId = undefined;
    next();
  }
};
```

---

## 6. TESTING & VALIDATION

### Test Scenario 1: Host Joins Meeting
```
1. User logs in with valid credentials
2. User creates a meeting → gets meetingId
3. User navigates to /meet/:meetingId
4. Client sends MEETING_JOIN with auth token
5. Server validates: socket.data.userId === meeting.hostId
6. ✓ Host joins successfully
7. ✓ Host can see waiting room panel
8. ✓ Meeting state broadcast to all participants
```

**Test Script:**
```bash
# Terminal 1: Run server
cd packages/server && npm run dev

# Terminal 2: Run client
cd packages/client && npm run dev

# Terminal 3: Test with curl
TOKEN="eyJhbGc..." # Valid JWT
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"host@test.com","password":"test123"}'
```

### Test Scenario 2: Participant Joins Without Auth
```
1. User opens /join/:meetingId
2. User fills name + language (no login required)
3. Clicks "Enter meeting"
4. Client sends PARTICIPANT_KNOCK without auth token
5. Server receives knock, adds to waiting queue
6. ✓ Participant sees "Waiting for host..."
7. ✓ Host receives waiting room update
8. Host clicks "Admit"
9. ✓ Participant joins meeting
```

**Test Script:**
```bash
# 1. Get a valid meetingId from a host
# 2. Open: http://localhost:5173/join/{meetingId}
# 3. Fill form and click "Enter meeting"
# 4. Verify in console: socket emits PARTICIPANT_KNOCK
```

### Test Scenario 3: Magic Link Invite
```
1. Host opens "Invite participants" section
2. Clicks "Generate magic invite link"
3. Gets URL: /join/:meetingId?invite=TOKEN
4. Shares with participant
5. Participant opens link
6. ✓ Invite validates: GET /invite/:token
7. ✓ Participant form shows "Invite valid from [hostName]"
8. Participant joins
9. ✓ Server validates inviteToken in PARTICIPANT_KNOCK
10. ✓ After host admits, link marked as "used"
```

### Test Scenario 4: Data Cleanup
```
1. Create meeting, add participants
2. End meeting
3. Wait for cleanup job (or run manually for testing)
4. Verify:
   - Meeting status = "ARCHIVED" after 30 days
   - MeetingParticipant records deleted
   - ParticipantLog records deleted (>90 days)
   - Magic links deleted (if expired + used)
```

---

## 7. DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All database migrations tested on staging
- [ ] Data migration script run and verified
- [ ] Backup of production DB taken
- [ ] All tests passing (unit + integration + e2e)
- [ ] Error scenarios tested (auth failure, meeting not found, etc.)
- [ ] Performance tested with 50+ participants
- [ ] Socket event ordering verified (no race conditions)

### Database Migration
- [ ] Run: `npx prisma migrate deploy` (production)
- [ ] Verify new tables created: `SELECT * FROM MeetingParticipant;`
- [ ] Verify data integrity: Check host/participant records match
- [ ] Test cleanup job (run manually first): `npx ts-node src/services/cleanupService.ts`

### Server Deployment
- [ ] Deploy updated backend code
- [ ] Verify Socket.io event handlers registered
- [ ] Check cleanup service started in logs
- [ ] Test each socket event manually
- [ ] Monitor error logs for socket issues
- [ ] Verify auth middleware working correctly

### Client Deployment
- [ ] Deploy updated frontend code
- [ ] Clear browser cache (`localStorage`)
- [ ] Test join flows in incognito window (clean state)
- [ ] Verify error messages display correctly
- [ ] Test on multiple browsers (Chrome, Firefox, Safari)

### Monitoring
- [ ] Set up alerts for:
  - Socket connection failures
  - Auth middleware errors
  - Cleanup job failures
  - High participant log counts
- [ ] Dashboard for:
  - Active meetings count
  - Waiting room sizes
  - Average join time
  - Magic link usage stats

### Rollback Plan (if needed)
```bash
# 1. Rollback code to previous commit
git revert <commit-hash>

# 2. Rollback database
npx prisma migrate resolve --rolled-back scalable_participant_roles

# 3. Restore from backup
# mysql shell:
# RESTORE FROM 'backup.sql';

# 4. Restart services
systemctl restart app-server
systemctl restart app-client
```

---

## SUMMARY OF CHANGES

### Database
- ✓ New `MeetingParticipant` junction table (per-meeting roles)
- ✓ Extended `Meeting` with status, endedAt, expiresAt
- ✓ Extended `MagicLink` with usedByUserId
- ✓ Extended `ScheduledMeeting` with status fields
- ✓ Renamed `ParticipantLogs` → `ParticipantLog` with indexes for cleanup

### Server
- ✓ Fixed auth middleware to allow optional auth
- ✓ Fixed `MEETING_JOIN` handler to properly validate host
- ✓ Added explicit `HOST_JOIN_ERROR` and `HOST_JOIN_SUCCESS` events
- ✓ Enhanced `PARTICIPANT_KNOCK` with better validation
- ✓ Added cleanup service with cron jobs
- ✓ New meeting service methods for participant/role management

### Client
- ✓ Enhanced `meetingStore` with role and error tracking
- ✓ Added error event handlers for join failures
- ✓ Better error display UI
- ✓ Improved waiting room messaging
- ✓ Socket event consolidation in `socketEvents.ts`

### Features Enabled
- ✓ Any user can host any meeting (flexible roles per-meeting)
- ✓ Clear error messages when join fails
- ✓ Automatic data cleanup after 90 days
- ✓ Magic link tracking (who used it)
- ✓ Meeting status tracking (ACTIVE → ENDED → ARCHIVED)

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Data migration failure | Low | High | Test on staging first, backup DB |
| Socket event race condition | Medium | Medium | Add logs, test with multiple participants |
| Auth middleware breaks existing users | Low | High | Keep fallback for optional auth |
| Cleanup job deletes wrong data | Low | High | Test filters carefully, use dry-run first |
| Performance degradation with new queries | Medium | Medium | Add DB indexes, monitor query times |

---

## NEXT STEPS

1. **Immediate:** Review and approve database schema changes
2. **Week 1:** Implement steps 1-5 (database + server fixes)
3. **Week 2:** Implement steps 6-7 (client updates)
4. **Week 3:** Testing + QA (Scenario 1-4)
5. **Week 4:** Staging deployment + final testing
6. **Week 5:** Production deployment with monitoring

---

**End of Implementation Guide**

*For questions or issues during implementation, refer to the socket event flow diagram and error code mapping below.*

### ERROR CODE MAPPING

| Code | Meaning | User Action | Server Response |
|------|---------|------------|-----------------|
| `AUTH_REQUIRED` | No auth token provided | Redirect to /auth | HTTP 401 |
| `MEETING_NOT_FOUND` | Meeting ID invalid/expired | Return to home | HTTP 404 |
| `NOT_HOST` | User is not meeting host | Switch to PARTICIPANT_KNOCK | HTTP 403 |
| `HOST_AUTH_FAILED` | Auth validation failed | Show error, retry | Socket error event |
| `KNOCK_DENIED` | Host rejected request | Show rejection reason | Socket KNOCK_DENIED |
| `INVITE_INVALID` | Magic link expired/used | Show invite error | HTTP 410 |

---

**Document Version:** 1.0  
**Last Updated:** April 17, 2026  
**Status:** Ready for Implementation
