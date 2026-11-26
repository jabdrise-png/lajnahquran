# Fase 6 – Telegram & Laporan Otomatis: Cara Pasang & Uji

Mulai fase ini **pesan ke wali dibuat dan dikirim server**, bukan dari HP musammi':

- **Penautan otomatis:** setiap santri punya **kode unik acak** (contoh `HT5Y-X4PS`). Wali mengirim kode ke bot → Telegram tertaut, bot membalas dengan **nama ananda**. Satu Telegram wali boleh untuk beberapa anak. Wali bisa berhenti dengan `/berhenti`.
- **Setoran:** setiap setoran baru di halaqah **Mode Harian** masuk antrian dan terkirim dalam hitungan detik (paling lambat ±1 menit).
- **Kehadiran mingguan:** otomatis pada hari & jam lembaga (bawaan **Jumat 20.00**), rekap 7 hari dari absensi.
- **Capaian per periode:** terkirim saat form evaluasi periode halaqah **dikirim**; Admin juga bisa mengirim (ulang) per periode.
- **Template pesan** dengan variabel (`{nama_santri}`, `{ziyadah}`, `{kehadiran}`, …) + pratinjau.
- **Laporan mudir PDF** bulanan (per periode) & semester.
- **WhatsApp Fonnte** tidak lagi tampil di aplikasi.

## 1. Sebelum mulai

1. Fase 5 sudah terpasang (migrasi `2026_11_30_01` … `_04`).
2. **Cadangan** database.
3. **Netlify › Site configuration › Environment variables**, pastikan ada:
   - `SUPABASE_URL` (atau `VITE_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY` — dari Supabase › Project Settings › API › `service_role`. **Rahasia:** hanya di Netlify, jangan di kode/`.env` yang ter-commit.
   Tanpa kunci ini pesan tetap masuk antrian tetapi tidak terkirim, dan penautan wali tidak berjalan.

## 2. Jalankan migrasi (berurutan)

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | `2026_12_01_01_f6_telegram_struktur.sql` | `santri.kode_telegram` (dibuat untuk semua santri), `telegram_settings` (pengaturan & template; pengaturan lama setoran dipindah), `notification_queue`, `telegram_link_attempts`, `fn_render_template` |
| 2 | `2026_12_01_02_f6_telegram_fungsi.sql` | Penautan wali, antrian + coba ulang, pemicu pesan setoran & capaian periode, jadwal kehadiran mingguan, RPC Admin |

Keduanya aman dijalankan ulang.

```sql
select count(*), count(kode_telegram), count(distinct kode_telegram) from public.santri;  -- ketiganya sama
select * from public.telegram_settings;                                                  -- satu baris per lembaga
```

## 3. Deploy & pengaturan

1. Merge cabang `fase-6-telegram-laporan` → Netlify deploy.
2. Buka `https://<situs>/api/health` → `"telegramOtomatis": "siap"`.
3. Netlify › Logs › Functions: ada fungsi **telegram-antrian** dengan jadwal tiap menit. (Fungsi terjadwal hanya berjalan di deploy produksi situs.)
4. **Pengaturan Lembaga › Integrasi Telegram:** isi **token bot** (dari @BotFather) dan **username bot**, simpan.
5. **Laporan & Wali › Notifikasi Telegram:**
   - kartu *Bot Telegram* hijau, *Pengiriman server* hijau;
   - tekan **Sambungkan bot** (sekali; ulangi bila token diganti);
   - tab *Pesan & jadwal*: periksa template & jadwal mingguan, **Simpan**.
6. Bagikan kode ke wali: tab **Kode wali** › **Undangan** (salin / WhatsApp) atau **Ekspor kode** (Excel untuk dicetak).

## 4. Uji manual ("Selesai jika")

### Penautan
- [ ] Dengan Telegram Anda sendiri, buka tautan undangan salah satu santri (atau kirim kodenya ke bot) → bot membalas **"berhasil tertaut untuk ananda <nama> (<halaqah>)"**; di tab Kode wali santri itu **Tertaut**.
- [ ] Kirim kode santri kedua dari Telegram yang sama → balasan menyebut kedua ananda. `/anak` menampilkan daftarnya.
- [ ] Kirim kode asal-asalan → "Kode tidak dikenali" (setelah 5 kali salah dalam 1 jam, diblokir sementara). Mengirim NIS/ID santri tidak menautkan apa pun.
- [ ] Tombol **Uji** → pesan uji sampai.

### Setoran (< 1 menit)
- [ ] Catat setoran untuk santri yang tertaut (halaqah Mode Harian) → pesan setoran sampai dalam beberapa detik; tab Antrian: **Terkirim**.
- [ ] Halaqah Mode Rekap → tidak ada pesan per setoran.

### Kehadiran mingguan & capaian periode
- [ ] Tab Antrian › **Kirim rekap kehadiran minggu ini** → wali menerima rekap 7 hari. Atau set jadwal ke jam berikutnya dan tunggu.
- [ ] Kirim form evaluasi periode satu halaqah → wali menerima capaian periode. Tab Antrian › pilih periode › **Kirim capaian periode** untuk kirim (ulang).

### Laporan mudir
- [ ] **Laporan & Wali › Laporan Mudir** › Bulanan › pilih periode › **Unduh PDF** → PDF berisi ringkasan lembaga, tabel per halaqah, rincian per santri.
- [ ] Jenis Semester → PDF berisi ringkasan ujian semester & raport.

### Lain-lain
- [ ] Pengaturan › Integrasi tidak lagi menampilkan WhatsApp (Fonnte); Analisis per Kelas tidak lagi punya "Kirim semua via Fonnte".
- [ ] Wali mengirim `/berhenti` → tidak menerima pesan lagi; status santri menjadi Belum.

## 5. Keputusan bawaan (bisa diubah Admin di layar)

| Hal | Bawaan |
| --- | --- |
| Kode santri | 8 huruf/angka acak tanpa huruf mirip (I, O, 0, 1); dibuat ulang Admin bila bocor (tautan yang ada tetap) |
| Penautan | hanya chat pribadi; satu Telegram untuk beberapa anak; maks. 5 kode salah/jam per chat |
| Pesan setoran | setiap setoran **baru** di Mode Harian (koreksi tidak dikirim ulang); template lama dari Pengaturan Setoran dipindahkan |
| Kehadiran mingguan | Jumat 20.00 (zona waktu lembaga, bawaan WIB); 7 hari sampai hari itu; hanya santri yang punya absensi minggu itu |
| Capaian periode | saat form periode dikirim (Mode Harian & Rekap); Admin bisa kirim ulang |
| Gagal kirim | dicoba lagi 1–2–4–8 menit (maks. 5×); wali memblokir bot / chat tidak ada → langsung gagal (Admin bisa **Ulangi**) |
| Format pesan | teks biasa (tanpa Markdown) agar nama dengan tanda baca aman |
| WhatsApp | Fonnte tidak tampil; tombol "Kirim WA" manual (membuka WhatsApp di perangkat Admin) tetap ada |

## 6. Test otomatis

```bash
npm run test
```

- `tests/v2/f6-database.test.ts` — kode unik & perlindungannya, penautan (+ batas tebakan, beberapa anak), antrian setoran (Mode Harian, token, pengaturan, template lama), RLS, kehadiran mingguan terjadwal (WIB), capaian periode + kirim ulang, pemroses antrian (kunci, coba ulang, gagal permanen), `/berhenti`, status bot.
- `tests/v2/f6-server.test.ts` — template layar = database, pengurai pesan wali, webhook penautan (klien palsu), pemroses antrian (token per lembaga, galat permanen).
- `tests/v2/f6-lib.test.ts` — hitungan laporan mudir bulanan & semester, PDF terbentuk, layar & rute terpasang, Fonnte tidak tampil.

## 7. Kembali ke versi sebelumnya

Lihat bagian *Rollback* di kedua file migrasi. Data santri tidak dihapus; antrian & pengaturan Telegram ikut terhapus bila tabelnya di-drop.
