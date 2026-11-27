/**
 * Fase 8 · halaman kebijakan privasi singkat (publik, /privasi).
 * Isi mengikuti SPESIFIKASI_V2 bagian 10: isolasi data per lembaga, persetujuan wali oleh lembaga,
 * audit log, backup. Ubah teks di sini bila kebijakan berubah, lalu perbarui TANGGAL_BERLAKU.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export const TANGGAL_BERLAKU = '3 Desember 2026';

const Bagian: React.FC<{ judul: string; children: React.ReactNode }> = ({ judul, children }) => (
  <section className="space-y-2">
    <h2 className="text-base font-bold text-slate-900">{judul}</h2>
    <div className="space-y-2 text-base leading-relaxed text-slate-700">{children}</div>
  </section>
);

const KebijakanPrivasiPage: React.FC = () => (
  <div className="min-h-screen bg-slate-100 py-8 px-4">
    <article className="card mx-auto max-w-2xl p-6 sm:p-8 space-y-6">
      <header className="space-y-2">
        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center"><ShieldCheck className="text-blue-600" /></div>
        <h1 className="text-2xl font-bold text-slate-900">Kebijakan Privasi Lajnah Quran</h1>
        <p className="text-sm text-slate-500">Berlaku sejak {TANGGAL_BERLAKU}</p>
      </header>

      <Bagian judul="1. Data yang kami simpan">
        <p>Lajnah Quran menyimpan data yang dimasukkan lembaga: identitas lembaga, akun pengguna (nama, email, peran), data santri (nama, kelas, NIS, kontak wali), absensi, setoran hafalan, nilai ujian, raport, serta kode penautan Telegram wali.</p>
      </Bagian>

      <Bagian judul="2. Untuk apa data dipakai">
        <p>Hanya untuk menjalankan layanan: mencatat dan melaporkan kegiatan tahfidz, mengirim pesan Telegram kepada wali yang menautkan akunnya, membuat raport dan laporan untuk lembaga. Data tidak dijual dan tidak dipakai untuk iklan.</p>
      </Bagian>

      <Bagian judul="3. Siapa yang bisa melihat">
        <p>Data setiap lembaga terpisah: pengguna satu lembaga tidak bisa melihat data lembaga lain. Di dalam lembaga, akses mengikuti peran (Admin, Musammi'). Pengelola aplikasi hanya membuka data lembaga lewat sesi bantuan beralasan yang tercatat di log audit.</p>
      </Bagian>

      <Bagian judul="4. Tanggung jawab lembaga">
        <p>Lembaga memastikan sudah memperoleh persetujuan orang tua/wali sebelum mengunggah data santri, dan menjaga kerahasiaan akun penggunanya.</p>
      </Bagian>

      <Bagian judul="5. Keamanan & jejak perubahan">
        <p>Koneksi terenkripsi (HTTPS). Koreksi data, sesi bantuan, dan perubahan pengaturan tercatat di log audit. Cadangan data tersedia atas permintaan lembaga.</p>
      </Bagian>

      <Bagian judul="6. Wali santri & Telegram">
        <p>Wali menerima pesan hanya setelah mengirim kode santri ke bot lembaga, dan bisa berhenti kapan saja dengan mengirim <b>/berhenti</b>.</p>
      </Bagian>

      <Bagian judul="7. Penghapusan data">
        <p>Lembaga dapat meminta ekspor atau penghapusan seluruh datanya saat berhenti berlangganan dengan menghubungi pengelola aplikasi.</p>
      </Bagian>

      <footer className="pt-2 border-t border-slate-200 flex flex-wrap gap-3 justify-between text-sm">
        <span className="text-slate-500">Pertanyaan? Hubungi pengelola aplikasi melalui Admin lembaga Anda.</span>
        <Link to="/login" className="font-semibold text-blue-700">Kembali ke halaman masuk</Link>
      </footer>
    </article>
  </div>
);

export default KebijakanPrivasiPage;
