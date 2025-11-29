import { Router } from "express";
const router = Router();

router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim() === "") {
      return res.json({ answer: "Please provide a question." });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({ answer: "Backend error: Missing GEMINI_API_KEY." });
    }

    // IMPORTANT: use gemini-pro (it works everywhere)
    const url =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
  apiKey;


    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }]
      })
    });

    const data = await response.json();
    console.log("GEMINI RAW:", data);

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      data.promptFeedback?.blockReason ||
      "I could not generate a response.";

    res.json({ answer: text });
  } catch (error: any) {
    console.error("Gemini backend error:", error);
    res.json({ answer: "Gemini backend error: " + error.message });
  }
});

export default router;
  