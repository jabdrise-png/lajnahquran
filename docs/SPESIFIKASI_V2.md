# Spesifikasi Kebutuhan Lajnah Quran v2

Versi: 25 November 2026 · Pemilik produk: Jundi Abdullah
Sumber: kuesioner kebutuhan pemilik produk. Dokumen ini adalah **acuan utama** untuk semua perubahan kode.

> Untuk AI coding: baca bagian yang relevan sebelum mengubah kode. Jika kode lama bertentangan dengan dokumen ini, ikuti dokumen ini.

---

## 1. Ringkasan Produk

Lajnah Quran v2 adalah aplikasi web (dan PWA) untuk membantu pesantren mencatat dan memantau perkembangan tahfidz santri: hafalan, kedisiplinan, kelancaran, dan pertumbuhan hafalan.

- **Sasaran:** pondok pesantren, rumah tahfidz, SDIT/SMPIT dengan program tahfidz.
- **Masalah:** absensi halaqah dan rekap setoran masih manual di buku; tidak bisa direkap otomatis dan tidak ada notifikasi ke wali.
- **Model bisnis:** mulai dari satu ma'had, lalu dijual ke 5–10 lembaga di tahun pertama.

### Indikator berhasil

1. Semua musammi' menginput setoran harian (atau rekap periode) dari perangkat masing-masing.
2. Wali santri menerima laporan lewat Telegram.
3. Absensi tercatat dengan baik.
4. Laporan bulanan dan per periode terdokumentasi.
5. Lembaga memiliki data perkembangan tahfidz yang lengkap.

### Prinsip desain

- **Dinamis:** jenis setoran, status kehadiran, waktu halaqah, predikat, periode, bobot nilai, dan pertanyaan evaluasi diatur sendiri oleh lembaga.
- **Satu angka resmi:** semua laporan membaca **Rekap Periode** (bagian 6).
- **Sederhana dan cepat di HP:** pengguna utama berusia ±20-an, paham teknologi, sinyal sedang.
- **Tidak ada kunci data untuk sementara**, tetapi setiap perubahan oleh Admin wajib disertai alasan dan tercatat di log audit.

### Di luar cakupan versi pertama

Sertifikat/syahadah, wisuda, modul tahsin, peta mutqin per juz, penilaian tajwid/makhraj/fashahah/adab, peringatan otomatis, pengumuman internal, aplikasi Play Store, masa uji coba gratis, payment gateway, WA OTP.

---

## 2. Peran & Hak Akses

Saat ini hanya ada **tiga peran login**. Struktur hak akses harus siap menambah **Wali Kelas** dan **Wali Santri** nanti tanpa mengubah database inti.

| Peran | Login | Hak utama | Batasan |
| --- | --- | --- | --- |
| Superadmin | Ya | Mengelola sistem, lembaga, paket, pendaftaran lembaga | Masuk ke data lembaga hanya lewat sesi support beralasan yang tercatat di log audit |
| Admin Lembaga | Ya | Data master, akun musammi', periode, target, ujian, raport; memindah santri; koreksi & validasi semua data; laporan mudir; dipakai juga oleh **petugas absensi keliling** di tablet | Hanya lembaganya sendiri |
| Musammi' (termasuk santri senior) | Ya | Mengabsen santri halaqahnya, mencatat setoran santri binaan, mengisi form evaluasi periode, melihat performa halaqahnya | Hanya halaqah yang ditugaskan; koreksi setelah dikirim lewat Admin |
| Mudir | Tidak | Menerima laporan WA/PDF yang dibuat Admin | – |
| Wali Kelas | Nanti | Melihat data kelasnya saja | Kelas lain |
| Wali Santri | Nanti | Saat ini hanya menerima pesan Telegram | – |
| Musyrif | Tidak | Penerima laporan | – |

Aturan:

- Admin membuat akun musammi'. Satu orang boleh punya lebih dari satu peran.
- Validasi dan koreksi hanya oleh Admin; tidak ada peran kepala tahfidz terpisah.
- Setoran **langsung sah** setelah dicatat musammi'.
- Login: email + sandi atau Google. Lupa sandi wajib ada.
- Tidak ada akun yang bisa men-suspend dirinya sendiri; Admin tidak bisa mengubah akun Superadmin.

---

## 3. Struktur Lembaga & Data Master

Harus lancar untuk lembaga ±600 santri, 40 musammi', 45 halaqah.

| Data | Aturan |
| --- | --- |
| Marhalah | Diatur lembaga, berurutan (contoh: Ula → Wustha → Ulya → Jami'ah) |
| Kelas | Nama bebas per marhalah (Ula/Wustha: 1A…6B; Jami'ah: "Takhassus Qur'an", dll.). Selalu ditampilkan bersama marhalahnya |
| Halaqah | Fleksibel, biasanya per marhalah, diurutkan berdasarkan jumlah hafalan. Punya nama, marhalah, waktu, musammi' utama, **mode pencatatan** (bagian 6) |
| Santri | Wajib: NIS, nama, tanggal lahir, asal, marhalah & kelas, halaqah, nama wali, No HP wali, ID Telegram wali (otomatis lewat penautan bot). Foto tidak perlu |
| Musammi' | Cukup nama; jika santri aktif, ditautkan ke data santrinya |
| Wali kelas & musyrif | Nama dan kontak, untuk penerima laporan. Asrama tidak perlu |
| Kalender akademik | Tahun ajaran & semester dengan tanggal bebas |
| Periode evaluasi | Rentang tanggal dinamis buatan Admin, tidak boleh tumpang tindih |
| Referensi dinamis | Waktu halaqah, jenis halaqah, status kehadiran, jenis setoran, predikat, satuan setoran |

Santri boleh pindah halaqah/kelas di tengah semester (keputusan Admin); riwayat tetap tersimpan.

---

## 4. Alur Absensi Halaqah

Absensi dipakai oleh **dua peran** pada layar yang sama:

| Peran | Cakupan | Pemakaian |
| --- | --- | --- |
| Musammi' | Hanya halaqah yang ia pegang | Mengabsen santri halaqahnya sendiri |
| Admin | **Global**, semua halaqah | Petugas keliling dengan tablet berakun Admin mengabsen seluruh halaqah |

Keduanya menulis ke data absensi yang sama; status yang sudah terisi terlihat oleh peran lain dan boleh diperbarui (tercatat siapa yang terakhir mengubah).

1. Halaqah 30–45 menit; waktu diatur lembaga (biasanya Subuh, Ashar, Isya).
2. Sesi hanya ada jika absensi dibuka/disimpan untuk tanggal + waktu itu. Hari libur cukup tidak dibuka.
3. Untuk tiap halaqah dicatat: kehadiran **musammi'** (dengan pilihan **badal**) dan kehadiran setiap santri: Hadir, Izin, Sakit, Alpa, Terlambat (daftar diatur lembaga).
4. Tombol "Tandai semua hadir" per halaqah.
5. **Tidak ada kunci sesi.** Koreksi setelah disimpan oleh Admin dengan **alasan ≥ 5 karakter** yang tercatat di log audit (divalidasi di server).

Buku Absensi: matriks tanggal × waktu per santri & musammi'; waktu tanpa sesi tampil **kosong** dan tidak dihitung alpa; bisa diekspor Excel.

Jadwal: halaqah punya waktu dan musammi'; sistem mendeteksi bentrok musammi' atau santri di dua halaqah pada waktu sama.

---

## 5. Setoran Harian & Penilaian Kelancaran

Setoran harian dicatat musammi' dari HP, untuk halaqah ber-**Mode Harian**. Setoran langsung sah dan dikirim ke wali lewat Telegram setiap kali disimpan.

### Jenis setoran (diatur lembaga)

| Jenis | Arti | Menambah total hafalan? |
| --- | --- | --- |
| Ziyadah | Hafalan baru | **Ya** (satu-satunya) |
| Talqin | Persiapan hafalan baru | Tidak |
| Murojaah | Mengulang hafalan | Tidak |
| Tamkin | Setoran murojaah (penguatan) | Tidak |
| Sabqi | Murojaah hafalan dekat | Tidak |
| Manzil | Murojaah hafalan lama | Tidak |

Setiap jenis punya penanda `menambah_hafalan` dan `dihitung_murojaah`. Jenis bawaan per waktu diatur lembaga (Subuh → Ziyadah, Ashar → Murojaah, Isya → Murojaah).

### Isian setoran

1. Pilih santri (hanya Hadir/Terlambat jika absensi sesi sudah ada).
2. Pilih jenis setoran.
3. Pilih rentang surat:ayat; titik awal otomatis dari setoran terakhir sesuai **arah hafalan** santri (belakang→depan atau depan→belakang).
4. Jumlah halaman otomatis dari **Mushaf Madinah 15 baris, 604 halaman** (desimal, contoh 0,5).
5. Isi khoto kabir & khoto shoghir → predikat otomatis.
6. Simpan. Target < 15 detik per santri.

### Penilaian kelancaran

Saat ini hanya kelancaran. Tabel **diatur tiap lembaga** (angka contoh):

| Predikat | Batas khoto kabir | Batas khoto shoghir | Hasil |
| --- | --- | --- | --- |
| Mumtaz | 0 | 0–1 | Lanjut |
| Jayyid Jiddan | 1 | 2–3 | Lanjut |
| Jayyid | 1 | 4 | Lanjut |
| Maqbul | 2 | 5 | Lanjut |
| Rasib | > batas Maqbul | > batas Maqbul | **Ulang** |

Setoran Rasib tidak menambah total hafalan dan ditandai "ulang".

---

## 6. Inti: Rekap Periode

Setiap santri punya **satu angka resmi per periode** = Rekap Periode. Diisi dari setoran harian (Mode Harian) atau langsung oleh musammi' (Mode Rekap). Laporan, target, raport, dan pesan progres ke wali **hanya** membaca Rekap Periode.

```
Mode Harian:  Setoran harian ──(dijumlah otomatis)──┐
Mode Rekap:   Form evaluasi (diisi manual) ─────────┼──► REKAP PERIODE ──► target, raport, wali, mudir
Absensi sesi ──(persen kehadiran)───────────────────┘
```

### 6.1 Mode pencatatan per halaqah

Admin memilih mode per halaqah; perubahan berlaku mulai periode berikutnya.

| | Mode Harian | Mode Rekap |
| --- | --- | --- |
| Musammi' mencatat | Setiap setoran, setiap hari | Sekali di akhir periode |
| Ziyadah & murojaah (halaman) | Dijumlah otomatis dari setoran dalam periode | Diisi manual |
| Posisi hafalan terakhir | Otomatis dari ziyadah terakhir | Dipilih manual ("sampai surat … ayat …") |
| Total hafalan (juz/halaman) | Dari posisi hafalan + peta mushaf | Sama |
| Kelancaran | Otomatis dari predikat setoran (aturan lembaga) | Dipilih manual |
| Kehadiran | Dari absensi sesi | Dari absensi sesi (atau manual) |
| Telegram per setoran | Ada | Tidak |

### 6.2 Form evaluasi periode

Diisi musammi' sekali per halaqah per periode:

1. **Capaian santri** (satu baris per santri):
   - **Isian sistem** (tetap, dipakai perhitungan): ziyadah, murojaah, posisi hafalan, kelancaran, kehadiran. Nama boleh diganti, tidak boleh dihapus.
   - **Isian bebas** buatan Admin: angka, pilihan, ya/tidak, teks. Hanya ditampilkan.
2. **Evaluasi kegiatan halaqah**: pertanyaan buatan Admin.

Status form per halaqah: *Belum diisi → Draft → Terkirim*. Mode Harian: isian sistem terisi & terkunci (perbaiki lewat setoran harian). Admin boleh koreksi dengan alasan di log.

### 6.3 Aturan khusus

- Periode tidak boleh tumpang tindih; dipakai juga untuk target murojaah, progres ke wali, rekap mudir.
- Santri pindah halaqah di tengah periode: rekap milik halaqah tempat santri di akhir periode; setoran dari halaqah lama ikut dijumlah.
- Setoran bertanggal mundur boleh ditambah selama periode belum dikirim.
- Beralih Mode Rekap → Mode Harian: rekap lama tetap tersimpan.

---

## 7. Target Hafalan & Murojaah

| Target | Diatur per | Capaian |
| --- | --- | --- |
| Hafalan (ziyadah) | Semester & marhalah/kelas | Jumlah ziyadah dari Rekap Periode dalam semester |
| Murojaah | Periode, ambang per juz hafalan | Jumlah murojaah (jenis berpenanda `dihitung_murojaah`) dalam periode |

Ambang murojaah: "jika hafalan ≥ X juz, target murojaah = Y juz per periode" (contoh: hafal 10 juz → 10 juz; hafal 20 juz → 20 juz). Target berversi; capaian lama dihitung dengan target yang berlaku saat itu. Ditampilkan dalam persen.

---

## 8. Ujian & Raport

Penguji memakai sistem halaqah (musammi' sendiri atau halaqah khusus ujian). Teknis pelaksanaan ujian tidak diatur aplikasi.

| | Ujian Bulanan | Ujian Semester |
| --- | --- | --- |
| Input | Nilai akhir 0–100 + materi juz | Khoto kabir & shoghir **per juz** |
| Hitung | Predikat dari skala lembaga | Otomatis: nilai awal per juz − khoto, dengan batas minimum (parameter lembaga) |
| Lulus & remedial | Diatur lembaga | Sama; remedial = percobaan baru, nilai lama tidak ditimpa |

Raport:

- Hanya **per semester**.
- Komponen: ujian semester, rata-rata ujian bulanan, kehadiran; bobot diatur lembaga, total 100%.
- Tata letak mengikuti raport yang sudah ada.
- **Tidak bisa terbit** jika komponen kurang; tampilkan daftar kekurangan.
- Tanda tangan: Ketua Lajnah digital; wali santri fisik di raport cetak.
- Revisi lewat amandemen beralasan (≥ 5 karakter, divalidasi server).

---

## 9. Laporan, Notifikasi Telegram & Ekspor

Wali hanya menerima pesan teks dari bot Telegram lembaga (**no-reply**).

| Penerima | Isi | Kapan | Lewat |
| --- | --- | --- | --- |
| Wali santri | Setoran ananda | Setiap setoran (Mode Harian) | Telegram |
| Wali santri | Rekap kehadiran | Mingguan | Telegram |
| Wali santri | Capaian & progres | Setiap periode selesai | Telegram |
| Mudir | Rekap lembaga | Bulanan & semester | WA/PDF dari Admin |
| Musammi' | Performa halaqah, kehadiran, target | Kapan saja | Aplikasi |
| Wali kelas & musyrif | Rekap kelas/asuhan | Per periode | Dikirim Admin |

Penautan Telegram: setiap santri punya **kode unik**; wali mengirim kode ke bot → Chat ID tertaut otomatis (satu wali boleh beberapa anak); kode bisa dibuat ulang Admin.

Ekspor: Excel untuk semua tabel utama; PDF untuk raport dan laporan mudir.

---

## 10. Tampilan, Platform, Bisnis & Keamanan

- **Tampilan:** web + PWA, Bahasa Indonesia, sederhana, HP lebih dulu; halaman musammi'/petugas < 3 detik; nama & logo per lembaga.
- **Bisnis:** harga per paket (batas santri) diatur Superadmin; tanpa masa uji coba; pembayaran transfer manual dicatat Superadmin; lembaga daftar sendiri (antrean persetujuan) atau didaftarkan Superadmin.
- **Teknis:** Supabase + Netlify (naik ke Supabase Pro saat lembaga bertambah); kode dirawat sendiri, harus sederhana & terdokumentasi; integrasi lain belum perlu.
- **Privasi & keamanan:** isolasi data per lembaga dengan RLS; persetujuan wali diurus lembaga sebelum data diunggah; kebijakan privasi singkat; backup tersedia (tidak wajib); semua koreksi, sesi support, dan perubahan pengaturan tercatat di log audit.

---

## 11. Perubahan dari Aplikasi Sekarang (ringkas)

- **Pertahankan:** multi-tenant + RLS, audit log, Support Access; tahun ajaran/marhalah/kelas/santri + impor-ekspor Excel; halaqah, penugasan utama/badal, deteksi bentrok; Buku Absensi; `lib/quranPageMap.ts`; periode & input evaluasi + "Tarik Data"; rubrik ujian semester & remedial; raport berversi + kode verifikasi; Telegram server-side; kenaikan kelas.
- **Ubah:** satu layar absensi (Admin global, Musammi' per halaqah); sesi tanpa kunci; satu tabel setoran dengan predikat otomatis & jenis berpenanda; evaluasi → Rekap Periode; target & dashboard membaca Rekap Periode; raport 3 komponen; dashboard per peran; penautan Telegram dengan kode; angka konsol Superadmin benar.
- **Hapus/sembunyikan:** validasi setoran Accepted/Returned/Voided; kunci sesi; tabel lama setelah migrasi + halaman Rekonsiliasi; Pusat Informasi; WhatsApp Fonnte; halaman tak terpakai (`pages/Chat.tsx`, `pages/WaliSantriReport.tsx`, dll.).
- **Bangun baru:** mode per halaqah + `period_recaps`; isian sistem vs bebas; posisi hafalan; arah hafalan; kode Telegram + pesan mingguan & per periode; PDF mudir; PWA, lupa sandi, Google login; pencatatan pembayaran; peran fleksibel.

---

## 12. Pertanyaan Terbuka

- [ ] Penjelasan lengkap tentang periode (asumsi: satu daftar periode per lembaga).
- [ ] Akun Admin Lembaga dibuat Superadmin atau otomatis saat mendaftar?
- [ ] Aturan kelancaran periode di Mode Harian: % setoran lanjut, predikat terbanyak, atau rata-rata?
- [ ] Angka tabel batas khoto untuk lembaga pertama.
- [ ] Bagian aplikasi sekarang yang disukai / tidak disukai.
- [ ] Tiga fitur wajib versi pertama, fitur yang boleh menyusul, yang dihapus, target tanggal, lembaga uji coba.
- [ ] Asisten AI (Gemini) dan Website Editor: dipertahankan atau disembunyikan?
