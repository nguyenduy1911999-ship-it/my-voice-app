import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { registerOAuthRoutes } from "./oauth.js";
import { registerStorageProxy } from "./storageProxy.js";
import { appRouter } from "./routers.js";
import { createContext } from "./context.js";
import { createCorsMiddleware } from "./cors.js";
import { clearLegacySessionCookie } from "./cookies.js";
import { transcribeAudioBuffer } from "./voiceTranscription.js";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  const transcribeLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 10,             
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Quá nhiều yêu cầu, vui lòng thử lại sau." },
  });

  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 },
  });

  app.post(
    "/api/voice/transcribe",
    transcribeLimiter,
    audioUpload.single("file"),
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: "Audio file is required" });
        return;
      }

      const language =
        req.body && typeof req.body.language === "string"
          ? req.body.language
          : "en";
      const prompt =
        req.body && typeof req.body.prompt === "string"
          ? req.body.prompt
          : undefined;

      try {
        const result = await transcribeAudioBuffer({
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          language,
          prompt,
        });

        if ("error" in result) {
          const status = result.code === "FILE_TOO_LARGE" ? 413 : 502;
          res.status(status).json({
            error: result.error || "Xử lý âm thanh thất bại",
            code: result.code,
          });
          return;
        }

        res.json({
          text: result.text,
          language: result.language,
          duration: result.duration,
          segments: result.segments,
        });
      } catch (err) {
        console.error("[api] transcribe error:", err);
        res.status(500).json({ error: "Lỗi máy chủ nội bộ" });
      }
    }
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.use((err, _req, res, _next) => {
    console.error("[api] unhandled error:", err);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Lỗi máy chủ nội bộ" });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] server listening on 0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("[api] server failed to start:", err);
  process.exit(1);
});