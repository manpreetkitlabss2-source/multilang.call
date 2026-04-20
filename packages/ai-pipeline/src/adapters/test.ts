import express from "express";
import multer from "multer"; // 1. Import multer
import { deepgramAdapter } from "./deepgramAdapter.js";

const router = express.Router();

// 2. Setup multer to store the file in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });

// 3. Update the route to use the 'audio' key from your form-data
router.post("/test-stt-file", upload.single("audio"), async (req, res) => {
  try {
    // 4. Extract the buffer from req.file and the language from req.body
    const audioBuffer = req.file?.buffer; 
    const { sourceLanguage } = req.body;

    if (!audioBuffer) {
      return res.status(400).json({ error: "No audio file found in the 'audio' key." });
    }

    // 5. Pass the buffer directly to your adapter (Business logic stays intact)
    const text = await deepgramAdapter.transcribeAudio(
      audioBuffer,
      sourceLanguage || "en-US"
    );

    res.json({
      success: true,
      transcript: text,
    });
  } catch (err) {
    console.error("Route Error:", err);
    res.status(500).json({ error: "STT processing failed" });
  }
});

export default router;