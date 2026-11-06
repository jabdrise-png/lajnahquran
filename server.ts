import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { processInvitationPayload } from "./api/invitations";
import { processIntegrationSecrets } from "./api/integrations";
import { processTelegramNotification } from "./api/notify/telegram";
import { processWhatsAppNotification } from "./api/notify/whatsapp";
import { processTelegramWebhookRegister } from "./api/telegram-webhook/register";
import telegramWebhookHandler from "./api/telegram-webhook";
import { processChatRequest } from "./api/chat";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Request correlation ID and sanitized observability middleware
  app.use((req, res, next) => {
    const correlationId = (req.headers["x-request-id"] as string) || randomUUID();
    res.setHeader("X-Request-ID", correlationId);
    (req as any).id = correlationId;

    // CORS headers for deployment compatibility
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    const tStart = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - tStart;
      if (req.path.startsWith("/api")) {
        console.log(`[HTTP ${req.method}] ${req.path} -> ${res.statusCode} (${durationMs}ms) [req-id: ${correlationId}]`);
      }
    });

    next();
  });

  app.use(express.json({ limit: "2mb" }));

  // 0. Production Health & Observability Probe Endpoint
  app.get("/api/health", async (req, res) => {
    const t0 = Date.now();
    let dbStatus = "unknown";
    let dbLatencyMs = 0;
    let dbError: string | null = null;

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const client = createClient(supabaseUrl, supabaseKey);
        const { error } = await client.from("organizations").select("id").limit(1);
        dbLatencyMs = Date.now() - t0;
        if (error) {
          dbStatus = "degraded";
          dbError = error.message;
        } else {
          dbStatus = "healthy";
        }
      } else {
        dbStatus = "unconfigured";
      }
    } catch (e: any) {
      dbStatus = "unreachable";
      dbError = e?.message || "Koneksi database gagal.";
      dbLatencyMs = Date.now() - t0;
    }

    const payload = {
      status: dbStatus === "healthy" ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      services: {
        server: "healthy",
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          error: dbError,
        },
        apis: {
          invitations: "active",
          integrations: "active",
          notifications: "active",
          telegramWebhook: "active",
          chat: "active",
        },
      },
      version: "2.1.0-production",
    };

    return res.status(dbStatus === "unreachable" ? 503 : 200).json(payload);
  });

  // 1. Serverless User Invitation & Provisioning Endpoint (Unified)
  app.post("/api/invitations", async (req, res) => {
    try {
      const result = await processInvitationPayload(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch (error: any) {
      console.error("Invitation API Error:", error);
      return res.status(500).json({ error: error.message || "Gagal memproses undangan pengguna." });
    }
  });

  app.delete("/api/invitations", async (req, res) => {
    try {
      const result = await processInvitationPayload(req.headers.authorization, {
        ...(req.body || {}),
        action: "revoke",
      });
      return res.status(result.status).json(result.data);
    } catch (error: any) {
      console.error("Revoke Invitation API Error:", error);
      return res.status(500).json({ error: error.message || "Gagal membatalkan undangan pengguna." });
    }
  });

  // 2. Serverless Integration Secrets Endpoint (Unified)
  app.get("/api/integrations", async (req, res) => {
    try {
      const organizationId = typeof req.query?.organizationId === "string" ? req.query.organizationId : undefined;
      const result = await processIntegrationSecrets("GET", req.headers.authorization, { organizationId });
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({ error: "Gagal memuat metadata integrasi." });
    }
  });

  app.post("/api/integrations", async (req, res) => {
    try {
      const result = await processIntegrationSecrets("POST", req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({ error: "Gagal menyimpan rahasia integrasi." });
    }
  });

  app.patch("/api/integrations", async (req, res) => {
    try {
      const result = await processIntegrationSecrets("PATCH", req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({ error: "Gagal memperbarui status rahasia integrasi." });
    }
  });

  // 3. Register Telegram Webhook Endpoint (Unified)
  app.post("/api/telegram-webhook/register", async (req, res) => {
    try {
      const result = await processTelegramWebhookRegister(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({ error: "Gagal mendaftarkan webhook Telegram." });
    }
  });

  // 4. Send Telegram Notification Endpoint (Unified)
  app.post("/api/notify/telegram", async (req, res) => {
    try {
      const result = await processTelegramNotification(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({ error: "Gagal memproses pengiriman notifikasi Telegram." });
    }
  });

  // 5. Send WhatsApp (Fonnte) Notification Endpoint (Unified)
  app.post("/api/notify/whatsapp", async (req, res) => {
    try {
      const result = await processWhatsAppNotification(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({ error: "Gagal memproses pengiriman notifikasi WhatsApp." });
    }
  });

  // 6. Telegram Webhook Endpoint (Unified & Tenant-Aware)
  app.post("/api/telegram-webhook", async (req, res) => {
    return telegramWebhookHandler(req, res);
  });

  // 7. AI Chat Assistant Endpoint (Unified, Authenticated & Rate-Limited)
  app.post("/api/chat", async (req, res) => {
    try {
      const result = await processChatRequest(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({ error: "Maaf, layanan Asisten AI sedang mengalami gangguan sementara." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
