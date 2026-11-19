import fs from "fs";
import FormData from "form-data";
import axios from "axios";

export async function transcribeAudioBuffer({ buffer, mimeType, language, prompt }) {
  try {
    const tempFilePath = `/tmp/audio-${Date.now()}.m4a`;
    fs.writeFileSync(tempFilePath, buffer);

    const form = new FormData();
    form.append("file", fs.createReadStream(tempFilePath));
    form.append("model", "whisper-large-v3");
    form.append("language", language || "vi");
    if (prompt) form.append("prompt", prompt);

    const response = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      }
    );

    fs.unlinkSync(tempFilePath);
    return { text: response.data.text, language, duration: 0, segments: [] };
  } catch (error) {
    console.error("Lỗi Groq:", error.response?.data || error.message);
    return { error: "Không thể nhận diện giọng nói", code: "API_ERROR" };
  }
}