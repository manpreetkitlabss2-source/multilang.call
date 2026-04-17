const { io } = require("socket.io-client");
const fs = require("fs");

// CONFIG
const URL = "http://localhost:4000";
const MEETING_ID = "test-meeting";

const TOKEN_1 = "PASTE_VALID_TOKEN_1"; // host
const TOKEN_2 = "PASTE_VALID_TOKEN_2"; // participant

// Load audio file
const audioBuffer = fs.readFileSync("./test-audio.wav");
const base64Audio = audioBuffer.toString("base64");

// Create sockets
const sender = io(URL, {
  auth: { token: TOKEN_1 }
});

const receiver = io(URL, {
  auth: { token: TOKEN_2 }
});

// Receiver listens to everything
receiver.onAny((event, data) => {
  console.log("📥 RECEIVED EVENT:", event);
  console.log(data);
});

// ✅ HOST FLOW (create + join)
sender.on("connect", () => {
  console.log("✅ Sender (Host) connected");

  // Step 1: Create meeting
  sender.emit("meeting:create", {
    meetingId: MEETING_ID,
    hostLanguage: "en-US"
  });

  console.log("🛠️ Creating meeting...");

  // Step 2: Join as host
  setTimeout(() => {
    sender.emit("meeting:join", { meetingId: MEETING_ID });
    console.log("👤 Host joining meeting...");
  }, 500);
});

// ✅ RECEIVER FLOW (join only)
receiver.on("connect", () => {
  console.log("✅ Receiver connected");

  setTimeout(() => {
    receiver.emit("meeting:join", { meetingId: MEETING_ID });
    console.log("👥 Receiver joining meeting...");
  }, 1000);
});

// ✅ SEND AUDIO AFTER BOTH JOINED
setTimeout(() => {
  console.log("🎤 Sending audio...");

  sender.emit("audio:stream", {
    meetingId: MEETING_ID,
    audioBase64: base64Audio,
    sourceLanguage: "en-US",
    targetLanguages: ["hi-IN"]
  });

}, 3000);