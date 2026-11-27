# Panduan Pengguna Lajnah Quran

Panduan singkat untuk **Admin lembaga**, **Musammi'**, dan **Superadmin**. Nama menu sesuai menu samping aplikasi.

---

## A. Memulai

1. **Masuk:** buka alamat aplikasi → *Masuk*. Bisa dengan email & kata sandi atau **Masuk dengan Google** (email harus sama dengan undangan).
2. **Lupa sandi:** halaman masuk → *Lupa sandi?* → isi email → buka tautan di email → buat sandi baru (min. 8 karakter).
3. **Pasang di HP:** buka aplikasi di Chrome Android → kartu *Pasang Lajnah Quran* → *Pasang*. iPhone (Safari): *Bagikan* → *Tambah ke Layar Utama*.
4. **Dua peran:** bila akun Anda Admin sekaligus Musammi', pilih peran setelah masuk; ganti kapan saja dari bagian atas layar.
5. **Lembaga baru:** halaman masuk → *Daftar sekarang* → *Buat lembaga* (nama ma'had, no HP, kota, perkiraan santri, centang Kebijakan Privasi) → konfirmasi email → tunggu persetujuan pengelola. Setelah disetujui Anda otomatis menjadi Admin.

---

## B. Admin lembaga — persiapan awal (urut)

| # | Menu | Yang dilakukan |
| --- | --- | --- |
| 1 | **Pengaturan Lembaga** | Nama & logo lembaga. Lihat kartu *Langganan* (paket, batas santri, masa berlaku) |
| 2 | **Tahun Ajaran & Kelas** | Buat tahun ajaran + tanggal semester Ganjil/Genap; tab *Marhalah & Kelas* untuk struktur kelas |
| 3 | **Data Santri** | *Tambah Data* satu per satu atau *Impor data* (unduh template Excel dulu). Pastikan tiap santri punya kelas |
| 4 | **Data Musammi** | Tambah musammi'; *Akun Musammi* untuk membuat/menautkan akun login |
| 5 | **Kelompok Halaqah** | *Buat Baru*: nama, jenis, marhalah, waktu (Shubuh, Ashar, …), musammi', anggota santri. Tab *Jadwal & Bentrok* memeriksa jadwal ganda |
| 6 | **Akses Pengguna** | Undang Admin lain / musammi' lewat email |
| 7 | **Target & Periode Evaluasi** | Periode (mis. per bulan), mode pencatatan per halaqah (Harian/Rekap), target hafalan & murojaah |
| 8 | **Pengaturan Nilai** | Rubrik ujian (KKM, potongan kesalahan), bobot raport, tanda tangan Ketua Lajnah, penguji per halaqah |
| 9 | **Notifikasi Telegram** | Sambungkan bot, atur template & jadwal; bagikan **kode wali** tiap santri ke orang tua |

## C. Kegiatan harian (Admin & Musammi')

### Absensi & setoran
- **Sesi Halaqah:** pilih halaqah, tanggal, waktu → tab **Absensi**: ketuk status tiap santri (Hadir/Terlambat/Izin/Sakit/Alpa), *Tandai semua Hadir* bila perlu → **Simpan**.
- Tab **Setoran**: pilih santri → isi surat & ayat awal–akhir, jenis (ziyadah/murojaah), kesalahan → predikat terhitung otomatis → simpan. Wali yang tertaut menerima pesan Telegram.
- **Absensi** (Admin): semua halaqah pada satu waktu sekaligus.
- **Setoran & Murajaah:** daftar & rekap setoran dengan filter tanggal/halaqah/jenis.
- Musammi' hanya bisa mengubah absensi hari ini; tanggal lalu dikoreksi Admin dengan alasan.

### Rekap periode
- **Form Evaluasi Periode:** di akhir periode, isi/cek rekap per santri (ziyadah, murojaah, posisi hafalan, kelancaran, kehadiran) → *Kirim*. Mode Harian terisi otomatis dari setoran; Mode Rekap diisi manual.
- **Progres & Evaluasi Santri:** pantau halaqah mana yang belum mengirim, lihat rekap, pivot, dan grafik.

### Ujian & raport
- **Ujian Bulanan:** pilih ujian & halaqah → isi materi juz dan nilai → *Simpan nilai*. *Remedial* untuk ujian ulang.
- **Ujian Semester & Remedial:** *Input nilai* per santri (kesalahan kabir/shoghir per juz).
- **Buku Nilai & Raport:** cek kelengkapan → *Pratinjau* → *Terbitkan* (raport berkode verifikasi). Bila nilai berubah setelah terbit: *Amandemen*.

### Laporan
- **Buku & Rekap Absensi:** matriks kehadiran per tanggal; *Cetak* untuk buku fisik.
- **Laporan & Analitik:** ringkasan global, per kelas, tren historis; *Ekspor data* ke Excel.
- **Laporan Mudir (PDF):** pilih bulanan/semester → *Unduh PDF*.

## D. Akhir tahun ajaran
1. **Mutasi & Kenaikan Kelas:** pilih tahun ajaran sumber → pilih santri → naik kelas / lulus.
2. **Tahun Ajaran & Kelas** → *Tutup tahun ajaran*. Setelah **Ditutup**, data absensi, setoran, ujian, dan rekap tahun itu terkunci. Raport tetap bisa diterbitkan.
3. Perlu koreksi? *Buka kembali* (wajib alasan, tercatat di audit) → koreksi → tutup lagi.

## E. Wali santri (Telegram)
Wali membuka bot Telegram lembaga → kirim **kode santri** (dari Admin) → otomatis tertaut dan menerima: pesan setiap setoran (Mode Harian), rekap kehadiran mingguan, dan capaian per periode. Kirim `/anak` untuk melihat daftar anak, `/berhenti` untuk berhenti.

## F. Superadmin
- **Pendaftaran & Langganan:**
  - tab *Pendaftaran* → **Setujui** (pilih paket) atau **Tolak** (dengan alasan).
  - tab *Langganan & pembayaran* → **Catat bayar** setiap transfer (tanggal, paket, mulai berlaku, lama bulan, jumlah). Salah catat → *Riwayat* → *Batalkan*.
  - tab *Paket* → atur batas santri & harga.
- Status langganan: Aktif · Segera habis (≤ 7 hari) · Lewat masa · Belum bayar. Tidak ada penangguhan otomatis.
- **Lembaga:** buat lembaga langsung, ubah paket, tangguhkan/pulihkan (wajib alasan).
- **Sesi Bantuan:** membuka data lembaga hanya lewat sesi beralasan & berbatas waktu; semuanya tercatat di audit.

## G. Bantuan cepat
| Masalah | Coba |
| --- | --- |
| Data lama tidak muncul | Tunggu "Memuat riwayat…" selesai; laporan memuat riwayat lengkap otomatis |
| "Tahun ajaran ini sudah ditutup" saat menyimpan | Minta Admin *Buka kembali* tahun ajaran |
| Wali tidak menerima pesan | Cek di *Notifikasi Telegram* › Kode wali (tertaut?) dan tab Antrian (gagal?) |
| Muncul "Versi baru aplikasi tersedia" | Ketuk *Muat ulang* |
| Pita kuning "Tidak ada koneksi internet" | Data belum tersimpan; ulangi setelah sinyal kembali |
