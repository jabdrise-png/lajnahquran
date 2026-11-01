import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

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

  // Server-side proxy for Telegram notifications
  app.post("/api/notify/telegram", async (req, res) => {
    try {
      const { chatId, message, botToken: clientBotToken, parseMode } = req.body || {};
      if (!chatId || !message) {
        return res.status(400).json({ error: "chatId and message are required" });
      }

      const { profile, client } = await resolveAuthenticatedContext(req);
      let token = clientBotToken || process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;

      if (!token && client && profile?.organization_id) {
        const { data: setting } = await client
          .from("app_settings")
          .select("value")
          .eq("organization_id", profile.organization_id)
          .eq("key", "TELEGRAM_BOT_TOKEN")
          .maybeSingle();
        if (setting?.value) token = setting.value;
      }

      if (!token) {
        return res.status(400).json({ error: "Token Bot Telegram belum dikonfigurasi." });
      }

      const cleanToken = String(token).trim();
      const cleanChatId = String(chatId).trim();

      const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: message,
          parse_mode: parseMode || "Markdown",
        }),
      });

      const result: any = await response.json();
      if (!result.ok) {
        return res.status(400).json({ error: result.description || "Gagal mengirim pesan Telegram" });
      }
      return res.json({ success: true, result });
    } catch (err: any) {
      console.error("Telegram Proxy Error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // Server-side proxy for Fonnte WhatsApp notifications
  app.post("/api/notify/whatsapp", async (req, res) => {
    try {
      const { target, message, apiToken: clientApiToken } = req.body || {};
      if (!target || !message) {
        return res.status(400).json({ error: "target and message are required" });
      }

      const { profile, client } = await resolveAuthenticatedContext(req);
      let token = clientApiToken || process.env.FONNTE_API_TOKEN || process.env.VITE_FONNTE_API_TOKEN;

      if (!token && client && profile?.organization_id) {
        const { data: setting } = await client
          .from("app_settings")
          .select("value")
          .eq("organization_id", profile.organization_id)
          .eq("key", "FONNTE_API_TOKEN")
          .maybeSingle();
        if (setting?.value) token = setting.value;
      }

      if (!token) {
        return res.status(400).json({ error: "Token API Fonnte belum dikonfigurasi." });
      }

      const formData = new URLSearchParams();
      formData.append("target", String(target));
      formData.append("message", String(message));

      const response = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: String(token).trim(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const result: any = await response.json();
      if (!result.status) {
        return res.status(400).json({ error: result.reason || "Gagal mengirim pesan melalui Fonnte" });
      }
      return res.json({ success: true, result });
    } catch (err: any) {
      console.error("WhatsApp Proxy Error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // Protected endpoint to register Telegram Webhook (Admin/SuperAdmin only, tenant-scoped)
  app.post("/api/telegram-webhook/register", async (req, res) => {
    try {
        const { user, profile, client } = await resolveAuthenticatedContext(req);
        if (!user || !profile || !["admin", "super_admin"].includes(profile.role)) {
            return res.status(403).json({ error: "Akses ditolak: Hanya Admin Ma'had yang dapat mendaftarkan webhook." });
        }

        const { webhookUrl, botToken: explicitToken } = req.body;
        if (!webhookUrl) {
            return res.status(400).json({ error: "webhookUrl is required" });
        }

        let BOT_TOKEN = explicitToken || process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
        if (!BOT_TOKEN && client && profile.organization_id) {
            const { data: settings } = await client
                .from('app_settings')
                .select('key, value')
                .eq('organization_id', profile.organization_id)
                .eq('key', 'TELEGRAM_BOT_TOKEN')
                .maybeSingle();
            if (settings?.value) BOT_TOKEN = settings.value;
        }

        if (!BOT_TOKEN) {
            return res.status(400).json({ error: "No Telegram Bot Token" });
        }

        const webhookPayload: Record<string, any> = { url: webhookUrl };
        if (process.env.TELEGRAM_WEBHOOK_SECRET) {
            webhookPayload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
        }

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
        });
        const data = await response.json();
        res.json(data);
    } catch (e: any) {
        console.error("Webhook register error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/telegram-webhook", async (req, res) => {
    try {
        const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (expectedSecret) {
            const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
            if (headerSecret !== expectedSecret) {
                return res.status(401).json({ error: "Unauthorized webhook request" });
            }
        }

        const update = req.body;
        
        if (update && update.message && update.message.text) {
            const text = update.message.text.trim();
            const chatId = update.message.chat.id.toString();
            
            let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;

            if (text.startsWith('/konek') || text.startsWith('/sync') || text.startsWith('/start')) {
                const parts = text.split(' ');
                let replyMarkdown = '';

                if (parts.length > 1) {
                    const identifier = parts.slice(1).join(' ').trim();
                    
                    // Gunakan RPC SECURITY DEFINER terlebih dahulu agar menembus RLS saat dipanggil oleh webhook anonim
                    const { data: rpcResult, error: rpcError } = await supabase.rpc(
                        'rpc_link_telegram_chat_id',
                        { p_identifier: identifier, p_chat_id: chatId }
                    );

                    if (!rpcError && rpcResult && typeof rpcResult === 'object') {
                        if (rpcResult.bot_token) {
                            BOT_TOKEN = rpcResult.bot_token;
                        }
                        if (rpcResult.matched) {
                            const names = Array.isArray(rpcResult.names) ? rpcResult.names.join(', ') : '';
                            replyMarkdown = `✅ *Berhasil!*\n\nChat ini telah berhasil dihubungkan dengan data:\n*${names}*\n\nAnda akan menerima notifikasi otomatis dari sistem.`;
                        } else {
                            replyMarkdown = `❌ *Data Santri tidak ditemukan!*\n\nID, Kode Santri, atau Nomor HP *${identifier}* tidak cocok dengan data kami.\n\nPastikan Anda mendapatkan link pendaftaran yang benar dari Pengurus Madrasah, atau ketik format manual:\n\`/start <ID_ATAU_KODE_SANTRI>\`\nContoh: \`/start 12345\``;
                        }
                    } else {
                        // Fallback jika RPC belum terpasang di database
                        const { data: santriList } = await supabase.from('santri').select('id, nama, kelas, telegram_chat_id, kode');
                        const targetSantri = santriList?.find((s) => s.id.toString() === identifier || s.kode === identifier);
                        
                        if (targetSantri) {
                            if (targetSantri.telegram_chat_id !== chatId) {
                                const { error } = await supabase.from('santri').update({ telegram_chat_id: chatId }).eq('id', targetSantri.id);
                                if (!error) {
                                    replyMarkdown = `✅ *Berhasil!*\n\nChat ini telah berhasil dihubungkan dengan data santri:\nNama: *${targetSantri.nama}*\nKelas: *${targetSantri.kelas}*\n\nAnda akan menerima notifikasi otomatis dari sistem.`;
                                } else {
                                    replyMarkdown = `❌ Terjadi kesalahan saat menyimpan data. Silakan coba lagi.`;
                                }
                            } else {
                                replyMarkdown = `✅ Chat ini sudah terhubung dengan data santri:\nNama: *${targetSantri.nama}*`;
                            }
                        } else {
                            replyMarkdown = `❌ *Data Santri tidak ditemukan!*\n\nID atau Kode Santri *${identifier}* tidak cocok dengan data kami.\n\nPastikan Anda mendapatkan link pendaftaran yang benar dari Pengurus Madrasah, atau ketik format manual:\n\`/start <ID_SANTRI>\`\nContoh: \`/start 12345\``;
                        }
                    }
                } else {
                    replyMarkdown = `⚠️ *Format Pendaftaran Salah*\n\nUntuk menghubungkan akun Telegram dengan data santri, silakan gunakan link otomatis yang diberikan Pengurus Madrasah, atau ketik manual dengan format:\n\`/start <ID_SANTRI>\`\nContoh: \`/start 12345\``;
                }

                if (!BOT_TOKEN) {
                    const { data: settings } = await supabase.from('app_settings').select('key, value').eq('key', 'TELEGRAM_BOT_TOKEN').maybeSingle();
                    if (settings?.value) BOT_TOKEN = settings.value;
                }

                if (BOT_TOKEN && replyMarkdown) {
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, text: replyMarkdown, parse_mode: 'Markdown' })
                    }).catch(console.error);
                }
            } else {
                if (!BOT_TOKEN) {
                    const { data: settings } = await supabase.from('app_settings').select('key, value').eq('key', 'TELEGRAM_BOT_TOKEN').maybeSingle();
                    if (settings?.value) BOT_TOKEN = settings.value;
                }
                if (BOT_TOKEN) {
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `🤖 *Bot Sistem Informasi Tahfidz*\n\nSilakan klik link pendaftaran dari Pengurus Madrasah untuk menghubungkan akun Anda, atau ketik:\n\`/start <ID_SANTRI>\`\nContoh: \`/start 12345\``,
                            parse_mode: 'Markdown'
                        })
                    }).catch(console.error);
                }
            }
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error("Webhook error:", e);
        res.status(200).send('OK');
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
