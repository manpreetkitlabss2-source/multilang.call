import express from "express";
import multer from "multer";
import { deepgramAdapter } from "./deepgramAdapter.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/test-stt-file", upload.single("audio"), async (req, res) => {
  try {
    const audioBuffer = req.file?.buffer;
    const { sourceLanguage } = req.body;

    if (!audioBuffer) {
      return res.status(400).json({ error: "No audio file found in the 'audio' key." });
    }

    const text = await deepgramAdapter.transcribeAudio(
      audioBuffer.toString("base64"),
      sourceLanguage || "en-US"
    );

    res.json({
      success: true,
      transcript: text
    });
  } catch (err) {
    console.error("Route Error:", err);
    res.status(500).json({ error: "STT processing failed" });
  }
});

export default router;
