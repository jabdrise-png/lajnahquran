import { GoogleGenAI } from "@google/genai";
import { resolveServerTenantContext } from "./_tenantContext";

export const config = {
  runtime: "edge",
};

const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_DAILY_USER_REQUESTS = 80;
const MAX_DAILY_TENANT_REQUESTS = 300;
const MAX_HISTORY_MESSAGES = 10;
const MAX_SINGLE_MESSAGE_CHARS = 1500;
const MAX_TOTAL_HISTORY_CHARS = 8000;

const minuteRateMap = new Map<string, { count: number; resetAt: number }>();
const dailyUserQuotaMap = new Map<string, { count: number; resetAt: number }>();
const dailyTenantQuotaMap = new Map<string, { count: number; resetAt: number }>();

export function resetChatRateAndQuotaForTesting() {
  minuteRateMap.clear();
  dailyUserQuotaMap.clear();
  dailyTenantQuotaMap.clear();
}

function checkWindowCounter(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  max: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now >= entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) {
    return false;
  }
  entry.count += 1;
  return true;
}

export const SYSTEM_INSTRUCTION = `Anda adalah "Asisten Lajnah Quran", asisten virtual resmi pada aplikasi SaaS Multi-Tenant Manajemen Tahfidz Al-Qur'an.
Tugas Anda adalah membantu pengguna resmi aplikasi dalam memahami alur operasional sistem dan tata kelola tahfidz Al-Qur'an secara akurat.

ATURAN KEPUTUSAN PRODUK & OTORITAS ROLE (WAJIB DIPATUHI):
1. Aplikasi HANYA memiliki tiga (3) role autentikasi kanonikal:
   - superadmin: Mengelola platform multi-tenant, provisioning organisasi baru, undangan Admin Lembaga, pemantauan kuota paket, dan Sesi Support Access teraudit (Read-Only / Read-Write).
   - admin: Mengelola operasional satu lembaga secara penuh (Tahun Ajaran & Semester, Marhalah & Kelas, Data Santri & Enrollment, Master Musammi & Undangan, Halaqah, Target Hafalan Berversi, Rubrik Penilaian, Evaluasi Periodik, Ujian & Remedial, Buku Nilai, Penerbitan/Amendment Snapshot Raport Immutable, Laporan Analitik, serta Pengaturan Lembaga & Integrasi).
   - musammi: Menjalankan operasional halaqah sesuai penugasan aktif (Meja Kerja Sesi Halaqah, Presensi Sesi, dan Pencatatan Setoran Ziyadah, Sabqi, serta Manzil).
2. Wali Kelas dan Musyrif BUKAN role login atau akun pengguna, melainkan atribut/penanggung jawab administratif pada data Kelas dan Santri.
3. Portal Wali Santri dan fitur penautan mandiri publik bukan bagian dari produk saat ini. Jangan mengarahkan pengguna ke portal Wali Santri atau role di luar ketiga role resmi di atas.

PANDUAN FITUR OPERASIONAL RESMI:
1. Meja Kerja Sesi Halaqah (/app/sessions):
   - Buka Sesi -> Tandai kehadiran seluruh anggota roster -> Simpan Kehadiran -> Input Setoran (Ziyadah, Sabqi, Manzil) -> Kunci Sesi (Lock) setelah seluruh santri memiliki status kehadiran.
   - Koreksi pada sesi yang sudah dikunci wajib menyertakan alasan koreksi dan tercatat di Audit Log.
2. Setoran & Murajaah (/app/recitations):
   - Kalkulasi halaman berbasis Mushaf Standar Madinah 15 Baris, pencatatan kesalahan minor/mayor, serta alur review Admin (Submitted -> Accepted / Returned / Voided) dengan histori revisi append-only.
3. Ujian, Buku Nilai & Raport Immutable (/app/exams, /app/gradebook, /app/report-cards):
   - Mendukung ujian beserta attempt remedial dan rekap nilai.
   - Raport yang telah diterbitkan (Published) bersifat immutable dan memiliki kode verifikasi SHA-256 yang dapat dicek pada halaman /verify. Koreksi raport yang sudah terbit hanya dapat dilakukan melalui mekanisme Amendment (versi baru).

Jawablah dalam bahasa Indonesia yang sopan, ringkas (maksimal 3-4 paragraf pendek), jelas, dan sesuai kewenangan role pengguna.`;

export async function processChatRequest(
  authHeader: string | undefined,
  body: any,
  injectedClient?: any,
  injectedGenerateContent?: (params: any) => Promise<{ text?: string }>
) {
  // 1. Verifikasi autentikasi dan keanggotaan aktif melalui resolver otoritatif
  const ctx = await resolveServerTenantContext({
    authHeader,
    requestedOrganizationId: body?.organizationId || null,
    requireWrite: false,
    requireOrganization: false,
    injectedClient,
  });

  if (!ctx.ok || !ctx.userId) {
    return {
      status: ctx.status,
      data: { error: ctx.error || "Unauthorized: Silakan login dengan akun aktif untuk menggunakan Asisten AI." },
    };
  }

  if (ctx.effectiveRole !== "superadmin" && ctx.effectiveRole !== "admin" && ctx.effectiveRole !== "musammi") {
    return {
      status: 403,
      data: { error: "Akses ditolak: Hanya pengguna aktif (Superadmin, Admin, atau Musammi) yang dapat mengakses Asisten AI." },
    };
  }

  const userId = ctx.userId;
  const orgKey = ctx.organizationId || "platform";

  // 2. Rate limit per menit & kuota harian (per-user dan per-tenant)
  if (!checkWindowCounter(minuteRateMap, userId, MAX_REQUESTS_PER_MINUTE, 60_000)) {
    return {
      status: 429,
      data: { error: "Terlalu banyak permintaan ke Asisten AI. Silakan tunggu 1 menit sebelum mencoba kembali." },
    };
  }

  if (!checkWindowCounter(dailyUserQuotaMap, userId, MAX_DAILY_USER_REQUESTS, 24 * 60 * 60_000)) {
    return {
      status: 429,
      data: { error: "Kuota harian Asisten AI untuk akun Anda telah tercapai. Silakan coba kembali besok." },
    };
  }

  if (!checkWindowCounter(dailyTenantQuotaMap, orgKey, MAX_DAILY_TENANT_REQUESTS, 24 * 60 * 60_000)) {
    return {
      status: 429,
      data: { error: "Kuota harian Asisten AI untuk lembaga ini telah tercapai." },
    };
  }

  // 3. Validasi ukuran input & riwayat percakapan (history)
  const { messages, message, history } = body || {};

  if (Array.isArray(history) && history.length > MAX_HISTORY_MESSAGES * 2) {
    return {
      status: 400,
      data: { error: `Riwayat percakapan melebihi batas maksimum (${MAX_HISTORY_MESSAGES * 2} pesan).` },
    };
  }

  if (Array.isArray(messages) && messages.length > MAX_HISTORY_MESSAGES * 2) {
    return {
      status: 400,
      data: { error: `Riwayat percakapan melebihi batas maksimum (${MAX_HISTORY_MESSAGES * 2} pesan).` },
    };
  }

  let normalizedMessages: Array<{ role: "user" | "model"; text: string }> = [];

  if (Array.isArray(messages) && messages.length > 0) {
    normalizedMessages = messages.map((m: any) => ({
      role: m?.role === "user" ? "user" : "model",
      text: String(m?.text || m?.content || "").trim(),
    }));
  } else if (message || Array.isArray(history)) {
    const histList: Array<{ role: "user" | "model"; text: string }> = Array.isArray(history)
      ? history
          .filter((h: any) => h && h.id !== "init")
          .map((h: any) => ({
            role: h.role === "user" ? "user" : "model",
            text: String(h.content || h.text || "").trim(),
          }))
      : [];
    if (message && (!histList.length || histList[histList.length - 1].text !== String(message).trim())) {
      histList.push({ role: "user", text: String(message).trim() });
    }
    normalizedMessages = histList;
  }

  normalizedMessages = normalizedMessages.filter((m) => m.text.length > 0);

  if (normalizedMessages.length === 0) {
    return { status: 400, data: { error: "Pesan tidak boleh kosong." } };
  }

  const lastMessage = normalizedMessages[normalizedMessages.length - 1];
  if (lastMessage.text.length > MAX_SINGLE_MESSAGE_CHARS) {
    return {
      status: 400,
      data: { error: `Pesan terlalu panjang (maksimal ${MAX_SINGLE_MESSAGE_CHARS} karakter).` },
    };
  }

  // Batasi jumlah item history yang dikirim ke model maksimal MAX_HISTORY_MESSAGES
  if (normalizedMessages.length > MAX_HISTORY_MESSAGES) {
    normalizedMessages = normalizedMessages.slice(-MAX_HISTORY_MESSAGES);
  }

  const totalHistoryChars = normalizedMessages.reduce((acc, m) => acc + m.text.length, 0);
  if (totalHistoryChars > MAX_TOTAL_HISTORY_CHARS) {
    return {
      status: 400,
      data: { error: `Total panjang riwayat percakapan melebihi batas maksimum (${MAX_TOTAL_HISTORY_CHARS} karakter). Silakan muat ulang sesi percakapan.` },
    };
  }

  const contents = normalizedMessages.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text.slice(0, MAX_SINGLE_MESSAGE_CHARS) }],
  }));

  const roleSpecificInstruction = `${SYSTEM_INSTRUCTION}\n\nKONTEKS PENGGUNA SAAT INI: Role efektif Anda adalah '${ctx.effectiveRole}'.`;

  try {
    if (injectedGenerateContent) {
      const customRes = await injectedGenerateContent({
        model: "gemini-3.8-flash",
        contents,
        config: {
          systemInstruction: roleSpecificInstruction,
        },
      });
      return { status: 200, data: { text: customRes.text || "" } };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        status: 503,
        data: { error: "Layanan Asisten AI belum diaktifkan pada server ini." },
      };
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction: roleSpecificInstruction,
      },
    });

    return { status: 200, data: { text: response.text || "Afwan, tidak ada respons yang dihasilkan." } };
  } catch (err: any) {
    // Logging aman: hanya mencatat kode status / tipe kendala tanpa membocorkan secret atau stack trace ke publik
    const safeErrorCode = err?.status || err?.code || "AI_SERVICE_ERROR";
    console.warn(`[AI Chat Warning] role=${ctx.effectiveRole} org=${orgKey} code=${safeErrorCode}`);
    return {
      status: 502,
      data: {
        error: "Maaf, layanan Asisten AI sedang mengalami gangguan sementara. Silakan coba beberapa saat lagi.",
      },
    };
  }
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const result = await processChatRequest(req.headers?.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch {
      return res.status(500).json({
        error: "Maaf, terjadi gangguan pada layanan Asisten AI.",
      });
    }
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") || undefined;
    const body = await req.json().catch(() => ({}));
    const result = await processChatRequest(authHeader, body);
    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Maaf, terjadi gangguan pada layanan Asisten AI." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
