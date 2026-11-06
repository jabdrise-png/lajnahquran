/**
 * Vercel Serverless Function: /api/health
 */
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: Request, res: Response) {
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
  } catch (err: any) {
    dbStatus = "unreachable";
    dbError = err?.message || "DB probe failed";
    dbLatencyMs = Date.now() - t0;
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(dbStatus === "unreachable" ? 503 : 200).json({
    status: dbStatus === "healthy" ? "healthy" : "degraded",
    runtime: "vercel-serverless",
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      error: dbError,
    },
    version: "2.1.0-production",
  });
}
