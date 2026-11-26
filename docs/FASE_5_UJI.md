# Fase 5 – Ujian & Raport: Cara Pasang & Uji

Mulai fase ini **semua nilai ujian ada di satu tempat** (`exam_attempts`) dan **raport dihitung server**:

- **Ujian bulanan**: per *ujian bulanan ke-1, ke-2, …* tiap semester. Penguji mengisi **nilai akhir (0–100) + materi juz**.
- **Ujian semester**: penguji mengisi **khoto kabir & shoghir per juz**; nilai juz & nilai akhir dihitung otomatis dari **rubrik lembaga** (Pengaturan Nilai).
- **Remedial = percobaan baru** (percobaan lama tetap tersimpan di riwayat). Raport memakai percobaan terakhir yang sah.
- **Penguji**: musammi' halaqah santri itu, atau musammi' lain yang ditugaskan Admin (halaqah ujian). Admin bisa semua.
- **Raport 3 komponen**: ujian semester, rata-rata ujian bulanan, kehadiran — bobot total 100%. Silabus Hafalan tidak dipakai lagi.
- **Raport tidak bisa terbit** bila komponen berbobot > 0 masih kosong; daftar kekurangan tampil per santri.
- Raport cetak memuat **tanda tangan Ketua Lajnah** (nama, jabatan, gambar tanda tangan) dan **ruang tanda tangan Wali Santri**.
- Alasan koreksi & amandemen divalidasi di server.

## 1. Sebelum mulai

1. Migrasi Fase 4 sudah dijalankan (`2026_11_29_01` … `_03`).
2. **Cadangan** (Supabase > Database > Backups). Migrasi ini memindahkan nilai ujian lama.
3. Jalankan `database/checks/f5_preflight.sql` di SQL Editor (hanya membaca). Baris `PERIKSA` → kirim hasilnya ke pengembang sebelum lanjut.

## 2. Jalankan migrasi (berurutan, satu file per kali)

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | `2026_11_30_01_f5_ujian_struktur.sql` | `raport_settings` (bobot, Ketua Lajnah, tanda tangan, kota), rubrik aktif dari pengaturan lama, `monthly_exam_periods` (dari `UB_PERIODS_*`), kolom baru `exam_attempts` (periode, halaqah, rubrik, nilai per juz, status sah/dibatalkan), `exam_assignments` (penguji), `raport_catatan` |
| 2 | `2026_11_30_02_f5_rpc_ujian_raport.sql` | Rumus nilai juz & predikat, aturan penguji, `rpc_simpan_ujian`, `rpc_batal_ujian`, `rpc_simpan_catatan_raport`, komponen raport (`rpc_komponen_raport`), `rpc_publish_report_card` versi baru (menolak bila komponen kurang). Tulis langsung ke `exam_attempts` & `report_cards` dicabut |
| 3 | `2026_11_30_03_f5_migrasi_ujian_lama.sql` | Memindahkan `ujian_semester` & `ujian_bulanan` ke `exam_attempts`, catatan raport ke `raport_catatan`, lalu mencabut akses aplikasi ke kedua tabel lama |

Setelah file 2, **langsung deploy** kode Fase 5 (RPC ujian lama `rpc_record_exam_attempt` dihapus; halaman lama tidak bisa menyimpan nilai). Ketiganya aman dijalankan ulang.

### 2.1 Pemeriksaan setelah migrasi

```sql
select * from public.f5_legacy_reconciliation();      -- semua OK
select * from public.raport_settings;                  -- bobot total 100
select organization_id, version_no, initial_score, deduction_major, deduction_minor, min_score, passing_score
from public.rubric_versions where is_active;          -- satu rubrik aktif per lembaga
select academic_year_id, semester, ke, label, legacy_key from public.monthly_exam_periods order by 1, 2, 3;
select exam_type, source, status, count(*) from public.exam_attempts group by 1, 2, 3;
```

### 2.2 Data yang dipindahkan

| Data lama | Menjadi |
| --- | --- |
| `app_settings.PCT_UJIAN_SEMESTER / PCT_UJIAN_BULANAN / PCT_KEHADIRAN` | `raport_settings` — bobot `PCT_SILABUS` ditambahkan ke ujian semester, lalu diskalakan ke total 100 (tanpa pengaturan: 60 / 40 / 0) |
| `NILAI_AWAL_JUZ`, `PENGURANG_KHOTO_*`, `MIN_NILAI_JUZ`, `GLOBAL_PREDIKAT_NILAI` | rubrik aktif (`rubric_versions`) bila lembaga belum punya; KKM 70 |
| `UB_PERIODS_{tahun}[_{semester}]` | `monthly_exam_periods` (kunci lama di `legacy_key`) |
| `ujian_semester` | percobaan semester (`source = 'migrasi'`), khoto per juz di `juz_scores`; **nilai akhir lama dipertahankan** (termasuk nilai juz custom) |
| `ujian_semester.catatan` | `raport_catatan` |
| `ujian_bulanan` | percobaan bulanan per ujian bulanan ke-n; percobaan lama dari `rpc_record_exam_attempt` ditautkan & dinomori ulang |

Tabel lama tidak dihapus (hanya dicabut aksesnya). `silabus_scores` juga tidak dihapus, tetapi tidak dipakai raport lagi.

## 3. Deploy & pengaturan

1. Merge cabang `fase-5-ujian-raport` → Netlify deploy.
2. **Ujian & Raport > Pengaturan Nilai** (`/app/settings/rubrics`):
   - *Rubrik Penilaian Ujian*: cek nilai awal, pengurang kabir/shoghir, nilai minimum, KKM, skala predikat (pakai "Coba" untuk simulasi). Menyimpan membuat **versi baru**; nilai lama tidak berubah.
   - *Raport*: bobot 3 komponen (total 100%), **nama & jabatan Ketua Lajnah, kota, unggah tanda tangan** (PNG latar transparan, maks. 280 KB).
   - *Penguji Ujian*: tugaskan musammi' lain sebagai penguji satu halaqah (bulanan, semester, atau keduanya) bila perlu.
3. **Ujian Bulanan** > *Kelola ujian*: pastikan daftar ujian bulanan ke-1, ke-2, … semester berjalan sudah ada.
4. Pengaturan lama "Predikat Nilai" di Pengaturan Lembaga sekarang hanya informasi — diatur di Pengaturan Nilai.

## 4. Uji manual ("Selesai jika")

### Ujian bulanan
- [ ] Login sebagai **musammi'** → menu **Ujian > Ujian Bulanan** tampil; hanya santri halaqahnya (dan halaqah ujian yang ditugaskan) yang muncul.
- [ ] Pilih ujian ke-n, isi materi juz & nilai beberapa santri → **Simpan nilai** → predikat tampil. Nilai di luar 0–100 ditolak.
- [ ] Simpan ulang nilai santri yang sudah ada ditolak → pakai **Remedial** (muncul "percobaan 2 (remedial)"; riwayat menampilkan keduanya).
- [ ] Musammi' lain yang **tidak** ditugaskan tidak bisa mengisi santri itu; setelah ditugaskan di Pengaturan Nilai → bisa.

### Ujian semester
- [ ] **Input nilai**: isi materi juz (mis. `29-30`), khoto kabir & shoghir per juz → nilai juz & nilai akhir tampil langsung, sama dengan hasil server setelah disimpan.
- [ ] Santri di bawah KKM muncul di tab **Perlu remedial**; remedial membuat percobaan baru.
- [ ] Admin: **Koreksi** (wajib alasan ≥ 5 huruf) membatalkan percobaan terakhir dan menggantinya; alasan pendek ditolak.
- [ ] Tab **Catatan raport**: catatan tersimpan dan tampil di raport.

### Raport
- [ ] **Buku Nilai & Raport**: tiap santri menampilkan nilai semester, rata-rata bulanan, kehadiran, nilai akhir, predikat, dan **daftar kekurangan**.
- [ ] Santri **tanpa nilai ujian semester tidak bisa diterbitkan** (tombol Terbitkan melewatinya; server menolak "Raport belum bisa terbit: …").
- [ ] Terbitkan santri yang lengkap → status "Terbit"; nilai ujian santri itu terkunci untuk musammi'.
- [ ] Ubah nilai santri yang sudah terbit (Admin, koreksi) → status "nilai berubah" → **Amandemen** wajib alasan → versi raport naik.
- [ ] **Cetak / Pratinjau**: raport memuat 3 komponen, tabel juz, ujian bulanan, catatan, **tanda tangan Ketua Lajnah** (gambar hanya pada raport terbit) dan **ruang tanda tangan Wali Santri**; raport belum terbit bertanda DRAF.
- [ ] Kode verifikasi pada raport terbit bisa dicek di halaman Verifikasi Raport.

## 5. Keputusan yang perlu Anda konfirmasi

| Hal | Yang dipakai sekarang |
| --- | --- |
| Nilai yang masuk raport | percobaan **terakhir** yang sah (remedial menggantikan nilai sebelumnya, walau lebih rendah) |
| Ujian bulanan yang belum ada nilainya | hanya **peringatan**; raport tetap bisa terbit selama minimal satu nilai bulanan ada (rata-rata dari yang ada) |
| Bobot awal | dari pengaturan lama; bobot Silabus dipindah ke ujian semester; tanpa pengaturan 60 / 40 / 0 |
| Nilai juz "custom" (aplikasi lama) | dipertahankan untuk data hasil migrasi; input baru selalu dihitung dari rubrik |
| Tanda tangan Ketua Lajnah | disimpan di `raport_settings` (server lembaga), dicetak hanya pada raport terbit; raport terbit menyimpan nama/jabatan/kota + sidik (hash) gambar saat terbit |
| Setelah raport terbit | musammi' tidak bisa mengubah nilai santri itu; Admin bisa koreksi lalu amandemen |
| Kirim nilai ujian bulanan ke wali (Telegram) | tetap manual per ujian bulanan dari halaman Ujian Bulanan |

## 6. Test otomatis

```bash
npm run test
```

- `tests/v2/f5-database.test.ts` — 10 skenario database (pengaturan awal, rubrik berversi & validasi, aturan penguji & halaqah ujian, ujian bulanan + remedial + koreksi, rumus ujian semester, komponen & kekurangan raport, terbit / idempoten / amandemen / kunci nilai, filter komponen per penguji, hapus ujian bulanan berisi nilai, migrasi data lama).
- `tests/v2/f5-lib.test.ts` — rumus layar = rumus server (dua rubrik), bobot = constraint database, aturan penguji, percobaan terakhir, dan pemeriksaan kode (tidak ada lagi tabel ujian lama, `rpc_record_exam_attempt`, pengaturan `PCT_*` / `UB_PERIODS_*`, atau tulis langsung ke `exam_attempts` / `report_cards`).

## 7. Kembali ke versi sebelumnya

Tiap file migrasi punya bagian *Rollback*. Tabel ujian lama tidak dihapus, jadi data asli tetap ada; namun nilai yang dimasukkan setelah Fase 5 tidak tersalin balik ke tabel lama.
