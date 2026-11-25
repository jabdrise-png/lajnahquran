# Laporan Bug & Kendala — November 2026

Hasil uji langsung di `lajnahquran.netlify.app` (versi 2.1.0-production) dengan akun Superadmin, Admin, dan Musammi', ditambah audit kode, pada 25 November 2026. Versi lengkap (dengan bukti dan kolom status) ada di dokumen "Laporan Bug & Kendala Lajnah Quran".

Tingkat: **P0** kritis · **P1** tinggi · **P2** sedang · **P3** rendah. Kolom "Fase" merujuk ke `docs/RENCANA_V2.md`.

## P0 — Kritis

| ID | Temuan | Perbaikan | Fase |
| --- | --- | --- | --- |
| BUG-01 | Setoran gagal disimpan: `new row for relation "recitation_revisions" violates check constraint "recitation_revisions_action_check"`. Constraint ada di database produksi, tidak ada di repositori | Selaraskan constraint dengan aksi di RPC: `create_draft`, `create_submission`, `update_draft`, `update_submission`, `resubmit`, `accept`, `return`, `void`, `review` | F1 |
| BUG-02 | Validasi setoran Admin kemungkinan gagal karena tabel yang sama | Sama dengan BUG-01, lalu uji | F1 |
| BUG-03 | Konsol Superadmin menampilkan 0 santri / 0 halaqah (RLS memblokir hitungan di luar Support Access) | RPC agregat `SECURITY DEFINER` khusus superadmin | F1 |
| BUG-04 | Admin melihat "Edit User" pada akun Superadmin | Sembunyikan + tolak di RLS/RPC | F1 |
| BUG-05 | Pengguna bisa men-suspend/revoke akunnya sendiri | Larang aksi pada `auth.uid()` dan admin/superadmin aktif terakhir | F1 |

## P1 — Tinggi

| ID | Temuan | Fase |
| --- | --- | --- |
| BUG-06 | Raport bisa terbit/diamandemen tanpa nilai | F5 |
| BUG-07 | Alasan amandemen "tes" (3 karakter) lolos; validasi hanya di UI | F1 |
| BUG-08 | Alasan Support Access bisa berupa teks acak | F1 |
| BUG-09 | Setoran di tabel lama tidak muncul di ledger sesi V2 | F2 |
| BUG-10 | Marhalah tampil "Mutawassithah" di roster sesi, "Wustha" di tempat lain | F2 |
| BUG-11 | Slot Isya tidak muncul walau halaqah dijadwalkan Isya | F3 |
| BUG-12 | Santri Izin bisa diberi setoran di Sesi Halaqah | F3 |
| BUG-13 | Predikat setoran manual, default Mumtaz | F3 |
| BUG-14 | Statistik kehadiran per marhalah 0% padahal global 100% | F2 |
| BUG-15 | Dashboard Musammi' menampilkan tugas Admin & statistik seluruh lembaga | F4 |
| BUG-16 | Pesan error database mentah tampil ke pengguna | F1 |

## P2 — Sedang

| ID | Temuan | Fase |
| --- | --- | --- |
| BUG-17 | Halaman butuh 8–15 detik sampai data tampil | F7 |
| BUG-18 | Seluruh halaman dimuat ulang setelah simpan | F7 |
| BUG-19 | Error 401 di hampir setiap halaman, 400 di Rubrik & Sesi | F7 |
| BUG-20 | Sesi Halaqah sulit dipakai di HP (tabel terpotong) | F3/F7 |
| BUG-21 | Bundle JS 4,58 MB satu file; Tailwind dari CDN Play | F7 |
| BUG-22 | Filter kelas "1A" ganda tanpa marhalah | F2 |
| BUG-23 | Semester Genap aktif sejak 1 November; label status ganda | F8 |
| BUG-24 | Nama akun berbeda dengan nama musammi' yang ditautkan | F2 |
| BUG-25 | Superadmin terdaftar di bawah lembaga | F2 |
| BUG-26 | Monitor API konsol menampilkan "DB: unknown" | F1 |
| BUG-27 | Pustaka `xlsx` 0.18.5 rentan | F7 |
| BUG-28 | Teks dan tombol terlalu kecil | F7 |

## P3 — Rendah

| ID | Temuan | Fase |
| --- | --- | --- |
| BUG-29 | Superadmin diarahkan ke Support Access setelah login | F1 |
| BUG-30 | Waktu relatif berbahasa Inggris ("20 days ago") | F8 |
| BUG-31 | Judul/`lang`/favicon belum sesuai merek | F8 |
| BUG-32 | Testimoni & angka contoh di landing/login | F8 |
| BUG-33 | NIS santri kosong | F2 |
| BUG-34 | Dokumentasi lama tidak sesuai kode | F8 |
| BUG-35 | Kode sulit dirawat (829 `any`, file 2.000–6.000 baris) | F8 |

## Data uji yang dibuat di produksi

- Sesi halaqah 002, 25/11/2026 Maghrib (3 Hadir, 1 Izin), terkunci.
- Satu Support Access read-only, sudah diakhiri.
- Satu percobaan setoran An-Naba' 1–16 (gagal tersimpan).
