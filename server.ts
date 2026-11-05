import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { processInvitationPayload } from "./api/invitations";
import { processIntegrationSecrets } from "./api/integrations";
import { processTelegramNotification } from "./api/notify/telegram";
import { processWhatsAppNotification } from "./api/notify/whatsapp";
import { processTelegramWebhook } from "./api/telegram-webhook";
import { processTelegramWebhookRegister } from "./api/telegram-webhook/register";

// Initialize Supabase client for Server
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const SYSTEM_INSTRUCTION = `Anda adalah Asisten AI Cerdas "Sistem Informasi Tahfidz" Lajnah Quran.
Tugas utama Ana adalah menjadi konsultan dan pemandu ahli bagi Pengurus Madrasah (Administrator), Ustadz/Musyrif, dan Wali Santri dalam memahami dan mengoperasikan aplikasi ini secara optimal.

Buku Panduan & Basis Pengetahuan Sistem:

1. STRUKTUR MENU & MODUL UTAMA
- **Dashboard**: Menampilkan ringkasan statistik harian & mingguan, grafik tren setoran, kehadiran santri per marhalah, dan statistik waktu setoran (Subuh, Ashar, Maghrib).
- **Pusat Informasi**: Papan pengumuman kegiatan tahfidz, agenda halaqah, dan maklumat madrasah.

2. MODUL AKADEMIK & SETORAN
- **Absensi Halaqah** (/absensi):
  - Digunakan setiap hari oleh Ustadz Musyrif untuk mencatat kehadiran santri pada 3 sesi halaqah: Subuh, Ashar, dan Maghrib.
  - Status kehadiran: Hadir (H), Izin (I), Sakit (S), Alpa (A).
- **Buku Absensi** (/buku-absensi):
  - Arsip dan riwayat rekapitulasi kehadiran santri per tanggal, per halaqah, dan per marhalah.
- **Perkembangan Santri**:
  - *Dashboard Analytics*: Grafik visual pemantauan capaian bacaan dan mutqin hafalan tiap santri.
  - *Input Evaluasi* (/input-evaluasi): Tempat musyrif menginput setoran hafalan santri secara langsung.
    - Dua jenis setoran: **Ziyadah** (setoran hafalan baru untuk menambah juz) dan **Murojaah** (mengulang hafalan lama agar tetap mutqin/lancar).
    - Data yang diinput: Nama Santri, Sesi (Subuh/Ashar/Maghrib), Surat & Rentang Ayat/Halaman, Tingkat Kelancaran, serta Predikat Nilai.
  - *Master Data Evaluasi*: Menampilkan log lengkap rekam jejak evaluasi bacaan santri sepanjang semester.
- **Ujian & Raport**:
  - *Ujian Bulanan & Semester*: Form dan rekap penilaian ujian tahfidz berkala menguji kelancaran, tajwid, dan fashahah.
  - *Raport Tahfidz* (/raport): Modul otomatis untuk membuat, meninjau, dan mencetak dokumen Raport Tahfidz resmi (lengkap dengan rekap target ziyadah/murojaah vs capaian nyata, persentase kehadiran, dan catatan pembina).
  - *Pengaturan Evaluasi / Nilai*: Menentukan target halaman kurikulum, rumus predikat, dan konfigurasi bobot penilaian.

3. SKEMA PREDIKAT NILAI TAHFIDZ
- **Mumtaz (Istimewa / Nilai 90 - 100)**: Bacaan sangat lancar tanpa salah, tajwid dan makharijul huruf sempurna.
- **Jayyid Jiddan (Sangat Baik / Nilai 80 - 89)**: Bacaan lancar, ada sedikit kekeliruan kecil yang langsung diperbaiki mandiri.
- **Jayyid (Baik / Nilai 70 - 79)**: Cukup lancar, terdapat beberapa kali bimbingan atau teguran dari musyrif.
- **Maqbul (Cukup / Nilai 60 - 69)**: Memenuhi syarat minimal kelulusan setoran, namun masih perlu banyak pengulangan.
- **Rasib (Kurang / Perlu Mengulang / < 60)**: Belum lancar, bacaan terbata-bata, santri diwajibkan mengulang setoran tersebut di halaqah berikutnya.

4. MODUL KESANTRIAN
- **Absensi Sholat**: Pencatatan kedisiplinan sholat fardhu berjamaah 5 waktu (Subuh, Dzuhur, Ashar, Maghrib, Isya).
- **Catatan & Pelanggaran**: Rekap poin pelanggaran kedisiplinan santri, sanksi edukatif, serta catatan khusus dari bagian kesantrian.
- **Laporan Kesantrian**: Laporan komprehensif kedisiplinan dan ibadah santri untuk evaluasi periodik.

5. MODUL SISTEM & MASTER DATA
- **Tahun Ajaran Aktif**: Mengatur dan mengunci tahun ajaran serta semester aktif (Ganjil/Genap).
- **Data Santri**: Kelola identitas, NIS, kelas/marhalah, halaqah, dan status aktif.
- **Data Halaqah & Musyrif**: Pengelompokan kelompok tahfidz dan ustadz pembina masing-masing halaqah.
- **Data Wali Santri & Telegram**: Menghubungkan nomor kontak dan akun Telegram orang tua santri.
- **Kenaikan Kelas**: Modul mutasi atau kenaikan kelas santri secara masal ke tahun ajaran baru.
- **Laporan Utama & Cetak**: Rekapitulasi Utama, Laporan Per Kelas, Laporan Per Waktu untuk keperluan export (Excel) dan cetak (PDF).

6. INTEGRASI NOTIFIKASI BOT TELEGRAM WALI SANTRI
- Memungkinkan wali santri menerima laporan otomatis setiap kali santri selesai setoran atau direkap absensinya.
- Cara wali santri menghubungkan akun:
  1. Dapatkan Kode Santri / ID Santri dari pengurus madrasah.
  2. Buka bot Telegram resmi madrasah.
  3. Ketik perintah: \`/start <KODE_SANTRI>\` atau \`/konek <ID_SANTRI>\`.
  4. Bot akan memberikan konfirmasi bahwa akun Telegram telah terhubung dengan data santri.

PEDOMAN GAYA MENJAWAB (PENTING):
1. **Adab & Bahasa**: Gunakan bahasa Indonesia yang santun, hangat, dan bersahabat. Awali sapaan pertama dengan salam "Assalamu'alaikum warahmatullahi wabarakatuh". Gunakan kata ganti "Ana" (pemandu) dan "Antum" (pengguna). Selalu tutup dengan doa yang baik ("Baarakallahu fiikum", "Jazakumullah khairan", dll).
2. **PINTAR & EDUKATIF**: Jika pengguna bertanya tentang alur ("Bagaimana cara...", "Langkah menginput...", "Solusi jika..."), jangan hanya menyebutkan nama tab/menu! Berikan panduan langkah demi langkah (1, 2, 3...) yang runtut, jelas, dan mudah dipraktikkan.
3. **FORMATTING TERSTRUKTUR**: Gunakan **teks tebal** untuk tombol, nama menu, atau istilah kunci. Gunakan daftar berpoin (-) atau nomor (1, 2, 3) untuk alur yang berurutan. Format rapi ini memudahkan ustadz dan wali santri membaca cepat di layar handphone maupun laptop.
4. **BATASAN PERAN**: Jika ada pertanyaan di luar sistem informasi tahfidz (seperti hukum fiqih kontemporer, politik, atau hal umum lainnya), sampaikan permohonan maaf dengan santun bahwa Ana difokuskan khusus untuk membantu kelancaran sistem aplikasi Tahfidz Lajnah Quran.`;

let aiClient: GoogleGenAI | null = null;
function getAiClient() {
  if (!aiClient) {
    aiClient = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY, 
        httpOptions: { 
            headers: { 'User-Agent': 'aistudio-build' } 
        } 
    });
  }
  return aiClient;
}

// Inject SEO and OG meta tags into the HTML string
async function injectMetaTags(html: string): Promise<string> {
  try {
    const { data } = await supabase.from('cms_landing_page').select('config').eq('status', 'published').maybeSingle();
    if (data && data.config && data.config.seo) {
      const seo = data.config.seo;
      let modifiedHtml = html;
      
      const escapeStr = (str: string) => (str || '').replace(/"/g, '&quot;');
      
      const titleStr = seo.title || "Halaqah Attendance System"; // Title inside <title> doesn't need quote escaping
      const titleAttr = escapeStr(seo.title || "Halaqah Attendance System");
      const descAttr = escapeStr(seo.description || "Platform Manajemen Tahfidz");
      const imgAttr = escapeStr(seo.ogImage || "");

      // Replace Title
      modifiedHtml = modifiedHtml.replace(/<title>(.*?)<\/title>/, `<title>${titleStr}</title>`);
      
      // Replace Meta description
      if (modifiedHtml.includes('name="description"')) {
          modifiedHtml = modifiedHtml.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${descAttr}" />`);
      } else {
          modifiedHtml = modifiedHtml.replace('</head>', `  <meta name="description" content="${descAttr}" />\n</head>`);
      }

      // Replace OG Title
      if (modifiedHtml.includes('property="og:title"')) {
          modifiedHtml = modifiedHtml.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${titleAttr}" />`);
      } else {
          modifiedHtml = modifiedHtml.replace('</head>', `  <meta property="og:title" content="${titleAttr}" />\n</head>`);
      }

      // Replace OG Description
      if (modifiedHtml.includes('property="og:description"')) {
          modifiedHtml = modifiedHtml.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${descAttr}" />`);
      } else {
          modifiedHtml = modifiedHtml.replace('</head>', `  <meta property="og:description" content="${descAttr}" />\n</head>`);
      }

      // Replace OG Image
      if (modifiedHtml.includes('property="og:image"')) {
          modifiedHtml = modifiedHtml.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${imgAttr}" />`);
      } else {
          modifiedHtml = modifiedHtml.replace('</head>', `  <meta property="og:image" content="${imgAttr}" />\n</head>`);
      }

      return modifiedHtml;
    }
  } catch (err) {
    console.error("Error fetching SEO config from Supabase:", err);
  }
  return html;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  
  
  // Helper to resolve authenticated caller and their organization_id
  const resolveAuthenticatedContext = async (req: express.Request) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token || !supabaseUrl || !supabaseKey) {
      return { user: null, profile: null, client: supabase };
    }
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    const user = userData?.user || null;
    if (!user) return { user: null, profile: null, client: userClient };

    const { data: profile } = await userClient
      .from("profiles")
      .select("id, role, organization_id, status")
      .eq("id", user.id)
      .maybeSingle();

    return { user, profile, client: userClient };
  };

  // Serverless-compatible User Invitations & Account Provisioning API
  const handleInvitationRequest = async (req: express.Request, res: express.Response) => {
    try {
      const result = await processInvitationPayload(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Gagal memproses undangan akun." });
    }
  };
  app.post("/api/invitations", handleInvitationRequest);
  app.post("/api/invite-user", handleInvitationRequest);

  // Serverless-compatible Integration Secrets API
  app.all("/api/integrations", async (req, res) => {
    try {
      const result = await processIntegrationSecrets(req.method, req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Gagal memproses rahasia integrasi." });
    }
  });

  // Server-side proxy for Telegram notifications
  app.post("/api/notify/telegram", async (req, res) => {
    try {
      const result = await processTelegramNotification(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch (err: any) {
      console.error("Telegram Proxy Error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // Server-side proxy for Fonnte WhatsApp notifications
  app.post("/api/notify/whatsapp", async (req, res) => {
    try {
      const result = await processWhatsAppNotification(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch (err: any) {
      console.error("WhatsApp Proxy Error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // Protected endpoint to register Telegram Webhook (Admin/SuperAdmin only, tenant-scoped)
  app.post("/api/telegram-webhook/register", async (req, res) => {
    try {
      const result = await processTelegramWebhookRegister(req.headers.authorization, req.body);
      return res.status(result.status).json(result.data);
    } catch (e: any) {
      console.error("Webhook register error:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/telegram-webhook", async (req, res) => {
    try {
      const secretHeader = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
      const result = await processTelegramWebhook(secretHeader, req.body);
      return res.status(result.status).send(result.text);
    } catch (e) {
      console.error("Webhook error:", e);
      return res.status(200).send("OK");
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: "Pesan tidak boleh kosong." });
      }
      
      const ai = getAiClient();
      
      // Sanitize multi-turn history
      // Gemini API requires:
      // 1. First turn must be 'user'
      // 2. Roles must strictly alternate: user -> model -> user -> model
      // 3. Keep recent history (last 8 messages) to prevent huge prompts and token exhaustion
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      
      if (history && Array.isArray(history)) {
        const validMsgs = history.filter(
          m => m && m.id !== 'init' && typeof m.content === 'string' && m.content.trim().length > 0
        );
        const recentMsgs = validMsgs.slice(-8);

        for (const msg of recentMsgs) {
          const role: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model';
          // Ensure first message is user
          if (contents.length === 0 && role !== 'user') {
            continue;
          }
          // If consecutive same role, combine text to avoid API rejection
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts[0].text += `\n\n${msg.content.trim()}`;
          } else {
            contents.push({
              role,
              parts: [{ text: msg.content.trim() }]
            });
          }
        }
      }

      // Append current user message
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts[0].text += `\n\n${message.trim()}`;
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: message.trim() }]
        });
      }

      // Try primary model first, with automatic fallback to flash-lite if high demand (503/429) occurs
      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
      let lastError: any = null;
      let replyText: string | null = null;

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION
            }
          });
          if (response?.text) {
            replyText = response.text.trim();
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Model ${modelName} returned error:`, err?.message || err);
          // Continue to next model in list
        }
      }

      if (!replyText) {
        if (lastError) throw lastError;
        replyText = "Afwan, Ana belum dapat merumuskan jawaban saat ini. Silakan ulangi pertanyaan Antum.";
      }
      
      res.json({ text: replyText });
    } catch (e: any) {
      console.error("Chat API error:", e);
      let errorMessage = "Mohon maaf, terjadi kesalahan pada server saat memproses pesan Antum.";
      const msg = e?.message || '';
      if (e?.status === 503 || msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded')) {
          errorMessage = "Mohon maaf, sistem AI saat ini sedang mengalami lonjakan permintaan (High Demand). Silakan coba kembali dalam beberapa saat. Jazakumullah khairan.";
      } else if (e?.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('limit')) {
          errorMessage = "Mohon maaf, batas penggunaan AI (rate limit) telah tercapai untuk saat ini. Silakan coba lagi sebentar lagi. Baarakallahu fiikum.";
      } else if (e?.status === 404 || msg.includes('404')) {
          errorMessage = "Mohon maaf, layanan AI sedang mengalami pembaruan model. Silakan coba sesaat lagi.";
      }
      res.status(500).json({ error: errorMessage, details: e?.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) return next();
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        template = await injectMetaTags(template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.use(async (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.originalUrl.startsWith('/api')) return res.status(404).end();
      try {
        let template = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
        template = await injectMetaTags(template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (err) {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
