# Fase 7 – HP, Performa & PWA: Cara Pasang & Uji

Yang berubah:

- **Lebih cepat dibuka.** Tailwind sekarang ikut di-build (tanpa CDN), *importmap* aistudiocdn dihapus, dan setiap halaman dimuat terpisah. Bundel awal turun dari ±1,1 MB menjadi **±205 KB (gzip)**.
- **Data per halaman.** Saat aplikasi dibuka hanya absensi & setoran **14 hari terakhir** yang dimuat, ditambah setoran terakhir tiap santri (untuk posisi hafalan). Riwayat lengkap dimuat otomatis ketika membuka halaman laporan/buku absensi/grafik/detail santri, tab **Riwayat**, atau memilih tanggal lama. Selama itu muncul penanda kecil "Memuat riwayat…".
- **Setelah simpan** absensi/setoran, hanya data absensi & setoran yang dimuat ulang (BUG-18), bukan seluruh aplikasi.
- **Perbaikan data:** setoran dulu bisa terpotong 1.000 baris oleh Supabase (setoran terbaru tidak tampil). Sekarang dimuat bertahap per 1.000 baris.
- **Galat konsol berkurang (BUG-19):** koneksi *realtime* banner pengumuman diganti cek ulang tiap 5 menit/saat aplikasi dibuka kembali; profil & izin akses tidak lagi diminta berkali-kali.
- **Tampilan HP (375 px):** tombol status absensi besar (3 kolom), teks ≥ 14 px di Sesi Halaqah, Absensi, Setoran, Form Evaluasi; tabel Ujian Bulanan, Ujian Semester, Rekap Nilai/Raport tampil sebagai **kartu** di HP; Buku Absensi menampilkan ringkasan per santri (matriks tanggal tetap di layar lebar & cetak).
- **PWA:** bisa dipasang ke layar utama HP (Android: tombol **Pasang aplikasi**; iPhone: petunjuk Bagikan → Tambah ke Layar Utama). Saat ada versi baru muncul tombol **Muat ulang**. Saat tanpa internet muncul pita kuning. Data Supabase **tidak** disimpan offline.
- **Lupa sandi?** di halaman masuk (tautan lewat email) dan **Masuk dengan Google**.
- Pustaka `xlsx 0.18.5` (ada celah keamanan) diganti `exceljs`. Impor menerima **.xlsx** dan **.csv**; berkas **.xls** lama perlu disimpan ulang sebagai .xlsx.

## 1. Migrasi (berurutan, Supabase › SQL Editor)

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | `2026_12_02_01_f7_kinerja.sql` | indeks setoran terakhir & keanggotaan halaqah, `rpc_setoran_terakhir` |
| 2 | `2026_12_02_02_f7_login_google.sql` | pengguna Google yang belum diundang tidak lagi membuat lembaga "Ma'had Baru" |

Keduanya aman dijalankan ulang. Cek:

```sql
select count(*) from public.rpc_setoran_terakhir('<id lembaga>');  -- ≤ jumlah santri × jenis setoran
```

## 2. Pengaturan Supabase (lupa sandi & Google)

1. **Authentication › URL Configuration**
   - *Site URL*: `https://<situs>`
   - *Redirect URLs*: tambahkan `https://<situs>/reset-password` dan `https://<situs>/app/dashboard`
     (untuk staging juga `https://lajnahquran.netlify.app/**`).
2. **Authentication › Emails › Reset Password**: boleh ubah ke bahasa Indonesia; tautan `{{ .ConfirmationURL }}` jangan dihapus.
   Pengiriman email bawaan Supabase dibatasi beberapa email per jam; untuk lembaga sebaiknya pasang SMTP sendiri (Authentication › SMTP Settings).
3. **Login Google**
   - Google Cloud Console › APIs & Services › Credentials › *Create OAuth client ID* (Web application).
     *Authorized redirect URI*: `https://vnyjcxcfguqtpsyprrdn.supabase.co/auth/v1/callback` (ganti dengan proyek produksi saat produksi).
     Isi juga *OAuth consent screen* (nama aplikasi "Lajnah Quran", email dukungan).
   - Supabase › Authentication › Sign In / Providers › **Google**: aktifkan, tempel *Client ID* & *Client Secret*.
   - Akun Google dengan **email yang sama** dengan akun/undangan yang sudah ada otomatis tersambung ke akun itu.
     Email Google yang belum terdaftar akan melihat layar "Akun Menunggu Aktivasi" (tidak membuat lembaga baru).
   - Bila Google belum diaktifkan, tombol menampilkan pesan "Masuk dengan Google belum diaktifkan".

## 3. Deploy

Merge cabang `fase-7-hp-pwa` → Netlify deploy. `netlify.toml` sudah mengatur header `sw.js` (tidak di-cache) dan `/assets/*` (cache 1 tahun).

## 4. Uji manual

| # | Langkah | Hasil yang benar |
| --- | --- | --- |
| 1 | Chrome HP (atau DevTools › Network: *Fast 4G*), buka Sesi Halaqah sebagai musammi' | Daftar santri & tombol absensi tampil < 3 detik |
| 2 | Simpan absensi | Tersimpan; halaman tidak berkedip memuat ulang semuanya |
| 3 | Setoran Harian, ubah "dari" ke bulan lalu | "Memuat riwayat…" sebentar, lalu data lama tampil |
| 4 | Buka Buku Absensi / Tren Historis | Data semester lengkap |
| 5 | Lebar 375 px: Sesi Halaqah, Absensi, Setoran, Ujian Bulanan, Ujian Semester, Rekap Nilai | Tidak ada geser ke samping; teks terbaca |
| 6 | Android Chrome: buka `/app/dashboard` | Muncul kartu **Pasang Lajnah Quran** → Pasang → ikon di layar utama, terbuka tanpa bilah alamat |
| 7 | iPhone Safari | Kartu "Cara pasang" → petunjuk Bagikan → Tambah ke Layar Utama |
| 8 | Mode pesawat | Pita kuning "Tidak ada koneksi internet" |
| 9 | Deploy versi baru, buka aplikasi yang terpasang | Muncul "Versi baru aplikasi tersedia" → Muat ulang |
| 10 | Halaman masuk › Lupa sandi? › email terdaftar | Email masuk; tautan membuka `/reset-password`; sandi < 8 karakter / `Mahad123!` / konfirmasi beda ditolak; sandi sah tersimpan lalu masuk dasbor |
| 11 | Tautan reset lama/dipakai dua kali | "Tautan tidak berlaku…" + tombol minta tautan baru |
| 12 | Masuk dengan Google (email akun yang ada) | Masuk ke dasbor dengan peran yang sama |
| 13 | Data Master › Santri › unduh template, isi, impor (.xlsx & .csv) | Template 2 lembar; impor berhasil |
| 14 | Konsol browser di Dasbor, Sesi, Pengaturan Nilai | Tidak ada 400/401/403 dan tidak ada galat WebSocket |

## 5. Hasil uji otomatis

- `npm run test`: semua lulus (termasuk `tests/v2/f7-database.test.ts`, `tests/v2/f7-lib.test.ts`).
- Simulasi 375 px (Playwright): 12 layar tanpa geser horizontal di halaman operasional & ujian.
- Simulasi 4 Mbps / RTT 150 ms: Sesi Halaqah siap ±1,7 detik (data uji kecil; data nyata menambah waktu kueri Supabase).

## 6. Rollback

- Kode: kembalikan commit Fase 7.
- Database: `2026_12_02_02` → jalankan ulang definisi `handle_new_user` dari `database/supabase_v2_1_production_hardening.sql` (bagian 2.1). `2026_12_02_01` → `drop function public.rpc_setoran_terakhir(uuid); drop index public.idx_recitation_entries_terakhir, public.idx_hsm_org_student_from;` (aplikasi Fase 7 tetap jalan tanpa fungsi ini, hanya posisi hafalan lama tidak terbaca di muat awal).
