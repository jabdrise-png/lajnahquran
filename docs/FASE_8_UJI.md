# Fase 8 (bagian 1) – Bisnis, Privasi & Siklus Tahun Ajaran: Cara Pasang & Uji

Bagian ini mengerjakan butir F8 nomor 1–7. Butir 8–9 (pecah file besar, kurangi `any`, panduan pengguna) menyusul
di **Fase 8 bagian 2**. Butir 10–13 (impor data lembaga uji ke produksi, pelatihan, uji coba 2 pekan, evaluasi)
dikerjakan pemilik bersama lembaga.

## Yang berubah

- **Paket** (Superadmin › Pendaftaran & Langganan › Paket): nama, batas santri (kosong = tanpa batas), harga per bulan & per tahun, ditawarkan/nonaktif. Bawaan: *Standar* (300 santri) dan *Lembaga Besar* (tanpa batas); harga **belum diatur** (Rp0) — isi sendiri. Paket *Uji Coba* lama dinonaktifkan (tanpa masa uji coba).
- **Pembayaran transfer manual** (tab Langganan & pembayaran): Catat bayar → tanggal transfer, paket, mulai berlaku, lama (bulan), jumlah, catatan. Masa langganan lembaga = tanggal selesai terakhir dari pembayaran sah. Pembayaran bisa dibatalkan (dengan alasan; tidak dihapus). Semua tercatat di log audit.
- **Status langganan:** Aktif · Segera habis (≤ 7 hari) · Lewat masa · Belum ada pembayaran. **Tidak ada penangguhan otomatis** — lembaga yang lewat hanya ditandai; menangguhkan tetap keputusan Superadmin.
- **Admin lembaga** melihat kartu *Langganan* di Pengaturan Lembaga (paket, santri aktif vs batas, berlaku sampai, harga) dan pita peringatan di Data Santri bila santri melebihi batas paket atau langganan hampir/sudah habis.
- **Antrean pendaftaran lembaga** (tab Pendaftaran): lembaga yang daftar sendiri dari halaman masuk (nama ma'had, no HP/WA, kota, perkiraan santri) masuk antrean. **Setujui** → lembaga aktif + pendaftar otomatis jadi Admin. **Tolak** (wajib alasan) → lembaga diarsipkan; pendaftar melihat alasannya saat masuk. Pendaftar yang menunggu melihat "sedang ditinjau".
  Superadmin tetap bisa membuat lembaga langsung dari tab Lembaga (seperti sebelumnya).
- **Kebijakan privasi** di `/privasi`; formulir daftar wajib mencentang persetujuan. Kata sandi daftar minimal 8 karakter.
- **Tahun ajaran: Aktif / Ditutup.** Setelah ditutup, data tahun itu **terkunci di database** (sesi & absensi, setoran, ujian, catatan raport, periode & rekap). Raport tetap bisa diterbitkan/diamandemen. Admin bisa **Buka kembali** (wajib alasan, tercatat di audit) untuk koreksi, lalu menutup lagi.
- **Identitas situs:** testimoni contoh di halaman depan dihapus dari bawaan.
- **Dihapus** (tidak dipakai): `pages/HalaqahData.tsx`, `pages/Reports.tsx`, `components/KelolaTargetModal.tsx`, `components/QuranHafalanInput.tsx`, `hooks/useMockData.ts`. Fitur lain tetap (sesuai keputusan pemilik).

## 1. Migrasi (berurutan)

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | `2026_12_03_01_f8_bisnis.sql` | `platform_plans`, `pembayaran_lembaga`, `pendaftaran_lembaga`, kolom langganan/kontak di `organizations`, RPC bisnis, `handle_new_user` mengisi antrean |
| 2 | `2026_12_03_02_f8_tahun_ditutup.sql` | kunci data tahun ajaran ditutup, `rpc_buka_kembali_tahun_ajaran` |

Keduanya aman dijalankan ulang. Pendaftar lama yang lembaganya masih `provisioning` otomatis masuk antrean.

```sql
select id, nama, batas_santri, aktif from public.platform_plans order by urutan;
select nama_lembaga, status from public.pendaftaran_lembaga order by created_at desc;
```

## 2. Uji manual

| # | Langkah | Hasil yang benar |
| --- | --- | --- |
| 1 | Superadmin › Pendaftaran & Langganan › Paket › Ubah *Standar*: isi harga | Tersimpan; muncul di kartu Langganan Admin |
| 2 | Logout › Daftar sekarang › Buat lembaga (isi no HP, centang privasi) › konfirmasi email › masuk | Layar "sedang ditinjau" |
| 3 | Superadmin › tab Pendaftaran › Setujui (pilih paket) | Pendaftar masuk lagi → langsung Admin lembaga baru |
| 4 | Daftar lembaga lain › Tolak dengan alasan | Pendaftar melihat alasan penolakan |
| 5 | Tab Langganan › Catat bayar (12 bulan) | Status Aktif, "Langganan sampai" sesuai; Riwayat menampilkan transfer |
| 6 | Riwayat › Batalkan | Ditandai batal; masa langganan dihitung ulang |
| 7 | Admin › Pengaturan Lembaga | Kartu Langganan benar |
| 8 | Ubah batas paket di bawah jumlah santri | Data Santri menampilkan peringatan kuota |
| 9 | Admin › Tahun Ajaran › Tutup tahun ajaran (lembaga uji) › coba simpan setoran tanggal tahun itu | Ditolak: "Tahun ajaran ini sudah ditutup…" |
| 10 | Buka kembali (dengan alasan) | Setoran bisa disimpan lagi; log audit mencatat |
| 11 | Buka `/privasi` tanpa login | Halaman tampil |

> Langkah 9–10 sebaiknya di lembaga uji/staging, bukan lembaga yang sedang dipakai.

## 3. Rollback

Lihat komentar *Rollback* di kepala tiap file migrasi. Kode: kembalikan commit Fase 8.
