# Manual Operasional Sistem — Lajnah Quran SaaS

Panduan prosedur operasional standar (SOP) untuk Superadmin Platform, Admin Lembaga, dan Musammi dalam menjalankan aktivitas harian serta penanganan kasus khusus.

---

## 1. Panduan Operasional Superadmin Platform

### A. Prosedur Provisioning Tenant Baru
1. Buka menu **Organisasi & Tenant** (`/platform/tenants`).
2. Klik tombol **+ Tambah Lembaga / Tenant Baru**.
3. Masukkan data identitas:
   - Nama Lembaga (minimal 3 karakter).
   - Domain / Slug (unik).
   - Zona Waktu (default: `Asia/Jakarta`).
   - Paket Layanan (`Trial`, `Standard`, atau `Enterprise`).
4. Masukkan data Admin Pertama:
   - Nama Lengkap Admin.
   - Email Resmi Admin.
5. Klik **Simpan & Buat Tenant**:
   - Sistem akan mengeksekusi `rpc_create_tenant_with_admin` dengan status tenant awal `provisioning`.
   - Token undangan kriptografis sekali pakai (`inv_...`) akan diterbitkan.
   - Admin baru akan menerima tautan aktivasi `/invite?token=...`.
   - Begitu Admin mengaktifkan akun pertamanya, status tenant secara otomatis berubah menjadi `active`.

### B. Prosedur Break-Glass Support Access (Bantuan Teknis Tenant)
Jika ada permohonan bantuan teknis atau investigasi masalah pada lembaga tertentu:
1. Buka menu **Support Access** (`/platform/support-sessions`).
2. Pilih organisasi tujuan dari daftar tenant.
3. Tentukan mode akses:
   - `read_only`: Hanya untuk inspeksi data tanpa kemampuan manipulasi data.
   - `read_write`: Diizinkan untuk melakukan koreksi data darurat atas izin lembaga.
4. Tuliskan **Alasan Akses Wajib** (minimal 10 karakter, contoh: "Tiket bantuan #402: Koreksi salah hitung nilai santri").
5. Tentukan durasi (maksimal 2 jam).
6. Klik **Mulai Sesi Bantuan**:
   - Sistem mencatat pembuatan sesi ke database `support_access_sessions` dan tabel `audit_logs`.
   - Banner kuning peringatan sesi aktif akan muncul di bagian atas antarmuka Superadmin.
   - Sesi otomatis hangus begitu waktu kadaluarsa tercapai.

---

## 2. Panduan Operasional Admin Lembaga

### A. Alur Awal Tahun Ajaran Baru
1. Masuk ke menu **Tahun Ajaran & Kelas** (`/app/academic-years`).
2. Klik **Buat Tahun Ajaran Baru**, tentukan nama (misal: "2026/2027"), tanggal mulai, dan tanggal selesai.
3. Buat Semester 1 (Ganjil).
4. Klik **Aktifkan Tahun Ajaran**. Sistem menjamin maksimal satu tahun ajaran aktif per lembaga.
5. Pada menu **Mutasi & Kenaikan Kelas** (`/app/Enrollment-promotion`), lakukan penempatan rombel santri dari tahun ajaran sebelumnya.

### B. Prosedur Penutupan Tahun Ajaran Resmi (6 Prasyarat Wajib)
Sebelum menutup tahun ajaran, sistem memvalidasi 6 prasyarat integritas melalui `rpc_check_academic_year_closing_readiness`:
1. **Semester Tuntas**: Seluruh semester dalam tahun ajaran tersebut telah ditutup.
2. **Sesi Halaqah Terkunci**: Tidak ada sesi halaqah yang masih berstatus `open` atau `submitted`.
3. **Setoran Ter-Review**: Tidak ada setoran Al-Qur'an santri yang masih berstatus `submitted` (semua harus sudah `accepted`, `returned`, atau `voided`).
4. **Ujian Tuntas**: Seluruh santri terdaftar telah memiliki nilai ujian atau dispensasi.
5. **Raport Terbit**: Raport semester akhir telah berstatus `published`.
6. **Enrollment Tuntas**: Seluruh santri telah dipromosikan, diluluskan, atau dimutasi.

Setelah prasyarat terpenuhi, klik tombol **Tutup Tahun Ajaran Secara Resmi**.

### C. Alur Review Setoran Al-Qur'an
1. Buka menu **Setoran & Murajaah** (`/app/recitations`).
2. Filter status: **Menunggu Review (Submitted)**.
3. Periksa detail setoran santri:
   - Jika bacaan sesuai: Klik **Terima Setoran** (status berubah menjadi `accepted`).
   - Jika terdapat kesalahan fatal atau salah pencatatan oleh Musammi: Klik **Kembalikan untuk Perbaikan**, masukkan alasan tertulis (minimal 5 karakter). Status berubah menjadi `returned` dan muncul kembali di workspace Musammi.
   - Jika setoran batal/fiktif: Klik **Batalkan Setoran (Void)** dengan alasan tertulis.

### D. Penerbitan & Revisi (Amendment) Raport Resmi
1. Buka menu **Buku Nilai & Raport** (`/app/report-cards`).
2. Pilih kelas dan tahun ajaran berjalan.
3. Klik **Hitung Nilai & Publikasikan Raport**:
   - Sistem membekukan snapshot nilai santri ke dalam tabel `report_cards` dengan nomor versi `version_no = 1`.
   - Dokumen langsung terproteksi trigger kekebalan mutasi (`enforce_report_card_immutability`).
4. **Jika terjadi kesalahan nilai pasca-publikasi**:
   - Klik tombol **Buat Amandemen / Revisi Raport**.
   - Masukkan alasan revisi (minimal 5 karakter, misal: "Koreksi nilai remedial ujian juz 30").
   - Sistem menandai snapshot lama sebagai `amended`, dan menerbitkan snapshot baru dengan `version_no = 2`. Riwayat seluruh versi raport tersimpan permanen.

---

## 3. Panduan Operasional Workspace Musammi

Alur kerja harian Musammi dioptimalkan agar ringkas, responsif di ponsel pintar (smartphone), dan bebas gangguan:

```
+-------------------------------------------------------------------------------+
|                       ALUR HARIAN MUSAMMI (5 LANGKAH)                         |
|                                                                               |
|   1. Pilih Kelompok Halaqah                                                   |
|      Buka menu Sesi Halaqah (/app/sessions), pilih kelompok yang ditugaskan.  |
|                                                                               |
|   2. Tentukan Tanggal & Waktu Pertemuan                                       |
|      Pilih tanggal sesi dan waktu (Shubuh, Ashar, Maghrib, dsb.).             |
|                                                                               |
|   3. Buka Sesi (Open Session)                                                 |
|      Klik "Buka Sesi Halaqah". Roster santri aktif dibekukan ke dalam sesi.   |
|                                                                               |
|   4. Input Presensi & Setoran Santri                                          |
|      - Isi kehadiran: Hadir, Izin, Sakit, Alpa, atau Takhassus.               |
|      - Klik santri untuk mencatat setoran: Ziyadah / Sabqi / Manzil.           |
|      - Masukkan nama Surah, nomor Ayat, dan kesalahan. Simpan setoran.        |
|                                                                               |
|   5. Selesaikan & Kunci Sesi (Lock Session)                                   |
|      Setelah seluruh santri mendapatkan presensi, klik "Kunci Sesi".          |
|      Sesi terkunci permanen dan siap direview oleh Admin.                     |
+-------------------------------------------------------------------------------+
```

### Prosedur Koreksi Pasca-Kunci
Apabila Musammi salah mencatat kehadiran dan sesi telah terkunci:
- Musammi tidak dapat mengubah data secara sepihak.
- Hubungi Admin Lembaga untuk melakukan koreksi via menu **Audit & Buku Absensi** dengan menyertakan alasan tertulis resmi.
