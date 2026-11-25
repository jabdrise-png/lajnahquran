# Rencana Pengerjaan Lajnah Quran v2

Versi: 25 November 2026 · Acuan: `docs/SPESIFIKASI_V2.md` dan `docs/audit/BUG_REPORT_2026-11.md`

Sembilan fase dikerjakan berurutan. Fase berikutnya baru dimulai setelah semua butir **Selesai jika** di fase sebelumnya tercentang.

| Fase | Nama | Ukuran | Gerbang |
| --- | --- | --- | --- |
| F0 | Persiapan | S | – |
| F1 | Perbaikan kritis | S | – |
| F2 | Satu model data & peran fleksibel | L | Semua data dari satu sumber |
| F3 | Absensi & setoran sesuai spesifikasi | M | – |
| F4 | Rekap Periode | L | – |
| F5 | Ujian & raport | M | Alur sesuai spesifikasi |
| F6 | Telegram & laporan otomatis | M | – |
| F7 | HP, performa & PWA | M | – |
| F8 | Bisnis, kerapian & uji coba lembaga | M | – |

Ukuran: S = beberapa hari, M = 1–2 pekan, L = 2–4 pekan (perkiraan kasar untuk satu orang dibantu AI).

## Aturan Kerja

1. **Satu fase = satu cabang git** (contoh `fase-1-perbaikan-kritis`). Gabung ke `main` setelah lolos uji.
2. **Semua perubahan database = file migrasi** di `database/migrations/` (lihat README di folder itu). Jangan mengubah tabel langsung di dashboard Supabase tanpa menyimpan SQL-nya — itulah penyebab BUG-01.
3. **Uji di lingkungan pengembangan ini dulu** (`docs/LINGKUNGAN.md`); aplikasi produksi lama tidak disentuh.
4. **Simpan cadangan struktur database** sebelum migrasi besar.
5. **Satu permintaan kecil per sesi AI coding**: lampirkan bagian spesifikasi, sebutkan file yang boleh diubah, minta langkah uji. Contoh:

```text
Baca docs/SPESIFIKASI_V2.md bagian 5. Ubah pages/Operasional/SesiHalaqahPage.tsx
agar predikat dihitung otomatis dari tabel batas khoto lembaga (app_settings
key: KELANCARAN_RULES). Jangan ubah file lain. Tulis langkah uji manual di akhir.
```

**Pembekuan fitur:** selama F1–F3 tidak ada fitur baru yang masuk ke `main` selain yang ada di rencana ini.

---

## F0 – Persiapan (S)

Tujuan: acuan tertulis di repositori dan catatan struktur database. Repo, Netlify, dan Supabase proyek ini **sudah** menjadi lingkungan pengembangan yang terpisah dari aplikasi produksi lama (`docs/LINGKUNGAN.md`), jadi tidak perlu staging lagi.

1. Simpan spesifikasi & rencana di `docs/`.
2. Ekspor struktur database proyek ini ke `database/baseline_2026-11.sql` (`docs/LINGKUNGAN.md`).
3. Ganti sandi akun uji (sandi lama pernah ditulis di percakapan).
4. Bekukan penambahan fitur di `main` selama F1–F3.

Selesai jika:

- [ ] `docs/SPESIFIKASI_V2.md`, `docs/RENCANA_V2.md`, `docs/LINGKUNGAN.md` ada di `main`
- [ ] `database/baseline_2026-11.sql` ter-commit
- [ ] Sandi akun uji sudah diganti

## F1 – Perbaikan Kritis (S)

1. **BUG-01:** migrasi yang mengganti `recitation_revisions_action_check` sesuai aksi di kode.
2. **BUG-02:** uji validasi Accepted/Returned/Voided sekali (fitur ini dihapus di F3).
3. **BUG-03:** fungsi `rpc_platform_tenant_stats()` (`SECURITY DEFINER`, superadmin) untuk angka konsol.
4. **BUG-04/05:** sembunyikan & tolak (RLS/RPC) Edit/Suspend/Revoke untuk akun Superadmin dan akun sendiri.
5. **BUG-16:** satu fungsi `tampilkanError()` untuk pesan ramah.
6. **BUG-07/08:** validasi alasan ≥ 5 karakter di RPC.

Selesai jika:

- [ ] Musammi' bisa menyimpan setoran dari Sesi Halaqah dan Setoran Harian
- [ ] Konsol Superadmin menampilkan angka santri/musammi'/halaqah yang benar
- [ ] Admin tidak bisa mengubah Superadmin; tidak ada yang bisa men-suspend diri sendiri
- [ ] Alasan pendek ditolak server

## F2 – Satu Model Data & Peran Fleksibel (L)

1. Inventarisasi pasangan tabel lama → V2 (`setoran_harian` → `recitation_entries`, `attendance` → `attendance_records`, `halaqah_santri` → `halaqah_student_memberships`, `student_classes` → `student_enrollments`).
2. Tabel `recitation_kinds` (nama, urutan, `adds_memorization`, `counts_as_murojaah`, aktif) menggantikan `CHECK` pada kolom `kind`.
3. Status kehadiran & waktu halaqah dari `app_settings` ke tabel referensi.
4. Bersihkan kolom kembar di `recitation_entries`.
5. Migrasikan data lama ke V2 (skrip yang bisa diulang), cocokkan jumlah baris.
6. Semua halaman hanya membaca tabel V2.
7. Tabel `roles` menggantikan `CHECK (role IN …)`; satu pengguna boleh banyak grant; pilih peran aktif setelah login.
8. Nama marhalah roster sesi dari master (BUG-10).
9. Santri: tambah tanggal lahir & asal; NIS wajib.
10. Cabut akses tabel lama, hapus halaman Rekonsiliasi.

Selesai jika:

- [ ] Tidak ada query ke tabel lama di kode
- [ ] Setoran lama muncul di riwayat sesi dan progres
- [ ] Admin bisa menambah jenis setoran dan menandai apakah menambah hafalan
- [ ] Satu akun bisa menjadi Admin dan Musammi' sekaligus
- [ ] Nama marhalah sama di semua halaman

## F3 – Absensi & Setoran Sesuai Spesifikasi (M)

Absensi:

1. Satu layar "Absensi": Admin semua halaqah per waktu, Musammi' halaqahnya.
2. Sesi tercatat saat absensi pertama disimpan.
3. Pilihan **badal** saat absen.
4. Hapus Kunci Sesi & Koreksi Pasca-Kunci; perubahan setelah simpan meminta alasan ≥ 5 karakter.
5. Slot waktu mengikuti jadwal halaqah (BUG-11).

Setoran:

6. Pengaturan **Tabel Kelancaran** per lembaga.
7. Predikat otomatis dari khoto.
8. Rasib = ulang, tidak menambah hafalan.
9. Hapus alur validasi; setoran langsung sah; Admin koreksi dengan alasan.
10. Halaman otomatis dari mushaf di semua input.
11. **Arah hafalan** per santri.
12. Hanya Hadir/Terlambat yang bisa setor (jika absensi ada).
13. Satukan input setoran menjadi satu layar ringkas di HP.

Selesai jika:

- [ ] Petugas mengabsen 3 halaqah dari satu layar < 2 menit
- [ ] Musammi' mencatat 5 setoran dari HP, masing-masing < 15 detik
- [ ] Predikat otomatis sesuai tabel; Rasib tidak menambah hafalan
- [ ] Tidak ada lagi tombol Kunci Sesi atau Validasi Setoran

## F4 – Rekap Periode (L)

Database:

1. `evaluation_periods` + constraint tidak tumpang tindih.
2. `recording_mode` (`harian`/`rekap`) per halaqah per periode.
3. `period_recaps`: satu baris per santri per periode (isian sistem, sumber, halaqah pemilik).
4. `period_forms`: satu baris per halaqah per periode (status, jawaban evaluasi kegiatan).
5. Tabel pertanyaan dinamis (isian bebas & evaluasi kegiatan).

Logika:

6. `hitung_rekap_harian(periode, halaqah)`.
7. Total hafalan dari posisi hafalan + `quranPageMap.ts` sesuai arah hafalan.
8. Mode Harian: isian sistem otomatis, hanya Admin yang bisa ubah dengan alasan.

Tampilan:

9. **Form Evaluasi Periode** untuk musammi' (Simpan Draft / Kirim).
10. **Pemantauan Periode** untuk Admin.
11. Progres, Dashboard, dan target membaca `period_recaps`.

Selesai jika:

- [ ] Halaqah Mode Harian dan Mode Rekap sama-sama menghasilkan rekap
- [ ] Ziyadah rekap Mode Harian = jumlah setoran harian
- [ ] Total hafalan terhitung di kedua mode
- [ ] Admin melihat status pengisian semua halaqah
- [ ] Periode tumpang tindih ditolak

## F5 – Ujian & Raport (M)

1. Halaqah ujian / musammi' penguji mengisi nilai.
2. Ujian bulanan: nilai akhir + materi juz.
3. Ujian semester: khoto per juz, nilai otomatis; remedial = percobaan baru.
4. Raport 3 komponen (hapus silabus), bobot total 100%.
5. Penjaga terbit: tolak jika ada komponen kosong.
6. Tanda tangan digital Ketua Lajnah + ruang tanda tangan wali.
7. Validasi alasan amandemen di server.

Selesai jika:

- [ ] Raport tanpa nilai semester tidak bisa terbit
- [ ] Musammi' penguji bisa mengisi ujian bulanan halaqahnya
- [ ] Raport cetak memuat tanda tangan Ketua Lajnah dan ruang tanda tangan wali

## F6 – Telegram & Laporan Otomatis (M)

1. Kode unik santri + penautan bot otomatis (konfirmasi berisi nama ananda).
2. Notifikasi setoran dari server lewat `notification_queue`.
3. Kehadiran mingguan via Netlify Scheduled Function (contoh Jumat 20.00 WIB).
4. Progres per periode saat form terkirim / tombol Admin.
5. Template pesan dengan variabel (`{nama_santri}`, `{ziyadah}`, `{kehadiran}`).
6. Laporan mudir PDF bulanan & semester dari Rekap Periode.
7. Nonaktifkan WhatsApp Fonnte dari tampilan.

Selesai jika:

- [ ] Wali menautkan Telegram hanya dengan mengirim kode
- [ ] Setiap setoran memicu pesan ke wali < 1 menit
- [ ] Pesan kehadiran mingguan terkirim otomatis
- [ ] Admin bisa mengunduh PDF rekap bulanan

## F7 – HP, Performa & PWA (M)

1. Tailwind lewat build; hapus importmap `aistudiocdn`.
2. Code-splitting per rute; bundle awal < 500 KB gzip.
3. Ambil data per halaman + indeks database.
4. Update baris yang berubah saja setelah simpan (BUG-18).
5. Layar Absensi & Setoran untuk HP: kartu per santri, tombol besar, teks ≥ 14 px.
6. Hapus error 401/400 (BUG-19).
7. PWA: manifest, ikon, service worker, tombol pasang.
8. Lupa sandi & login Google.
9. Ganti `xlsx` 0.18.5.

Selesai jika:

- [ ] Absensi & Setoran tampil < 3 detik di HP 4G sedang
- [ ] Tidak ada tabel yang harus digeser di layar 375 px
- [ ] Aplikasi bisa dipasang di Android
- [ ] Reset sandi mandiri & login Google berjalan

## F8 – Bisnis, Kerapian & Uji Coba Lembaga (M)

1. Pencatatan pembayaran manual per lembaga + status langganan.
2. Paket diatur Superadmin.
3. Antrean pendaftaran lembaga (setujui/tolak).
4. Halaman kebijakan privasi.
5. Sembunyikan/hapus fitur di luar spesifikasi.
6. Siklus tahun ajaran: Aktif / Ditutup.
7. Identitas situs (judul, `lang="id"`, favicon); hapus testimoni contoh.
8. Pecah file > 1.000 baris; kurangi `any`.
9. Perbarui README & panduan pengguna.
10. Impor data lembaga uji ke produksi.
11. Latih Admin, petugas, musammi'.
12. Uji coba 2 pekan dengan masukan pekanan.
13. Evaluasi indikator berhasil.

Selesai jika:

- [ ] Semua musammi' lembaga uji mencatat setoran/rekap selama 2 pekan
- [ ] Wali menerima Telegram setoran & kehadiran mingguan
- [ ] Admin menghasilkan PDF rekap bulanan untuk mudir
- [ ] Tidak ada bug P0/P1 terbuka

## Setelah Rilis v2

Peran Wali Kelas & Wali Santri, sertifikat/syahadah, penilaian tajwid/makhraj/fashahah/adab, peringatan otomatis, payment gateway & uji coba gratis, integrasi lain, aplikasi Play Store.

## Keputusan yang Dibutuhkan

| Keputusan | Sebelum |
| --- | --- |
| Tabel batas khoto per predikat untuk lembaga pertama | F3 |
| Aturan kelancaran periode di Mode Harian | F4 |
| Penjelasan lengkap tentang periode | F4 |
| Akun Admin dibuat Superadmin atau otomatis | F8 |
| Asisten AI & Website Editor dipertahankan atau tidak | F8 |
| Tiga fitur wajib, target tanggal, lembaga uji coba | F8 |
