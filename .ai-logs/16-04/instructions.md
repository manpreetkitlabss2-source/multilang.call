# Bug Fix Instructions — Shell (Multilang Call App)

This document lists every confirmed bug found in the codebase, grouped by area, with exact file paths, root cause analysis, and step-by-step fix instructions for each one. Work through them in order — earlier fixes unblock later ones.

---

## BUG 1 — Home page CTA button says "Sign in as host" for everyone (including logged-in participants)

**Files:** `packages/client/src/pages/Home.tsx`

**Root cause:** The button label ternary only checks `user?.role === "HOST"`. A logged-in PARTICIPANT sees "Sign in as host" instead of something meaningful. Clicking it also sends a PARTICIPANT to `/auth` even though they are already authenticated — the guard `user?.role !== "HOST"` kicks them out regardless of login state.

**What to fix:**

1. In `handleCreateMeeting`, change the redirect guard so it only redirects when the user is **not logged in at all**. If the user is logged in but is a PARTICIPANT, show a different message (not redirect to auth).

```tsx
// BEFORE
const handleCreateMeeting = async () => {
  if (!token || user?.role !== "HOST") {
    navigate("/auth", { ... });
    return;
  }
  ...
};

// AFTER
const handleCreateMeeting = async () => {
  if (!token) {
    // Not logged in at all — send to auth
    navigate("/auth", { state: { redirectTo: "/", redirectState: null } });
    return;
  }
  if (user?.role !== "HOST") {
    // Logged in but not a host — do nothing / show a toast, not a redirect
    return;
  }
  ...
};
```

2. Fix the button label ternary to cover all three states:

```tsx
// BEFORE
{isSubmitting ? "Creating meeting..." : user?.role === "HOST" ? "Create meeting" : "Sign in as host"}

// AFTER
{isSubmitting
  ? "Creating meeting..."
  : !user
    ? "Sign in to continue"
    : user.role === "HOST"
      ? "Create meeting"
      : "Only hosts can create meetings"}
```

3. Fix the status text in the info box:

```tsx
// BEFORE
{user
  ? `Signed in as ${user.displayName} (${user.role.toLowerCase()})`
  : "Sign in as a host to create and schedule meetings."}

// AFTER
{user
  ? `Signed in as ${user.displayName} (${user.role.toLowerCase()})`
  : "Sign in to create or join meetings."}
```

---

## BUG 2 — After page refresh inside a meeting, the meeting disappears / user is stuck

**Files:** `packages/client/src/store/authStore.ts`, `packages/client/src/hooks/useAuth.ts`, `packages/client/src/components/ProtectedRoute.tsx`, `packages/client/src/pages/Meet.tsx`

**Root cause (multi-part):**

**2a.** `authStore` persists only the `token` to localStorage (via `partialize`). After a refresh the `user` object is `null` but `token` is restored. `useAuth` fires a `/auth/me` fetch to restore the user — but `Meet.tsx` also fires its own fetch for the meeting data in a separate `useEffect` that depends on `token`. Since `user` is not yet restored when `Meet.tsx` mounts, `isHost` evaluates to `false`, and the meeting join socket event fires as a participant knock instead of a host join — before the user is confirmed. This causes hosts to end up in the waiting room on refresh.

**2b.** `ProtectedRoute` lets the user through as soon as `token` exists, without waiting for the `/auth/me` call to complete and populate `user`. So `Meet.tsx` renders with `user = null`, computes `isHost = false`, and sends the wrong socket event.

**2c.** `Meet.tsx`'s join logic uses `hasSentJoinRef` to prevent double-emitting. On refresh, it fires once with `user = null` (wrong), then never fires again even after the user is restored — because `hasSentJoinRef.current` is already `true`.

**Fix 2a + 2b — Make ProtectedRoute wait for user hydration:**

```tsx
// packages/client/src/components/ProtectedRoute.tsx
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);

  // No token at all — redirect to auth
  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  // Token exists but user not yet hydrated (e.g. page refresh)
  if (!user || isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <section className="w-full rounded-[36px] bg-white/90 p-8 text-center shadow-panel">
          <p className="inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            Restoring session
          </p>
          <h1 className="mt-4 text-2xl font-bold text-ink">Checking your account</h1>
        </section>
      </main>
    );
  }

  return <>{children}</>;
};
```

**Fix 2c — Reset `hasSentJoinRef` when user changes so the join fires again correctly:**

In `Meet.tsx`, change the dependency array of the join useEffect to also watch `user?.id`:

```tsx
// In Meet.tsx — the socket join useEffect
// BEFORE: hasSentJoinRef is never reset
useEffect(() => {
  if (!socket || !meeting || !user || hasSentJoinRef.current) {
    return;
  }
  hasSentJoinRef.current = true;
  ...
}, [displayName, isHost, locationState.inviteToken, meeting, meetingId, preferredLanguage, setJoinDeniedMessage, setWaitingForAdmission, socket, user]);

// AFTER: reset the ref when user.id changes so re-auth triggers a fresh join
useEffect(() => {
  hasSentJoinRef.current = false;
}, [user?.id]);

// Keep the existing join useEffect as-is — resetting the ref above allows it to re-run
```

---

## BUG 3 — Socket middleware rejects valid tokens with "Invalid token" error, kicking authenticated users

**Files:** `packages/server/src/socket/index.ts`

**Root cause:** The socket middleware calls `next(new Error("Invalid token"))` when `verifyToken` throws. Socket.IO treats this as a connection rejection — the client never connects. However `useSocket` in the client does not handle this error case; the socket just silently fails, leaving the user unable to join any meeting.

Additionally, if a token is expired (common after the 7d default), the user gets no error message — they just sit on the meeting page with nothing happening.

**Fix:**

1. In `packages/server/src/socket/index.ts`, distinguish between "no token" (allow as guest) and "bad token" (reject with clear message). Currently a missing token allows through but an invalid token rejects — that is fine. But make the error message clearer:

```ts
// BEFORE
} catch {
  return next(new Error("Invalid token"));
}

// AFTER
} catch {
  return next(new Error("AUTH_EXPIRED")); // Use a code the client can match
}
```

2. In `packages/client/src/hooks/useSocket.ts`, listen for connection errors and handle auth expiry:

```ts
// AFTER — add error handling
useEffect(() => {
  const nextSocket = io(socketUrl, {
    autoConnect: true,
    auth: { token: token ?? "" }
  });

  nextSocket.on("connect_error", (err) => {
    if (err.message === "AUTH_EXPIRED" || err.message === "Invalid token") {
      // Token is invalid — clear auth and let ProtectedRoute redirect
      useAuthStore.getState().clearAuth();
      localStorage.removeItem("mlc_token");
    }
  });

  setSocket(nextSocket);
  return () => { nextSocket.disconnect(); };
}, [token]);
```

---

## BUG 4 — `authStore` only persists `token` but `/auth/me` response shape mismatch

**Files:** `packages/server/src/routes/auth.ts`, `packages/client/src/hooks/useAuth.ts`

**Root cause:** `GET /auth/me` returns `req.user` which is the raw `JwtPayload` object (has `userId`, not `id`). But the client expects an `AuthUser` object (has `id`, `email`, `displayName`, `role`). The `setAuth(validatedUser, token)` call stores a mismatched object — so `user.id` is undefined after restore, `isHost` computation breaks, and `participantIdRef` gets a wrong value.

**Fix in `packages/server/src/routes/auth.ts`:**

```ts
// BEFORE
app.get("/auth/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.json(req.user); // Returns JwtPayload shape, not AuthUser shape
});

// AFTER — map to AuthUser shape
app.get("/auth/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.json({
    id: req.user.userId,       // JwtPayload has userId, AuthUser has id
    email: req.user.email,
    displayName: req.user.displayName,
    role: req.user.role
  });
});
```

---

## BUG 5 — Meet.tsx fetches meeting data only when `token` exists, but skips when `token` is null even for participants who may have just logged in

**Files:** `packages/client/src/pages/Meet.tsx`

**Root cause:** The meeting fetch `useEffect` has `[meetingId, token]` as its dependency array and early-returns when `!token`. Participants without a token (guests who log in mid-flow) never load the meeting. Also, when `token` changes from null to a value (post-login), the effect re-runs correctly — but `hasSentJoinRef.current` is already `true` if a prior render had set it (see Bug 2c). This is the same race that causes post-refresh meeting loss.

**Fix:** Ensure meeting data fetch does not gate on `token` being truthy at component mount — it should also work when token loads asynchronously. Move the meeting fetch to depend on `user` (which is only populated after token validation) instead of raw `token`:

```tsx
// BEFORE
useEffect(() => {
  if (!token) { return; }
  fetch(`${apiUrl}/meetings/${meetingId}`, { headers: { ...createAuthHeaders(token) } })
  ...
}, [meetingId, token]);

// AFTER — wait for user to be hydrated (token + user both present)
useEffect(() => {
  if (!token || !user) { return; }
  fetch(`${apiUrl}/meetings/${meetingId}`, { headers: { ...createAuthHeaders(token) } })
  ...
}, [meetingId, token, user]);
```

Since ProtectedRoute (after Bug 2 fix) now blocks rendering until `user` is populated, this effectively means the meeting fetch only fires when auth is fully ready.

---

## BUG 6 — `useSocket` creates a new socket every time `token` changes, including during normal session restore, causing duplicate socket connections

**Files:** `packages/client/src/hooks/useSocket.ts`

**Root cause:** `useSocket` has `[token]` as its dependency. During a page refresh, `token` starts as the persisted value (non-null), triggers socket creation immediately, then `useAuth` fires `/auth/me` and calls `setAuth(user, token)` — which doesn't change `token` but does update state. However, on auth *failure*, `clearAuth()` sets `token` to null, then the next render has no token, and `useSocket` creates another socket with an empty token string. This can produce a brief double-connect or a useless unauthenticated socket being stored in state.

**Fix:** Add a `stable` ref so the socket is not recreated if the token value itself hasn't actually changed:

```ts
// packages/client/src/hooks/useSocket.ts
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export const useSocket = () => {
  const token = useAuthStore((state) => state.token);
  const [socket, setSocket] = useState<Socket | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Don't recreate the socket if the token hasn't actually changed
    if (token === tokenRef.current) return;
    tokenRef.current = token;

    const nextSocket = io(socketUrl, {
      autoConnect: true,
      auth: { token: token ?? "" }
    });

    nextSocket.on("connect_error", (err) => {
      if (err.message === "AUTH_EXPIRED" || err.message === "Invalid token") {
        useAuthStore.getState().clearAuth();
        localStorage.removeItem("mlc_token");
      }
    });

    setSocket((prev) => {
      prev?.disconnect();
      return nextSocket;
    });

    return () => {
      nextSocket.disconnect();
    };
  }, [token]);

  return socket;
};
```

---

## BUG 7 — `Meet.tsx` meeting error screen has no way for the user to go back or retry

**Files:** `packages/client/src/pages/Meet.tsx`

**Root cause:** When `meetingError` is set, the error UI renders but provides no navigation — no "go home" button, no retry. The user is stuck and must use the browser back button.

**Fix:** Add navigation options to the error state:

```tsx
// BEFORE
if (meetingError) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <section className="rounded-[36px] bg-white/90 p-8 shadow-panel">
        <h1 className="text-3xl font-bold text-ink">Meeting unavailable</h1>
        <p className="mt-3 text-sm text-rose-600">{meetingError}</p>
      </section>
    </main>
  );
}

// AFTER
if (meetingError) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <section className="rounded-[36px] bg-white/90 p-8 shadow-panel">
        <h1 className="text-3xl font-bold text-ink">Meeting unavailable</h1>
        <p className="mt-3 text-sm text-rose-600">{meetingError}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Back to home
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-semibold text-ink"
          >
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
```

---

## BUG 8 — `handleSignIn` and `handleRegister` in AuthPage do not catch errors, causing unhandled promise rejections on bad credentials

**Files:** `packages/client/src/pages/AuthPage.tsx`

**Root cause:** Both handlers call `await login(...)` or `await register(...)` but do not wrap in try/catch. The `login`/`register` functions re-throw errors after calling `setError`. When `login` throws, `handleSignIn` propagates the error uncaught — React logs an unhandled rejection, and `navigate(redirectTo)` is also called after the throw (in the async function cleanup), which can cause a navigation to happen even after a failed login if the error is swallowed by the event handler.

**Fix:**

```tsx
// BEFORE
const handleSignIn = async () => {
  await login(signInEmail, signInPassword);
  navigate(redirectTo, { state: redirectState });
};

// AFTER
const handleSignIn = async () => {
  try {
    await login(signInEmail, signInPassword);
    navigate(redirectTo, { state: redirectState });
  } catch {
    // error is already set in store by useAuth.login — do not navigate
  }
};

// Same pattern for handleRegister
const handleRegister = async () => {
  try {
    await register(email, displayName, password, role);
    navigate(redirectTo, { state: redirectState });
  } catch {
    // error already in store
  }
};
```

---

## BUG 9 — `Join.tsx` redirects unauthenticated users to `/auth`, but after login, the meeting join state (`displayName`, `preferredLanguage`, `inviteToken`) is correctly passed via `redirectState` — however `Meet.tsx` does not read from `location.state` when the user lands from that auth redirect

**Files:** `packages/client/src/pages/Meet.tsx`

**Root cause:** `Join.tsx` passes `redirectState` as location state through the auth redirect. After login, `AuthPage` calls `navigate(redirectTo, { state: redirectState })`. `Meet.tsx` reads `location.state` — this is correct. However, if the user refreshes once inside the meeting, `location.state` is lost (browser clears navigation state on hard refresh), so `displayName` falls back to `user?.displayName ?? "Guest"` and `inviteToken` becomes undefined. The participant then sends a knock without an invite token, which may be rejected by the host if the host's waiting room is no longer active.

This is partly a UX issue and partly a data-persistence issue. The fix:

**In `packages/client/src/pages/Meet.tsx`**, persist critical join state to `sessionStorage` when the component first mounts, and restore from there on refresh:

```tsx
// Add near the top of the Meet component, after locationState is derived
useEffect(() => {
  // On first real mount (fromJoin), persist join state for refresh recovery
  if (locationState.fromJoin) {
    sessionStorage.setItem(
      `meeting_join_state_${meetingId}`,
      JSON.stringify({
        displayName: locationState.displayName,
        preferredLanguage: locationState.preferredLanguage,
        inviteToken: locationState.inviteToken
      })
    );
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps

// When deriving displayName and inviteToken, also check sessionStorage as fallback:
const savedJoinState = useMemo(() => {
  const raw = sessionStorage.getItem(`meeting_join_state_${meetingId}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as { displayName?: string; preferredLanguage?: string; inviteToken?: string }; }
  catch { return null; }
}, [meetingId]);

const displayName = locationState.displayName ?? savedJoinState?.displayName ?? user?.displayName ?? "Guest";
// similarly for inviteToken:
const effectiveInviteToken = locationState.inviteToken ?? savedJoinState?.inviteToken ?? null;
```

Update the `PARTICIPANT_KNOCK` emit to use `effectiveInviteToken` instead of `locationState.inviteToken`.

Cleanup the sessionStorage entry when the user leaves:

```tsx
const handleLeave = () => {
  sessionStorage.removeItem(`meeting_join_state_${meetingId}`);
  socket?.disconnect();
  navigate("/");
};
```

---

## BUG 10 — `LANGUAGE_CHANGE` socket event is emitted but the server's `languageHandlers` does not update the socket's room membership

**Files:** `packages/server/src/socket/languageHandlers.ts`

**Root cause:** `LANGUAGE_CHANGE` presumably calls `roomManager.changeLanguage(...)` which correctly updates the Redis entry and language set. However, the socket is joined to room `${meetingId}:${oldLanguage}` at join time (via `socket.join(...)` in `meetingHandlers.ts`) and is never moved to `${meetingId}:${newLanguage}` when the language changes. This means translated audio is still routed to the old language room.

**Fix in `packages/server/src/socket/languageHandlers.ts`:** After calling `roomManager.changeLanguage`, also update the socket room membership:

```ts
// In the LANGUAGE_CHANGE handler
socket.on(SOCKET_EVENTS.LANGUAGE_CHANGE, async ({ meetingId, preferredLanguage }) => {
  const participants = await roomManager.changeLanguage(meetingId, socket.id, preferredLanguage);

  // Also update socket room membership so audio routing is correct
  const allLanguages = ["en", "es", "fr", "de", "pt", "zh", "ja", "ko", "ar", "hi"]; // or pull from SUPPORTED_LANGUAGES constant
  for (const lang of allLanguages) {
    socket.leave(`${meetingId}:${lang}`);
  }
  socket.join(`${meetingId}:${preferredLanguage}`);

  io.to(meetingId).emit(SOCKET_EVENTS.MEETING_STATE, { participants });
});
```

Alternatively, import `SUPPORTED_LANGUAGES` from `@multilang-call/shared` to avoid hardcoding the language list.

---

## BUG 11 — `meetingStore` is not reset between meetings; stale state leaks from one meeting into the next

**Files:** `packages/client/src/store/meetingStore.ts`, `packages/client/src/pages/Meet.tsx`

**Root cause:** `meetingStore` uses plain Zustand without persistence, but it is also never reset when the user navigates away from a meeting. If a user leaves `/meet/abc` and joins `/meet/xyz`, the old `participants`, `waitingParticipants`, `waitingForAdmission`, and `joinDeniedMessage` are all still in state. `Meet.tsx` sets `meetingId` on mount but doesn't clear the rest.

**Fix:** In `Meet.tsx`, add a cleanup useEffect that resets store state on unmount:

```tsx
useEffect(() => {
  return () => {
    // Reset meeting store when leaving the meeting page
    useMeetingStore.setState({
      participants: [],
      waitingParticipants: [],
      waitingForAdmission: false,
      joinDeniedMessage: null,
      isMuted: false,
      meetingId: ""
    });
  };
}, []);
```

Also add a `reset` action to `meetingStore` for cleanliness:

```ts
// In meetingStore.ts — add to the store interface and implementation
reset: () => set({
  meetingId: "",
  participants: [],
  waitingParticipants: [],
  waitingForAdmission: false,
  joinDeniedMessage: null,
  isMuted: false
})
```

---

## Summary of files to edit

| File | Bugs fixed |
|---|---|
| `packages/client/src/pages/Home.tsx` | Bug 1 |
| `packages/client/src/components/ProtectedRoute.tsx` | Bug 2 |
| `packages/client/src/pages/Meet.tsx` | Bug 2, 5, 7, 9, 11 |
| `packages/client/src/hooks/useSocket.ts` | Bug 3, 6 |
| `packages/client/src/pages/AuthPage.tsx` | Bug 8 |
| `packages/client/src/store/meetingStore.ts` | Bug 11 |
| `packages/server/src/routes/auth.ts` | Bug 4 |
| `packages/server/src/socket/index.ts` | Bug 3 |
| `packages/server/src/socket/languageHandlers.ts` | Bug 10 |

---

## Recommended fix order

1. **Bug 4** (auth/me response shape) — all auth restore logic depends on this being correct.
2. **Bug 2** (ProtectedRoute + hasSentJoinRef) — fixes the core "meeting gone on refresh" issue.
3. **Bug 1** (Home CTA label) — quick UI fix, unblocks participants seeing correct messaging.
4. **Bug 8** (AuthPage error handling) — prevents navigation on failed login.
5. **Bug 3 + 6** (socket auth error + dedup) — stabilises socket lifecycle.
6. **Bug 5** (Meet.tsx fetch gate) — depends on Bug 2 fix being in place.
7. **Bug 9** (join state persistence) — improve refresh resilience for participants.
8. **Bug 7** (meeting error screen) — polish.
9. **Bug 10** (language change room) — fixes audio routing regression.
10. **Bug 11** (meetingStore reset) — prevents stale state leaks.