/**
 * AUTH + JOIN FLOW TEST
 * 
 * What this checks:
 *   1. Auth token is sent and accepted by the server (socket connects)
 *   2. Bad token is rejected (socket gets disconnect / error)
 *   3. Host can join a meeting   → receives  host:join_success
 *   4. Participant knocks         → receives  participant:knock_accepted  (if auto-approve is ON)
 *                                    OR stays silent               (if auto-approve is OFF / commented out)
 * 
 * HOW TO USE:
 *   1. Make sure your server is running:  npm run dev  (or  node dist/index.js)
 *   2. Set MEETING_ID, TOKEN_HOST, TOKEN_PARTICIPANT below
 *   3. Run:  node tests/authJoinTest.js
 */

const { io } = require("socket.io-client");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SERVER_URL   = "http://localhost:4000";
const MEETING_ID   = "GiO2CrzuB6PpfUzKQie-NnwW";   // ← your meeting id

const TOKEN_HOST   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJOM1ZpUnZZNnRFNHVIZmw3Rm04cHRfcFIiLCJlbWFpbCI6Imhvc3RAZ21haWwuY29tIiwiZGlzcGxheU5hbWUiOiJob3N0Iiwicm9sZSI6IkhPU1QiLCJpYXQiOjE3NzY0MDQ3NDUsImV4cCI6MTc3NzAwOTU0NX0.rbrQek5KqlWA9SBBUrBhhppo66AjQ87SEC7Rtg6J3rw";
const TOKEN_PART   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4Q2xuYjJmODdfRU5LRzVPZXNabVhTazQiLCJlbWFpbCI6InN0YWZmQGdtYWlsLmNvbSIsImRpc3BsYXlOYW1lIjoic3RhZmYiLCJyb2xlIjoiUEFSVElDSVBBTlQiLCJpYXQiOjE3NzY0MDQ4MTAsImV4cCI6MTc3NzAwOTYxMH0.p-8CbwGjGNsYVwgizsg0G055kwx3VPhEvIA3vDvMklI";
const TOKEN_BAD    = "this.is.not.valid";
// ─────────────────────────────────────────────────────────────────────────────

// Small helper: decode JWT payload without verifying (just for log labels)
function jwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); }
  catch { return {}; }
}

// Result tracker
const results = {};
function pass(label)         { results[label] = "✅ PASS"; console.log(`✅ PASS  ${label}`); }
function fail(label, reason) { results[label] = `❌ FAIL  ${reason}`; console.log(`❌ FAIL  ${label} — ${reason}`); }
function info(msg)           { console.log(`   ℹ️  ${msg}`); }

// ─── TEST 1: Bad token is rejected ───────────────────────────────────────────
function testBadAuth() {
  return new Promise((resolve) => {
    const s = io(SERVER_URL, { auth: { token: TOKEN_BAD }, reconnection: false });

    const timer = setTimeout(() => {
      // Server may just silently drop or not emit anything — that counts too
      fail("BAD_TOKEN_REJECTED", "no disconnect or error within 3 s");
      s.disconnect();
      resolve();
    }, 3000);

    s.on("connect_error", (err) => {
      clearTimeout(timer);
      pass("BAD_TOKEN_REJECTED");
      info(`connect_error: ${err.message}`);
      s.disconnect();
      resolve();
    });

    s.on("connect", () => {
      // If server lets a bad token connect, listen for an auth error event
      s.on("error", (data) => {
        clearTimeout(timer);
        pass("BAD_TOKEN_REJECTED");
        info(`server error: ${JSON.stringify(data)}`);
        s.disconnect();
        resolve();
      });
    });
  });
}

// ─── TEST 2 & 3: Good token connects, host joins, participant knocks ──────────
function testGoodFlow() {
  return new Promise((resolve) => {
    const hostPayload = jwtPayload(TOKEN_HOST);
    const partPayload = jwtPayload(TOKEN_PART);
    info(`Host token user: ${hostPayload.displayName} (${hostPayload.userId})`);
    info(`Part token user: ${partPayload.displayName} (${partPayload.userId})`);

    const host = io(SERVER_URL, { auth: { token: TOKEN_HOST }, reconnection: false });
    const part = io(SERVER_URL, { auth: { token: TOKEN_PART }, reconnection: false });

    let hostConnected = false;
    let partConnected = false;
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      host.disconnect();
      part.disconnect();
      resolve();
    }

    // Timeout safety net
    setTimeout(() => {
      if (!hostConnected) fail("HOST_CONNECTED",   "no connect within 4 s");
      if (!partConnected) fail("PART_CONNECTED",   "no connect within 4 s");
      finish();
    }, 4000);

    // ── HOST ──────────────────────────────────────────────────────────────
    host.on("connect_error", (err) => {
      fail("HOST_CONNECTED", err.message);
      finish();
    });

    host.on("connect", () => {
      hostConnected = true;
      pass("HOST_CONNECTED");
      info(`Host socket id: ${host.id}`);

      host.emit("meeting:join", {
        meetingId:         MEETING_ID,
        participantId:     hostPayload.userId,
        displayName:       hostPayload.displayName,
        preferredLanguage: "en-US"
      });
    });

    host.on("host:join_success", (data) => {
      pass("HOST_JOIN_SUCCESS");
      info(`host:join_success payload: ${JSON.stringify(data)}`);
    });

    host.on("host:join_error", (data) => {
      fail("HOST_JOIN_SUCCESS", `got host:join_error — ${JSON.stringify(data)}`);
    });

    // ── PARTICIPANT ───────────────────────────────────────────────────────
    part.on("connect_error", (err) => {
      fail("PART_CONNECTED", err.message);
    });

    part.on("connect", () => {
      partConnected = true;
      pass("PART_CONNECTED");
      info(`Part socket id: ${part.id}`);

      // Wait a moment so host has time to join first
      setTimeout(() => {
        part.emit("participant:knock", {
          meetingId:         MEETING_ID,
          participantId:     partPayload.userId,
          displayName:       partPayload.displayName,
          preferredLanguage: "hi-IN"
        });
        info("participant:knock emitted");
      }, 1000);
    });

    // Auto-approve ON  → participant gets knock_accepted straight away
    part.on("participant:knock_accepted", (data) => {
      pass("PART_AUTO_ADMITTED");
      info(`knock_accepted payload: ${JSON.stringify(data)}`);
      finish();
    });

    // Auto-approve OFF → participant gets nothing (the waiting-room block is commented out)
    //   We give it 3 s after connect; if nothing arrives we note it's expected.
    setTimeout(() => {
      if (!done && partConnected) {
        results["PART_AUTO_ADMITTED"] = "⚠️  SKIP — participant:knock emitted but no knock_accepted received (auto-approve appears OFF)";
        console.log("⚠️  SKIP  PART_AUTO_ADMITTED — auto-approve is commented out on the server, participant sits in limbo (expected)");
        finish();
      }
    }, 3500);

    part.on("participant:knock_denied", (data) => {
      fail("PART_AUTO_ADMITTED", `knock_denied — ${JSON.stringify(data)}`);
      finish();
    });

    part.on("error", (data) => {
      info(`Part server error: ${JSON.stringify(data)}`);
    });
  });
}

// ─── RUNNER ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n══════════════════════════════════════");
  console.log(" AUTH + JOIN TEST");
  console.log(`  Server : ${SERVER_URL}`);
  console.log(`  Meeting: ${MEETING_ID}`);
  console.log("══════════════════════════════════════\n");

  console.log("── TEST 1: bad token ──");
  await testBadAuth();

  console.log("\n── TEST 2+3: good tokens → host join → participant knock ──");
  await testGoodFlow();

  console.log("\n══════════════════════════════════════");
  console.log(" SUMMARY");
  for (const [label, result] of Object.entries(results)) {
    console.log(`  ${result.padEnd(10)} ${label}`);
  }
  console.log("══════════════════════════════════════\n");

  process.exit(0);
})();