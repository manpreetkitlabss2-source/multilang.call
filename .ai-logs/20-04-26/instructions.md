# Amazon Q Agent Instructions — Codebase Cleanup
> **Project:** `multilang-call` (Turborepo monorepo — server / client / ai-pipeline / shared)
> **Goal:** Remove all duplicate `.js` / `.ts` / `.tsx` file pairs, fix the root `Dockerfile`, and apply best-practice corrections — **without changing any business logic.**
> You may run commands directly. No need to ask for permission before executing shell commands.

---

## 0. Context: What Happened

Codex generated **both TypeScript source files (`.ts` / `.tsx`) and pre-compiled JavaScript copies (`.js`) inside `src/` for every single file in the client package.** These `.js` files are not build output — they were mistakenly committed alongside the original TypeScript sources, causing every module to exist twice. The project already uses Vite + tsc for building; the `.js` copies are dead weight and a future maintenance hazard.

Additionally the root `Dockerfile` (at `shell/Dockerfile`) was generated as a **markdown explanation document** by a previous AI session — it contains prose text and code-fence blocks, not actual Dockerfile instructions. It must be replaced with a real Dockerfile.

---

## 1. Critical Issue: Duplicate JS/TS Files in `packages/client/src/`

### What to delete

Every file below has a `.ts` / `.tsx` original AND a compiled `.js` copy sitting **in the same `src/` directory**. Delete all `.js` / `.jsx` copies. Keep only the TypeScript originals.

**`packages/client/src/`** — delete these exact files:

```
src/App.js
src/main.js

src/lib/api.js
src/lib/audioWorklet.js
src/lib/socketEvents.js

src/store/authStore.js
src/store/meetingStore.js
src/store/translationStore.js
src/store/uiStore.js

src/hooks/useAudioPlayer.js
src/hooks/useAuth.js
src/hooks/useSpeechRecognition.js
src/hooks/useSocket.js
src/hooks/useTranslatedAudio.js
src/hooks/useVAD.js
src/hooks/useWebRTC.js

src/components/AudioTestInjector.js
src/components/LanguageSelector.js
src/components/MeetingControls.js
src/components/MeetingControls.test.js
src/components/ProtectedRoute.js
src/components/SpeakingIndicator.js
src/components/TranslationOverlay.js
src/components/TranslationStatus.js
src/components/VideoGrid.js
src/components/VideoTile.js
src/components/WaitingRoom.js

src/pages/AuthPage.js
src/pages/Home.js
src/pages/HomePage.js
src/pages/Join.js
src/pages/Meet.js
src/pages/MeetingPage.js
src/pages/ScheduleLanding.js
src/pages/SchedulePage.js

src/test/setup.js
```

**Run this command to delete them all at once:**

```bash
cd packages/client
find src -name "*.js" -not -path "*/node_modules/*" -delete
```

Verify nothing important was removed:

```bash
find src -type f | sort
```

Expected: only `.ts`, `.tsx`, `.css` files remain in `src/`.

---

## 2. Fix the `vite.config` Duplication

There are two Vite config files: `vite.config.ts` (original) and `vite.config.js` (generated copy). The `.js` copy has one extra item the `.ts` does not — the `allowedHosts` array for a Cloudflare tunnel. That setting belongs in the `.ts` source.

**Step 1 — Delete `packages/client/vite.config.js`:**

```bash
rm packages/client/vite.config.js
```

**Step 2 — Merge `allowedHosts` into `packages/client/vite.config.ts`:**

Replace the contents of `packages/client/vite.config.ts` with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true   // allows any host in dev; tighten to specific domains in production
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
```

> **Why `allowedHosts: true` instead of the hard-coded Cloudflare domain?** The tunnel URL is ephemeral — it changes every session. Setting `true` allows any host during development without committing a stale URL. For production this key is irrelevant (Vite's dev server is not used).

---

## 3. Fix Stub Pages — `HomePage.tsx` and `MeetingPage.tsx`

These two files are **re-export stubs** (`export { default } from "./Home"`) that were duplicated by Codex. They serve no purpose since routes in `App.tsx` already import `Home` and `Meet` directly.

**Check `App.tsx` — it imports `Home` and `Meet`, NOT `HomePage` or `MeetingPage`:**

```bash
grep -n "HomePage\|MeetingPage" packages/client/src/App.tsx
```

If that returns nothing (it should), the stubs are unused. Delete them:

```bash
rm packages/client/src/pages/HomePage.tsx
rm packages/client/src/pages/MeetingPage.tsx
```

---

## 4. Fix the Root `Dockerfile`

The file at `Dockerfile` (repo root) is **not a valid Dockerfile** — it is a markdown prose document from a previous AI session explaining how to write Dockerfiles. Replace it entirely.

```bash
cat > Dockerfile << 'EOF'
# ──────────────────────────────────────────────
# Build Stage
# ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package*.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json        packages/shared/package.json
COPY packages/server/package.json        packages/server/package.json
COPY packages/ai-pipeline/package.json   packages/ai-pipeline/package.json
COPY packages/client/package.json        packages/client/package.json

RUN npm ci

# Copy source
COPY packages/shared      packages/shared
COPY packages/server      packages/server
COPY packages/ai-pipeline packages/ai-pipeline
COPY packages/client      packages/client

# Build all packages in dependency order via Turborepo
RUN npm run build

# ──────────────────────────────────────────────
# Server Runtime Image
# ──────────────────────────────────────────────
FROM node:20-alpine AS server

WORKDIR /app

COPY --from=builder /app/node_modules                          ./node_modules
COPY --from=builder /app/packages/server/dist                  ./packages/server/dist
COPY --from=builder /app/packages/server/package.json          ./packages/server/package.json
COPY --from=builder /app/packages/server/prisma                ./packages/server/prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
EOF
```

> **Note:** The `docker-compose.yml` (which you must NOT modify per the user's request) only defines `mysql` and `redis` infrastructure services. The application services (server, ai-pipeline, client) are run separately. The root `Dockerfile` above builds the monorepo and targets the `server` as the default runtime. If separate images are needed for `ai-pipeline` and `client`, add them as additional `FROM … AS` stages following the same pattern.

---

## 5. Best-Practice Fixes in Existing Code

These changes fix real issues without altering business logic.

### 5a. `packages/client/src/hooks/useSocket.ts` — remove `console.log` noise

The socket hook logs every single event with `onAny`. This is debug code that should not be in production. Remove the `onAny` listener:

```ts
// DELETE this block:
nextSocket.onAny((event, ...args) => {
  console.log("📩 EVENT:", event, args);
});
```

Also remove the `console.log` inside the `connect` handler and replace the `console.warn` with a proper silent guard (the warn itself is fine to keep for visibility, but the connect log is noise):

```ts
// Change:
nextSocket.on("connect", () => {
  console.log("✅ CONNECTED:", nextSocket.id);
  setRetryCount(0);
});
// To:
nextSocket.on("connect", () => {
  setRetryCount(0);
});
```

### 5b. `packages/client/src/hooks/useAuth.ts` — stale key cleanup

The `logout` and catch block both call `localStorage.removeItem("mlc_token")` AND `clearAuthStorage()`. But `clearAuthStorage()` removes `auth_user` and `auth_token` — NOT `mlc_token`. The `mlc_token` key is the Zustand persisted store key (set in `authStore.ts` as `name: "mlc_token"`). `clearAuth()` already clears Zustand state, but the persisted localStorage entry for `mlc_token` is only removed by calling `localStorage.removeItem("mlc_token")` explicitly.

This is actually correct behaviour — just confusingly named. Add a comment so it is clear:

```ts
// "mlc_token" is the Zustand-persist key — clearAuth() resets in-memory state
// but does not remove the persisted localStorage entry, so we do it manually.
localStorage.removeItem("mlc_token");
clearAuthStorage(); // removes auth_user + auth_token (legacy keys)
```

Apply this comment in both the `logout` function and the `.catch()` block inside the `useEffect`.

### 5c. `packages/server/src/index.ts` — CORS is too permissive

```ts
// Change:
app.use(cors());
// and:
cors: { origin: "*" }

// To (read from environment):
const allowedOrigin = process.env.CLIENT_URL ?? "http://localhost:3000";
app.use(cors({ origin: allowedOrigin, credentials: true }));
// ...
cors: { origin: allowedOrigin, credentials: true }
```

Add `CLIENT_URL` to `.env.example` at the repo root:

```
CLIENT_URL=http://localhost:3000
```

### 5d. `packages/client/src/pages/Meet.tsx` — duplicate route

`App.tsx` defines both `/meet/:meetingId` and `/meeting/:meetingId` pointing to the same `<Meet>` component. This is intentional for backward-compat. Add a comment in `App.tsx` to make this obvious:

```tsx
{/* /meeting/:meetingId is kept for backward-compat with older invite links */}
<Route
  path="/meeting/:meetingId"
  element={<ProtectedRoute><Meet /></ProtectedRoute>}
/>
```

---

## 6. Verification Checklist

After all changes, run these commands and confirm they pass:

```bash
# 1. No .js files left in src/ (only .ts/.tsx/.css)
find packages/client/src -name "*.js" | wc -l
# Expected: 0

# 2. TypeScript build still works
npm run build

# 3. No references to deleted HomePage / MeetingPage stubs
grep -r "HomePage\|MeetingPage" packages/client/src/
# Expected: no output (or only within the deleted files themselves)

# 4. Root Dockerfile is valid syntax
docker build --no-cache --target builder . 2>&1 | tail -5
# Expected: build succeeds or fails only on missing env vars, not syntax errors

# 5. Dev server starts
npm run dev
```

---

## 7. What NOT to Change

- `docker-compose.yml` — user has explicitly set this up for their needs; do not touch it.
- All business logic in `packages/server/src/` (routes, services, socket handlers).
- All business logic in `packages/ai-pipeline/src/` (STT → translate → TTS pipeline).
- `packages/shared/` — shared types and constants.
- `packages/client/src/pages/Meet.tsx` — the main meeting page; it is complex and correct.
- Prisma schema and generated client.
- Any `.env` or `.env.example` files other than additions noted above.

---

## Summary of Files Touched

| Action | Path |
|--------|------|
| **Delete** (bulk) | `packages/client/src/**/*.js` (all 30+ compiled copies) |
| **Delete** | `packages/client/vite.config.js` |
| **Delete** | `packages/client/src/pages/HomePage.tsx` |
| **Delete** | `packages/client/src/pages/MeetingPage.tsx` |
| **Replace** | `Dockerfile` (root) — replace prose with real Dockerfile |
| **Edit** | `packages/client/vite.config.ts` — add `allowedHosts: true` |
| **Edit** | `packages/client/src/hooks/useSocket.ts` — remove debug logs |
| **Edit** | `packages/client/src/hooks/useAuth.ts` — add clarifying comments |
| **Edit** | `packages/server/src/index.ts` — env-driven CORS |
| **Edit** | `packages/client/src/App.tsx` — add backward-compat comment |
| **Edit** | `.env.example` (root) — add `CLIENT_URL` |
