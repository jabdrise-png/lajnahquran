# Fase 3 – Absensi & Setoran Sesuai Spesifikasi: Cara Pasang & Uji

Fase ini menyederhanakan pekerjaan harian:

- **Absensi**: satu layar untuk semua halaqah per waktu, termasuk badal musammi'. Tidak ada lagi Kunci Sesi.
- **Setoran**: langsung sah (tidak ada validasi Admin), halaman & predikat dihitung otomatis, Rasib = diulang.

## 1. Sebelum mulai

1. Migrasi Fase 1 & 2 sudah dijalankan (sampai `2026_11_27_09_f2_cabut_akses_tabel_lama.sql`).
2. Buat cadangan (Supabase > Database > Backups). Migrasi ini mengubah status setoran lama (lihat 2.2).

## 2. Jalankan migrasi (berurutan, satu file per kali, di SQL Editor)

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | `2026_11_28_01_f3_mushaf_kelancaran_arah.sql` | Tabel ayat mushaf Madinah (`quran_ayahs`, 6.236 ayat) + `fn_hitung_halaman`; **Tabel Kelancaran** (`fluency_rules`) + `fn_predikat_kelancaran`; kolom `recitation_entries.is_repeat`; kolom `santri.arah_hafalan` (bawaan `mundur`) |
| 2 | `2026_11_28_02_f3_setoran_langsung_sah.sql` | Setoran langsung sah; server menghitung halaman & predikat; koreksi/batal hanya Admin beralasan; santri Sakit/Izin/Alpa tidak bisa setor; badal boleh mencatat |
| 3 | `2026_11_28_03_f3_absensi_tanpa_kunci.sql` | Hapus Kunci Sesi; absensi hari ini bebas diperbarui; tanggal lampau = koreksi Admin beralasan; nama pencatat; badal; cek jadwal bentrok |

Ketiganya aman dijalankan ulang. Setelah file 3, **langsung deploy** kode Fase 3 (layar lama memanggil fungsi kunci sesi yang sudah dihapus).

### 2.1 Pemeriksaan cepat setelah migrasi

```sql
-- harus 6236
select count(*) from public.quran_ayahs;
-- An-Naba 1–40 = ±1,5 halaman
select public.fn_hitung_halaman(78, 1, 78, 40);
-- tabel kelancaran tiap lembaga (5 baris bawaan)
select o.name, f.sort_order, f.predicate, f.max_major, f.max_minor, f.is_repeat
from public.fluency_rules f join public.organizations o on o.id = f.organization_id order by 1, 2;
-- tidak ada lagi status lama
select status, count(*) from public.recitation_entries group by 1;          -- hanya accepted / voided
select status, count(*) from public.halaqah_sessions group by 1;            -- tidak ada locked
```

### 2.2 Perubahan data yang terjadi

- Setoran berstatus `draft` / `submitted` / `returned` diubah menjadi `accepted` (sah). Setoran `voided` tetap.
- Sesi `locked` diubah menjadi `completed`.
- Setoran lama ber-predikat "Rasib…" ditandai `is_repeat = true` (tidak menambah hafalan).
- Predikat & halaman setoran lama **tidak dihitung ulang**.

## 3. Deploy

1. Merge cabang `fase-3-absensi-setoran` → Netlify deploy.
2. Buka **Pengaturan > Referensi Data Dasar > Tabel Kelancaran**, cocokkan batas khoto dengan aturan lembaga (lihat 5).
3. Atur **arah hafalan** santri yang menghafal maju (Data Santri > Edit). Bawaan semua santri `Mundur`.

## 4. Uji manual (checklist "Selesai jika")

Login sebagai Admin, lalu sebagai Musammi'. Pakai tanggal hari ini.

### Absensi (menu Absensi & Rekap > Absensi)

- [ ] Pilihan waktu hanya waktu yang dipakai jadwal halaqah (BUG-11). Halaqah Ashar tidak muncul di Shubuh.
- [ ] Admin melihat semua halaqah; Musammi' hanya halaqahnya.
- [ ] Tiap kartu: status musammi' + santri; "Tandai semua Hadir" → ubah 1–2 santri → **Simpan**. Ulangi untuk 3 halaqah: total **< 2 menit**.
- [ ] Di bawah kartu muncul "oleh {nama} {jam}".
- [ ] Ubah status santri hari ini lalu simpan lagi → berhasil tanpa alasan.
- [ ] Centang **Badal**, pilih musammi' pengganti → simpan. Login sebagai musammi' pengganti → halaqah itu muncul dan ia bisa mencatat setoran hari itu.
- [ ] Ganti tanggal ke kemarin: Musammi' tidak bisa mengubah; Admin bisa setelah mengisi alasan (≥ 5 karakter). Cek Audit Log.
- [ ] Admin: bila ada musammi'/santri terjadwal di 2 halaqah pada waktu yang sama, muncul peringatan jadwal bentrok.
- [ ] **Tidak ada tombol Kunci Sesi** di Absensi maupun Sesi Halaqah.

### Setoran (Sesi Halaqah > tab Setoran, atau Setoran & Murojaah > Catat setoran)

- [ ] Santri yang berstatus Sakit/Izin/Alpa tidak bisa dipilih (abu-abu).
- [ ] Pilih santri → ayat awal terisi otomatis sesuai arah hafalan & setoran terakhir.
- [ ] Halaman terhitung otomatis; isi khoto kabir/shoghir → predikat muncul otomatis.
- [ ] Simpan → langsung pindah ke santri berikutnya. 5 setoran dari HP, masing-masing **< 15 detik**.
- [ ] Khoto kabir 3 → predikat **Rasib · diulang**. Setoran berikutnya santri itu otomatis mengulang rentang yang sama; total hafalan tidak bertambah.
- [ ] Musammi' tidak melihat tombol Koreksi/Batalkan. Admin: Koreksi & Batalkan meminta alasan; riwayat revisi tercatat.
- [ ] **Tidak ada tombol Validasi / Terima / Kembalikan** setoran; Dashboard tidak lagi menampilkan "setoran menunggu review".
- [ ] Bila notifikasi Telegram setoran aktif (Pengaturan Setoran), wali menerima pesan berisi predikat (dan "(diulang)" untuk Rasib).

### Pengaturan

- [ ] Tabel Kelancaran: ubah batas Mumtaz, kotak "Coba" langsung menampilkan predikat baru; setoran baru memakai aturan baru.

## 5. Keputusan (dikonfirmasi 26-11-2026)

| Hal | Keputusan | Cara mengubah |
| --- | --- | --- |
| Tabel kelancaran bawaan | Mumtaz kabir ≤ 0 & shoghir ≤ 1; Jayyid Jiddan ≤ 1 & ≤ 3; Jayyid ≤ 1 & ≤ 4; Maqbul ≤ 2 & ≤ 5; selebihnya Rasib (diulang) | Pengaturan > Tabel Kelancaran (per lembaga) |
| Arah hafalan bawaan | **`maju`** untuk santri baru (santri lama tidak diubah); pilihan **`dua_arah`** untuk santri yang menghafal dari depan & belakang (migrasi `2026_11_30_04`) | Data Santri > Edit |
| Aturan ubah absensi | Hari ini: bebas (Admin / musammi' yang bertugas / badal). Tanggal lampau: hanya Admin + alasan | Ubah fungsi `fn_assert_can_correct` lewat migrasi baru |
| Koreksi setoran | Admin **dan musammi' halaqah itu** (pada tanggal setoran), alasan opsional; tercatat di riwayat revisi. Pembatalan hanya Admin + alasan (migrasi `2026_11_30_04`) | Ubah `rpc_submit_recitation_entry` & `fn_validate_recitation_state_machine` lewat migrasi baru |

## 6. Test otomatis

```bash
npm run test
```

- `tests/v2/f3-database.test.ts` — 16 skenario database (halaman = kalkulator layar untuk 312 rentang, predikat, Rasib, koreksi, BUG-12, sesi tanpa kunci, koreksi tanggal lampau, badal, jadwal bentrok, arah hafalan).
- `tests/v2/f3-lib.test.ts` — predikat layar = predikat database (grid kabir × shoghir, juga setelah tabel diubah), arah hafalan maju/mundur, pesan wali, pilihan waktu (BUG-11), halaqah milik musammi'/badal, roster per tanggal, dan pemeriksaan kode (tidak ada lagi kunci sesi/validasi).
- Suite lama `scripts/verify-fase5-sessions.ts`, `verify-fase6-recitations.ts`, `verify-fase8-e2e.ts` diperbarui mengikuti alur Fase 3.

## 7. Kembali ke versi sebelumnya

Tiap file migrasi punya bagian *Rollback* di komentarnya. Status `draft/submitted/returned` dan `locked` yang sudah diubah **tidak** bisa dikembalikan otomatis; pulihkan dari cadangan bila perlu.
