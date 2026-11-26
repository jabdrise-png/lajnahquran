# Fase 4 – Rekap Periode: Cara Pasang & Uji

Mulai fase ini setiap santri punya **satu angka resmi per periode** (Rekap Periode, tabel `period_recaps`). Progres, Statistik, Pivot, Dashboard, target, dan Raport membaca rekap ini.

- **Mode Harian** (per halaqah): ziyadah, murojaah, posisi & total hafalan, kelancaran, kehadiran dihitung otomatis dari setoran & absensi harian. Tidak ada lagi "Tarik Data" / sinkronisasi.
- **Mode Rekap**: musammi' mengisi sekali di akhir periode lewat **Form Evaluasi Periode**.
- Form: *Belum diisi → Draft → Terkirim*. Admin memantau semua halaqah dan bisa membuka kembali / mengoreksi dengan alasan.

## 1. Sebelum mulai

1. Migrasi Fase 3 sudah dijalankan (`2026_11_28_01` … `_03`).
2. **Cadangan** (Supabase > Database > Backups). Migrasi ini memindahkan data evaluasi lama.
3. Jalankan `database/checks/f4_preflight.sql` di SQL Editor (hanya membaca). Baris `PERIKSA` → kirim hasilnya ke pengembang. Bila query gagal karena `EVALUATION_PERIODS` bukan JSON yang sah, kirim isi pengaturan itu.

## 2. Jalankan migrasi (berurutan, satu file per kali)

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | `2026_11_29_01_f4_periode_dan_rekap.sql` | `evaluation_periods` (tidak boleh tumpang tindih), `halaqah.recording_mode`, `period_form_fields` (isian sistem + isian bebas + pertanyaan kegiatan), `period_forms`, `period_recaps`, data juz + `fn_total_hafalan` |
| 2 | `2026_11_29_02_f4_hitung_rekap.sql` | Hitung rekap harian, RPC form (buka / simpan draft / kirim / buka kembali), pemantauan, mode halaqah, trigger rekap ikut setoran & absensi |
| 3 | `2026_11_29_03_f4_migrasi_evaluasi_lama.sql` | Memindahkan periode & data evaluasi lama ke Rekap Periode, nilai Silabus Hafalan ke `silabus_scores`, lalu mencabut akses aplikasi ke `student_progress`, `student_evaluation`, `halaqah_evaluations`, `halaqah_evaluation_questions` |

Setelah file 3, **langsung deploy** kode Fase 4 (halaman lama membaca tabel yang aksesnya sudah dicabut). Ketiganya aman dijalankan ulang.

### 2.1 Pemeriksaan setelah migrasi

```sql
select * from public.f4_legacy_reconciliation();   -- semua OK; "Periode perlu dicek" boleh > 0 (lihat 2.2)
select name, start_date, end_date, needs_review, legacy_key from public.evaluation_periods order by start_date;
select recording_mode, count(*) from public.halaqah group by 1;
select count(*) from public.silabus_scores;
```

### 2.2 Data yang dipindahkan

| Data lama | Menjadi |
| --- | --- |
| `app_settings.EVALUATION_PERIODS` | `evaluation_periods` (kunci lama di `legacy_key`) |
| Periode tanpa tanggal / tumpang tindih | periode bertanda **perlu dicek** — perbaiki tanggalnya di Pengaturan Evaluasi; formnya belum bisa dibuka sebelum diperbaiki |
| `student_progress` Ziyadah (halaman) / Murojaah (juz) | `ziyadah_pages` / `murojaah_pages` (juz × 20) |
| Total Hafalan / Hafalan Depan + Belakang (juz) | `total_juz` |
| Surat Ayat Depan / Belakang | posisi hafalan maju / mundur |
| Kategori evaluasi (`evaluation_settings`) & kolom kualitas/catatan | isian bebas (pilihan / teks) |
| `halaqah_evaluation_questions` + `halaqah_evaluations` | pertanyaan kegiatan + jawaban di `period_forms` (status Terkirim) |
| Silabus Hafalan (`month_key` `SEM-…`) | `silabus_scores` (nilai raport per semester) |

Mode awal halaqah: **Harian** bila ada setoran harian 60 hari terakhir, selain itu **Rekap**. Data asli tersimpan di `period_recaps.legacy_payload`.

## 3. Deploy & pengaturan

1. Merge cabang `fase-4-rekap-periode` → Netlify deploy.
2. **Pengaturan Evaluasi** (`/app/targets`):
   - *Periode Evaluasi*: cek daftar, perbaiki yang bertanda **perlu dicek**, tambah periode berikutnya.
   - *Mode Pencatatan Halaqah*: pastikan tiap halaqah Harian/Rekap sesuai kenyataan.
   - *Isian Form Evaluasi Periode*: ganti nama isian sistem bila perlu, rapikan isian bebas & pertanyaan kegiatan.

## 4. Uji manual ("Selesai jika")

### Mode Harian
- [ ] Buka **Setoran & Evaluasi > Form Evaluasi Periode**, pilih periode berjalan & halaqah Mode Harian → isian sistem terisi otomatis & terkunci untuk musammi'.
- [ ] Catat 1 setoran ziyadah baru (tanggal dalam periode) → buka lagi form: **Ziyadah = jumlah setoran harian**, posisi & total hafalan ikut berubah. Setoran Rasib tidak menambah.
- [ ] Isi isian bebas & evaluasi kegiatan → **Simpan Draft** → **Kirim**. Setelah terkirim, musammi' tidak bisa mengubah, dan tidak bisa menambah setoran bertanggal di periode itu.
- [ ] Admin: **Koreksi** satu santri (wajib alasan) → tanda "dikoreksi Admin"; **Kembali ke otomatis** mengembalikan angka dari setoran.

### Mode Rekap
- [ ] Ubah satu halaqah ke Mode Rekap → muncul pesan "berlaku mulai periode berikutnya"; periode berjalan tetap Harian.
- [ ] Pada periode berikutnya: isi ziyadah, murojaah, posisi hafalan ("sampai surat … ayat …"), kelancaran → **total hafalan terhitung** dari posisi. Kirim ditolak bila ada santri belum lengkap.

### Pemantauan & laporan
- [ ] **Progres & Evaluasi > Pemantauan Periode**: Admin melihat status semua halaqah (Belum diisi / Draft / Terkirim), bisa "Hitung rekap semua halaqah" dan "Buka kembali".
- [ ] Tab **Rekap Santri** menampilkan angka per santri; **Ekspor Excel** berhasil; klik nama → detail santri.
- [ ] Pivot, Statistik, Dashboard (tren hafalan, pengingat "halaqah belum mengirim rekap") dan Buku Nilai/Raport (total hafalan, nilai silabus) tampil dari Rekap Periode.
- [ ] Pengaturan Evaluasi: membuat periode yang **tumpang tindih ditolak**.

## 5. Keputusan (dikonfirmasi 26-11-2026)

| Hal | Keputusan |
| --- | --- |
| Kelancaran periode Mode Harian (Pertanyaan Terbuka di spesifikasi) | rata-rata peringkat predikat setoran dalam periode, dibulatkan ke predikat terdekat |
| Kehadiran | persen status "dihitung hadir" dari absensi sesi — **selalu dari absensi, juga di Mode Rekap** (tidak bisa diisi manual; migrasi `2026_11_30_04`) |
| Posisi hafalan | dari ziyadah terakhir (bukan Rasib) sesuai arah hafalan santri; bila tidak ada ziyadah baru, posisi periode sebelumnya. Santri **dua arah**: tiap ziyadah menambah sisi terdekat (depan/belakang) |
| Santri pindah halaqah | rekap milik halaqah tempat santri di akhir periode; setoran halaqah lama ikut dijumlah |
| Setoran mundur ke periode terkirim | hanya Admin |
| Mode awal hasil migrasi | Harian bila ada setoran 60 hari terakhir, selain itu Rekap |
| Halaqah Mode Rekap | tidak mengirim Telegram per setoran |

## 6. Test otomatis

```bash
npm run test
```

- `tests/v2/f4-database.test.ts` — 12 skenario database (total hafalan = kalkulator aplikasi, periode tumpang tindih, isian sistem, Mode Harian & koreksi Admin, form draft/kirim/terkunci, Mode Rekap, santri pindah halaqah, pemantauan, hapus periode, migrasi data lama + Silabus).
- `tests/v2/f4-lib.test.ts` — adaptor Rekap Periode ke laporan lama dengan data hasil database (kedua mode), aturan layar = server, dan pemeriksaan kode (tidak ada lagi tabel evaluasi lama / `EVALUATION_PERIODS`).

## 7. Kembali ke versi sebelumnya

Tiap file migrasi punya bagian *Rollback*. Tabel lama tidak dihapus (hanya dicabut aksesnya), jadi data asli tetap ada; namun isian baru di Rekap Periode tidak tersalin balik.
