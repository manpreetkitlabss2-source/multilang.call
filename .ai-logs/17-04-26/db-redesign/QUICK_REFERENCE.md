# Quick Reference & Cheat Sheet
## Implementation Quick Start

---

## 📋 CRITICAL FILES TO MODIFY

```
TIER 1 (Database & Core):
├─ packages/server/prisma/schema.prisma          [REPLACE entire file]
├─ packages/server/src/socket/meetingHandlers.ts [REPLACE MEETING_JOIN handler]
└─ packages/server/.env                           [Update JWT_SECRET]

TIER 2 (Services & Types):
├─ packages/shared/types.ts                       [ADD new types]
├─ packages/shared/events.ts                      [ADD new events]
├─ packages/server/src/services/meetingService.ts [ADD 6 new methods]
├─ packages/server/src/services/cleanupService.ts [CREATE NEW]
└─ packages/server/src/middleware/auth.ts         [FIX optional auth]

TIER 3 (Client):
├─ packages/client/src/store/meetingStore.ts     [EXTEND store]
├─ packages/client/src/pages/Meet.tsx            [ADD error handlers]
└─ packages/client/src/lib/socketEvents.ts       [ADD listeners]
```

---

## 🚀 QUICK START COMMANDS

### 1. Database Migration
```bash
cd packages/server
npx prisma migrate dev --name scalable_participant_roles
npx prisma generate
```

### 2. Install Dependencies (if needed)
```bash
cd packages/server
npm install cron pino  # Already should be installed
```

### 3. Test Server Locally
```bash
cd packages/server
npm run dev
# Should see: "Cleanup service started"
```

### 4. Test Client Locally
```bash
cd packages/client
npm run dev
# Navigate to http://localhost:5173
```

---

## 🔑 KEY CODE PATTERNS

### Socket Emit Patterns

**OLD (❌):**
```typescript
socket.emit("error", { message: "..." });
```

**NEW (✓):**
```typescript
socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, {
  message: "...",
  code: "ERROR_CODE"
});
```

### Auth Check Pattern

**OLD (❌):**
```typescript
const isHost = meeting.hostUserId === socket.data.userId;
if (!isHost) {
  // Fail silently
  return;
}
```

**NEW (✓):**
```typescript
const userId = socket.data.userId;

if (userId && userId === meeting.hostId) {
  // Proceed
} else if (userId && userId !== meeting.hostId) {
  socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, { code: 'NOT_HOST' });
} else {
  socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, { code: 'AUTH_REQUIRED' });
}
```

### Meeting Service Pattern

**Query with relations:**
```typescript
const meeting = await this.prisma.meeting.findUnique({
  where: { id: meetingId },
  include: {
    hostUser: true,
    participants: { include: { participant: true } }
  }
});
```

**Create participant:**
```typescript
await this.prisma.meetingParticipant.create({
  data: {
    meetingId,
    userId,
    role: 'HOST' | 'PARTICIPANT' | 'CO_HOST',
    preferredLanguage: 'en'
  }
});
```

### Store Action Pattern

**OLD:**
```typescript
const [waitingParticipants, setWaitingParticipants] = useState([]);
```

**NEW (Zustand):**
```typescript
const { setWaitingParticipants } = useMeetingStore();
// Later:
setWaitingParticipants(data.waitingParticipants);
```

---

## 🐛 COMMON MISTAKES TO AVOID

### ❌ MISTAKE 1: Forgetting CASCADE delete
```typescript
// WRONG:
meeting Meeting @relation(fields: [meetingId], references: [id])

// CORRECT:
meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)
```

### ❌ MISTAKE 2: Not checking socket.data.userId before using it
```typescript
// WRONG:
if (socket.data.userId === meeting.hostId) { }

// CORRECT:
if (socket.data.userId && socket.data.userId === meeting.hostId) { }
```

### ❌ MISTAKE 3: Forgetting to call socket.emit(...) for errors
```typescript
// WRONG:
if (error) return; // User never knows what happened

// CORRECT:
if (error) {
  socket.emit(SOCKET_EVENTS.HOST_JOIN_ERROR, { message, code });
  return;
}
```

### ❌ MISTAKE 4: Not awaiting async operations
```typescript
// WRONG:
meetingService.addParticipantToMeeting(...); // Fire and forget
emitMeetingState(...);

// CORRECT:
await meetingService.addParticipantToMeeting(...);
await emitMeetingState(...);
```

### ❌ MISTAKE 5: Emitting to wrong socket room
```typescript
// WRONG:
io.to(targetSocketId).emit(...); // Trying to use socketId as room

// CORRECT:
const socket = io.sockets.sockets.get(targetSocketId);
socket?.emit(...);

// OR for rooms:
io.to(`${meetingId}:host`).emit(...);
```

---

## 🧪 TESTING CHECKLIST

### Test Scenario 1: Host Joins
- [ ] Create account (email: host@test.com)
- [ ] Log in (JWT token stored)
- [ ] Create meeting (get meetingId)
- [ ] Navigate to `/meet/:meetingId`
- [ ] Verify: host joins successfully
- [ ] Verify: "Waiting room" panel visible
- [ ] Check console: no errors
- [ ] Check DB: `SELECT * FROM MeetingParticipant` shows host record

### Test Scenario 2: Participant Joins (Knock)
- [ ] Create separate browser tab/incognito (no auth)
- [ ] Open: `http://localhost:5173/join/{meetingId}`
- [ ] Fill form: name + language
- [ ] Click "Enter meeting"
- [ ] Verify: "Waiting for host..." screen
- [ ] In host browser: waiting room panel shows participant
- [ ] Host clicks "Admit"
- [ ] Verify: Participant joins meeting
- [ ] Verify: Both see each other in video grid

### Test Scenario 3: Magic Link
- [ ] Host clicks "Invite participants"
- [ ] Host clicks "Generate magic link"
- [ ] Get URL like: `http://localhost:5173/join/{meetingId}?invite=TOKEN`
- [ ] Open in new incognito tab
- [ ] Verify: form shows "Invite valid" message
- [ ] Fill form, click "Enter meeting"
- [ ] Verify: Same knock/admit flow
- [ ] Host admits participant
- [ ] Verify: DB shows `MagicLink.usedAt` is set
- [ ] Verify: Participant in meeting

### Test Scenario 4: Error Cases
- [ ] Host tries to join WITHOUT token → Should show "Auth required" error
- [ ] Non-host tries MEETING_JOIN → Should show "Not the host" error
- [ ] Invalid meetingId → Should show "Meeting not found"
- [ ] Expired magic link → Should show "Invite invalid"
- [ ] Host denies participant → Should show "Host declined"

### Test Scenario 5: Data Cleanup (Optional)
- [ ] Create meeting with 3 participants
- [ ] End meeting
- [ ] Check: Meeting.status = 'ENDED', Meeting.endedAt is set
- [ ] Wait 91+ days (or manually trigger cleanup)
- [ ] Verify: ParticipantLog records deleted
- [ ] Verify: MeetingParticipant records deleted
- [ ] Verify: Meeting.status = 'ARCHIVED'

---

## 🔍 DEBUGGING TECHNIQUES

### Socket Not Connecting?
```typescript
// Add to client (Meet.tsx):
console.log('[Socket] Connecting to', SOCKET_URL);
socket.on('connect', () => console.log('[Socket] Connected'));
socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));
socket.on('connect_error', (error) => console.error('[Socket] Error:', error));
```

### Auth Token Not Set?
```typescript
// Check browser console:
const token = localStorage.getItem('auth_token');
console.log('Auth token:', token);

// Check in socket:
console.log('Socket auth data:', socket.data);
```

### Meeting Not Found?
```typescript
// Check server logs:
console.log('Meeting query:', meetingId);
console.log('Meeting result:', meeting);

// Check DB directly:
SELECT * FROM Meeting WHERE id = 'meetingId';
```

### Waiting Room Not Updating?
```typescript
// Server side:
console.log('Waiting participants:', await roomManager.getWaitingParticipants(meetingId));

// Client side (Host):
socket.on(SOCKET_EVENTS.WAITING_ROOM_UPDATE, (data) => {
  console.log('[Waiting Room Update]', data.waitingParticipants);
});
```

### Participant Not Joining After Admit?
```typescript
// Check if socket is still connected:
const targetSocket = io.sockets.sockets.get(targetSocketId);
console.log('Target socket connected?', targetSocket?.connected);

// Check rooms joined:
console.log('Socket rooms:', targetSocket?.rooms);

// Check if KNOCK_ACCEPTED received:
socket.on(SOCKET_EVENTS.KNOCK_ACCEPTED, (data) => {
  console.log('[KNOCK ACCEPTED]', data);
  // Should see this in console
});
```

---

## 📊 DATABASE QUERIES FOR DEBUGGING

### Check All Meetings
```sql
SELECT * FROM Meeting WHERE id = 'meetingId';
SELECT * FROM Meeting WHERE status = 'ACTIVE';
```

### Check Meeting Participants
```sql
SELECT 
  mp.id,
  mp.userId,
  u.displayName,
  mp.role,
  mp.preferredLanguage,
  mp.joinedAt,
  mp.leftAt
FROM MeetingParticipant mp
JOIN User u ON u.id = mp.userId
WHERE mp.meetingId = 'meetingId'
ORDER BY mp.joinedAt;
```

### Check Magic Links
```sql
SELECT 
  id,
  token,
  meetingId,
  expiresAt,
  usedAt,
  usedByUserId
FROM MagicLink
WHERE meetingId = 'meetingId'
ORDER BY createdAt DESC;
```

### Check Participant Logs (Audit Trail)
```sql
SELECT 
  *
FROM ParticipantLog
WHERE meetingId = 'meetingId'
ORDER BY createdAt DESC
LIMIT 100;
```

### Cleanup Test (Don't run on production!)
```sql
-- See what would be deleted (90 days old):
SELECT COUNT(*) FROM ParticipantLog 
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- See what would be archived:
SELECT COUNT(*) FROM Meeting
WHERE status = 'ENDED'
AND endedAt < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

---

## 📝 ENVIRONMENT VARIABLES

### Server `.env`
```bash
# Existing
DATABASE_URL=mysql://user:pass@localhost:3306/multilang

# New (JWT)
JWT_SECRET=your-long-random-secret-at-least-32-chars-long
JWT_EXPIRES_IN=7d
MAGIC_LINK_EXPIRES_HOURS=48
BASE_URL=http://localhost:3000

# Optional (cleanup)
CLEANUP_ENABLED=true
CLEANUP_SCHEDULE=0 2 * * *  # 2 AM UTC daily
```

### Client `.env`
```bash
VITE_SOCKET_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001/api
```

---

## 🎯 IMPLEMENTATION CHECKLIST

```
WEEK 1:
□ Review schema changes (30 min)
□ Create migration (30 min)
□ Test migration on staging (1 hour)
□ Update shared types (1 hour)
□ Update auth middleware (30 min)

WEEK 2:
□ Fix MEETING_JOIN handler (1.5 hours)
□ Add new service methods (2 hours)
□ Create cleanup service (1 hour)
□ Add error event handlers (1 hour)

WEEK 3:
□ Update meetingStore (1 hour)
□ Update Meet.tsx error handling (1.5 hours)
□ Add socket event listeners (30 min)
□ Test scenarios 1-5 (3 hours)

WEEK 4:
□ Staging deployment (1 hour)
□ Monitor for errors (4 hours)
□ Performance testing (2 hours)
□ Documentation & runbook (1 hour)

WEEK 5:
□ Production migration (1 hour)
□ Monitoring & alerting setup (1 hour)
□ Post-deployment validation (2 hours)
□ Ready for rollback if needed
```

---

## 🚨 EMERGENCY ROLLBACK

If things go wrong in production:

```bash
# 1. Revert code
git revert <bad-commit-hash>
git push

# 2. Rollback database
cd packages/server
npx prisma migrate resolve --rolled-back scalable_participant_roles

# 3. Restart server
systemctl restart app-server
systemctl restart app-client

# 4. Restore from backup if needed
mysql < backup_2024_04_17.sql

# 5. Verify
curl http://localhost:3001/health
curl http://localhost:3001/api/meetings
```

---

## 📞 SUPPORT MATRIX

| Issue | Solution | Time |
|-------|----------|------|
| Migration fails | Restore backup, check schema | 5 min |
| Host can't join | Check auth token, restart server | 2 min |
| Participant stuck waiting | Check waiting room query, logs | 5 min |
| Magic link not working | Verify token in DB, check expiry | 3 min |
| Cleanup deletes wrong data | Restore from backup, update filters | 30 min |
| Performance slow | Check DB indexes, add monitoring | 10 min |

---

**End of Quick Reference**

*Keep this document open while implementing the changes.*
