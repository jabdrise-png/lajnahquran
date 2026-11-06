/**
 * Netlify Serverless Functions Adapter for Lajnah Quran
 * Provides production-ready routing for /api/* on Netlify infrastructure.
 */
export interface HandlerEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
}

export interface HandlerContext {
  [key: string]: any;
}

export interface HandlerResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export type Handler = (
  event: HandlerEvent,
  context: HandlerContext
) => Promise<HandlerResponse>;
import { processInvitationPayload } from "../../api/invitations";
import { processIntegrationSecrets } from "../../api/integrations";
import { processTelegramNotification } from "../../api/notify/telegram";
import { processWhatsAppNotification } from "../../api/notify/whatsapp";
import { processTelegramWebhookRegister } from "../../api/telegram-webhook/register";
import { processChatRequest } from "../../api/chat";
import { createClient } from "@supabase/supabase-js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  // Normalize path from /.netlify/functions/api/... or direct /api/...
  const rawPath = event.path || "";
  const subPath = rawPath
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "");

  const authHeader = event.headers["authorization"] || event.headers["Authorization"];

  try {
    let body: any = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        body = {};
      }
    }

    // Health probe
    if (subPath === "/health" || subPath === "") {
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
        }
      } catch (err: any) {
        dbStatus = "unreachable";
        dbError = err?.message || "DB probe error";
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          status: dbStatus === "healthy" ? "healthy" : "degraded",
          runtime: "netlify-functions",
          timestamp: new Date().toISOString(),
          database: { status: dbStatus, latencyMs: dbLatencyMs, error: dbError },
          version: "2.1.0-production",
        }),
      };
    }

    // Invitations API
    if (subPath === "/invitations") {
      if (event.httpMethod === "DELETE") {
        const result = await processInvitationPayload(authHeader, { ...body, action: "revoke" });
        return { statusCode: result.status, headers: CORS_HEADERS, body: JSON.stringify(result.data) };
      }
      const result = await processInvitationPayload(authHeader, body);
      return { statusCode: result.status, headers: CORS_HEADERS, body: JSON.stringify(result.data) };
    }

    // Integrations API
    if (subPath === "/integrations") {
      const orgId = event.queryStringParameters?.organizationId;
      const result = await processIntegrationSecrets(event.httpMethod as any, authHeader, {
        ...body,
        organizationId: orgId || body?.organizationId,
      });
      return { statusCode: result.status, headers: CORS_HEADERS, body: JSON.stringify(result.data) };
    }

    // Telegram webhook register
    if (subPath === "/telegram-webhook/register") {
      const result = await processTelegramWebhookRegister(authHeader, body);
      return { statusCode: result.status, headers: CORS_HEADERS, body: JSON.stringify(result.data) };
    }

    // Notifications API
    if (subPath === "/notify/telegram") {
      const result = await processTelegramNotification(authHeader, body);
      return { statusCode: result.status, headers: CORS_HEADERS, body: JSON.stringify(result.data) };
    }

    if (subPath === "/notify/whatsapp") {
      const result = await processWhatsAppNotification(authHeader, body);
      return { statusCode: result.status, headers: CORS_HEADERS, body: JSON.stringify(result.data) };
    }

    // AI Chat Assistant API
    if (subPath === "/chat") {
      const result = await processChatRequest(authHeader, body);
      return { statusCode: result.status, headers: CORS_HEADERS, body: JSON.stringify(result.data) };
    }

    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Route ${subPath} tidak ditemukan di Netlify Functions.` }),
    };
  } catch (err: any) {
    console.error("Netlify Function Handler Error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err?.message || "Internal Server Error di Netlify Functions." }),
    };
  }
};
