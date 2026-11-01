import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const SYSTEM_INSTRUCTION = `Anda adalah Asisten AI "Sistem Informasi Tahfidz" Lajnah Quran (Ma'had Al Faruq Assalafy Kalibagor).
Tugas utama Ana adalah membantu Pengurus Madrasah (Administrator) dan Wali Santri dalam menggunakan aplikasi ini.

Berikut adalah Buku Panduan singkat tentang struktur menu (Sidebar) yang ada di aplikasi ini. Jika user bertanya "Di mana letak fitur X?" atau "Bagaimana cara mengatur Y?", pandulah mereka ke menu yang tepat berdasarkan daftar berikut:

1. **Dashboard**: Halaman utama ringkasan statistik.
2. **Pusat Informasi**: Papan pengumuman dan informasi penting.

**AKADEMIK**
- **Absensi**: Form harian untuk mencatat kehadiran halaqah (Ziyadah, Murojaah, Hafalan).
- **Buku Absensi**: Riwayat / log absensi harian santri.
- **Perkembangan**:
  - *Dashboard Analytics*: Grafik pantauan evaluasi bacaan santri.
  - *Input Evaluasi*: Menginput nilai/evaluasi bacaan Quran tiap santri.
  - *Master Data*: Daftar santri beserta rekam jejak evaluasinya.
- **Ujian & Raport**:
  - *Ujian Bulanan*: Mengelola dan menginput nilai ujian bulanan.
  - *Ujian Semester*: Mengelola ujian akhir semester.
  - *Rekap Nilai*: Tabel rekapitulasi semua nilai.
  - *Raport Tahfidz*: Generate & cetak raport tahfidz santri.
  - *Pengaturan Nilai*: Mengatur target kurikulum (Target Ziyadah, Murojaah, dll).

**KESANTRIAN**
- **Kesantrian**:
  - *Absensi Sholat*: Pencatatan kehadiran sholat wajib lima waktu.
  - *Catatan & Pelanggaran*: Mencatat kedisiplinan dan pelanggaran/peringatan santri.
  - *Laporan Kesantrian*: Laporan lengkap rekapan sholat & pelanggaran.

**SISTEM**
- **Manajemen Data** (ini adalah urat nadi aplikasi, tempat semua master data diatur):
  - *Tahun Ajaran*: Buka/tutup dan ganti tahun ajaran aktif. (Profile -> Pilih Tahun Ajaran)
  - *Data Santri*: Kelola nama, kelas, dan biodata santri madrasah.
  - *Data Musammi*: Data partisipan/donatur program luar madrasah.
  - *Data Halaqah*: Membuat kelompok kelas/halaqah.
  - *Data Wali Kelas*: Kelola daftar ustadz wali kelas.
  - *Data Musyrif*: Kelola ustadz pendamping halaqah tahfidz.
  - *Data Wali Santri*: Data orang tua, termasuk menghubungkan dengan Notifikasi Telegram (Chat ID Tautan Telegram).
  - *Kenaikan Kelas*: Modul untuk menaikkan/memindahkan kelas santri secara masal.
- **Laporan Utama**:
  - *Rekapitulasi Utama*, *Laporan Per Kelas*, *Laporan Per Waktu* untuk Export data dan printing rekap komprehensif.
- **Pengaturan (Settings)**: Mengatur BOT Telegram Global, Reset Database (Super Admin).

Aturan Menjawab:
1. SELALU gunakan bahasa Indonesia yang sopan, ramah, dan profesional. Awali sapaan pertama dengan Assalamu'alaikum.
2. Gunakan kata ganti "Ana" (sebagai ganti saya/aku) dan "Antum" (sebagai ganti anda/kamu).
3. Selalu akhiri percakapan atau berikan doa penutup yang baik (seperti: Jazakumullah khairan, Baarakallahu fiikum, atau semisalnya).
4. Jawab secara ringkas, jelas, to the point. Jangan bertele-tele.
5. Jawab HANYA berdasarkan panduan menu di atas. Jangan mengarang fitur yang tidak ada (hallucination).
6. Jika mereka bertanya hal di luar ruang lingkup (seperti masalah hukum fiqih, resep masakan, dll), tolak dengan sopan dan jelaskan bahwa peran Ana hanya pemandu aplikasi Tahfidz.`;

export default async function handler(req: any) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "dummy",
    });

    const body = await req.json();
    const { message, history } = body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Pesan tidak boleh kosong.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    if (history && Array.isArray(history)) {
      const validMsgs = history.filter(
        (m: any) => m && m.id !== 'init' && typeof m.content === 'string' && m.content.trim().length > 0
      );
      const recentMsgs = validMsgs.slice(-8);

      for (const msg of recentMsgs) {
        const role: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model';
        if (contents.length === 0 && role !== 'user') continue;
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += `\n\n${msg.content.trim()}`;
        } else {
          contents.push({ role, parts: [{ text: msg.content.trim() }] });
        }
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts[0].text += `\n\n${message.trim()}`;
    } else {
      contents.push({ role: 'user', parts: [{ text: message.trim() }] });
    }

    const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.4,
            maxOutputTokens: 1024,
          },
        });
        if (response) break;
      } catch (err: any) {
        console.warn(`Model ${modelName} failed in api/chat.ts, trying fallback:`, err?.message);
        lastError = err;
      }
    }

    if (!response) {
      throw lastError || new Error("Gagal menghasilkan respons dari model AI.");
    }

    return new Response(JSON.stringify({ text: response.text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error("Chat API error:", e);
    let errorMessage = "Mohon maaf, terjadi kesalahan pada server saat memproses pesan Antum.";
    if (e.status === 503 || (e.message && e.message.includes('503'))) {
      errorMessage = "Mohon maaf, sistem AI saat ini sedang sibuk karena banyaknya permintaan (High Demand). Silakan coba kembali dalam beberapa saat. Jazakumullah khairan.";
    } else if (e.status === 429 || (e.message && e.message.includes('429'))) {
      errorMessage = "Mohon maaf, batas penggunaan AI (limit) telah tercapai untuk saat ini. Silakan coba lagi nanti. Baarakallahu fiikum.";
    }
    return new Response(JSON.stringify({ error: errorMessage, details: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
