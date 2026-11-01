# Dokumentasi Desain & Detail Fitur Sistem Absensi Halaqah (Halaqah Attendance System)

Dokumen ini memuat rincian arsitektur antarmuka, tata letak halaman, dan detail fungsionalitas dari setiap komponen/fitur yang tersedia di dalam platform Halaqah Attendance System.

## 1. Lapisan Publik & Autentikasi (Public & Auth Layer)

### 1.1. Landing Page (`/`)
Halaman depan yang berfungsi sebagai etalase publik sebelum masuk ke aplikasi utama.
- **Fitur Utama**:
  - **Hero Section**: Judul utama, subtitle, dan tombol "Masuk ke Sistem" (Call to Action).
  - **Fitur Highlight**: Menampilkan ringkasan kemampuan sistem (Monitoring realtime, rekap otomatis, manajemen santri).
  - **Akses Login**: Mengarahkan pengguna langsung ke panel autentikasi.

### 1.2. Halaman Login (`/login`)
Portal autentikasi untuk masuk ke dalam dasbor.
- **Fitur Utama**:
  - **Autentikasi Firebase**: Mendukung Google Sign-In untuk kemudahan akses (SSO).
  - **Role-Based Routing**: Sistem akan mengecek Role (Peran) dari akun yang masuk. Jika role belum di-approve, sistem akan menahan akses.

### 1.3. Halaman "Akun Menunggu Persetujuan" (Pending Account Page)
Sebuah *checkpoint* / gerbang penahan bagi pengguna baru.
- **Fitur Utama**:
  - **Pesan Informasional**: Memberitahu pengguna bahwa registrasinya berhasil, namun akses masuk membutuhkan validasi manual dari Super Admin.
  - **Tombol Keluar (Logout)**: Memungkinkan pengguna membatalkan sesi jika mereka salah menggunakan akun email.

---

## 2. Tata Letak Global (Global Layout & Components)

Seluruh aplikasi internal dibungkus oleh komponen *Header* dan *Sidebar* interaktif.

### 2.1. Sidebar (Menu Navigasi Kiri)
- **Kategorisasi Menu**: Menu dibagi dalam beberapa kelompok logis: Data Master, Absensi, Akademik, Kesantrian, Pusat Laporan.
- **Dynamic Routing**: Menu "Manajemen Pengguna" (Users) hanya di-*render* jika user yang sedang aktif memiliki status *Super Admin*.
- **Collapse/Expandable**: Dapat disembunyikan (collapsed) untuk memperlebar area kerja utama. Pada perangkat mobile, sidebar menggunakan mode *off-canvas* yang ditutup-buka via *Hamburger Button*.

### 2.2. Header (Menu Navigasi Atas)
- **Informasi Profil & Organisasi**: Menampilkan nama akun pendaftar, Role saat ini, serta nama institusi/organisasi dan logonya di pojok kiri atas.
- **User Dropdown**: Menu untuk *Logout*.

### 2.3. Global Chat Widget
- Tombol mengambang (*floating button*) di pojok kanan bawah.
- Berisi ruang pesan internal/obrolan lintas divisi. Semua akun yang telah aktif bisa membaca dan mengirim pesan antar-karyawan secara *real-time*.

---

## 3. Dasbor Utama (Dashboard)

Pusat kendali eksekutif yang memberikan pantauan cepat (*high-level overview*) terhadap aktivitas hari ini.

### 3.1. Widget Kartu Ringkasan (Top Summary)
- **Total Santri**: Menampilkan total santri aktif, dikelompokkan dengan detail per marhalah (Mutawassithah, Tsanawiyyah, dll).
- **Total Musammi'**: Menampilkan jumlah pegawai / pengajar aktif.
- **Total Halaqah**: Jumlah kelompok belajar yang telah dikonfigurasi.
- **Sesi Berjalan (Total)**: Angka real-time yang memecah berapa jumlah eksekusi absensi berdasarkan Waktu/Sesi (Shubuh, Dhuha, Ashar, Maghrib, Isya) yang sudah tersimpan di database.

### 3.2. Statistik Absensi (Hari Ini / Sesi Terakhir)
- **Smart Tabel**: Menampilkan rekapitulasi data berdasarkan Marhalah.
- **Kolom Presensi**: Jumlah Hadir, Izin, Sakit, Alpa, Terlambat.
- **Fallback Data Logika**: Jika hari ini belum ada satupun data absensi, tabel akan otomatis memundurkan diri menampilkan rekapan data di **Hari Terakhir** yang memiliki aktivitas (mencegah *blank state*).
- **Grand Total Kalkulasi**: Total di bottom row dijumlahkan silang dari atas ke bawah dan kiri ke kanan.

### 3.3. Representasi Grafik
- **Tren Kehadiran Seminggu Terakhir**: Grafik batang vertikal (*Column Chart*) yang menampilkan total absensi mingguan.
- **Tren Kehadiran (30 Hari Terakhir) - Persentase**: Grafik garis lintasan (*Multi-Line Chart*) yang memperlihatkan gejolak persentase status kehadiran (Hadir hijau, Alpa merah, dst) dalam sebulan penuh.
- **Fitur Download**: Pada pojok kanan grafik terdapat tombol titik tiga vertikal untuk mengunduh chart ke format `.PNG`.

---

## 4. Manajemen Data (Data Master)

Inti dari konfigurasi sistem (CRUD = Create, Read, Update, Delete).

### 4.1. Tahun Ajaran
- **Daftar Tahun Ajaran**: Menambahkan semester/tahun ajaran (Contoh: "2023/2024 Genap").
- **Status Aktif**: Toggle aktivasi tahun ajaran, hanya 1 yang bisa di-set "Aktif" pada waktu bersamaan, menentukan ruang lingkup data di seluruh modul lainnya.

### 4.2. Data Santri & Data Musammi
- **Manajemen Individu**: Filter data berdasarkan Marhalah/Kelas. Fitur tambah satuan dan hapus.
- **Import Massal**: Menyediakan template CSV standar, dan fitur "Upload CSV" untuk ribuan data sekaligus mencegah entri data manual yang memakan waktu.

### 4.3. Data Halaqah (Mapping)
- **Formasi Grup**: Membuat relasi. 1 Halaqah = 1 Musammi + Banyak Santri + Level Marhalah + Titik Waktu (hingga 5 waktu: Shubuh, Dhuha, Ashar, Maghrib, Isya).
- **Template Excel Dinamis**: Fitur export template CSV 5 Waktu di mana kolom waktu dipisahkan (waktu1, waktu2, ..., waktu5) dan secara otomatis membaca teks (seperti "maghrib" / "shubuh") ketika diimpor kembali.

### 4.4. Wali Kelas & Wali Santri
- **Penempatan Penanggung Jawab**: Sistem mengkoneksikan pegawai tertentu menjadi penanggung jawab mutlak (*Wali Kelas*) terhadap sebuah kelas, dan orang tua penjaga kepada profil individual anak.

### 4.5. Kenaikan Kelas (Mutasi Massal)
- Antarmuka khusus (dua panel sisi-kiri & sisi-kanan) untuk memilih seluruh anggota Kelas 'A', kemudian secara serempak dimutasi/dinaikkan ke Kelas 'B' atau Marhalah lanjutan di tahun ajaran baru.

---

## 5. Operasional (Absensi & Akademik)

### 5.1. Absensi Halaqah (Input Kehadiran)
- **Top Filter**: Pencarian grup absensi berdasarkan Hari/Tanggal, Waktu (Sesi), Marhalah, dan Kelas.
- **Daftar Checkbox/Radio Status**: Satu layar penuh berisi nama-nama santri, disediakan kolom radio button horizontal untuk mengisi `Hadir | Izin | Sakit | Alpa | Terlambat` dalam 1 klik.
- **Kirim Data (Batch Submit)**: Logika *Save* merangkum semua pilihan di atas meja untuk disetorkan seklaigus via bulk insert ke database backend.

### 5.2. Buku Absensi (Ledger)
- Tabel log riwayat input (Tabel Mentah). Digunakan admin untuk men-*tracking* input absensi yang masuk pada hari tersebut. Formatnya runut waktu (*Chronological*).

### 5.3. Akademik (Evaluasi & Perkembangan)
- **Input Perkembangan Santri**: Merekam capaian Ziyadah (Tambahan hafalan), Murojaah (Pengulangan hafalan) dalam bentuk satuan halaman/juz/surah tiap pekannya.
- **Evaluasi Individu**: Memberikan nilai (*Assessment*) kualitatif per santri untuk dibawa sebagai catatan akhir semester.

---

## 6. Kesantrian

Mengawasi pola sosiokultural santri di lingkungan asrama.

### 6.1. Absensi Sholat
- Panel presensi identik dengan Absensi Halaqah, tetapi khusus dikategorikan per waktu sholat wajib 5 waktu.

### 6.2. Catatan Pelanggaran
- **Log Indisipliner**: Entri data pelanggaran per santri. Di sini admin (Bag. Kesantrian) mendaftarkan jenis pelanggaran dan poin hukuman/sanksi (Takzir).

### 6.3. Laporan Kesantrian
- Rekapitulasi gabungan performa kehadiran sholat wajib lima waktu, dan saldo sisa poin pelanggaran kedisiplinan sebagai data Rapor Asrama.

---

## 7. Pusat Laporan (Reporting & Analytics)

Modul-modul ini sangat kritis untuk pembacaan data, diperlengkapi reaktivitas yang tinggi.

### 7.1. Laporan Rekap (`/laporan/rekap`)
Halaman paling kaya analitik dalam sistem ini.
- **Filter Utama Terintegrasi**: Filter Rentang Tanggal (Start Date & End Date), Pilihan Drowpdown Dinamis (Marhalah -> Kelas -> Peran), Tipe Status Kehadiran, dan Kolom Teks Pencarian Nama.
- **Menu Ekspor Data**: Tombol hijau *Export Excel* (Mendukung unduh data dalam skala Ringkasan/Pivot maupun skala Detil Log per baris mentah).
- **Kartu Statistik Absensi (Sinkron dengan Filter)**: Tabel pivot *grouping* rekap jenjang. Memiliki tiga titik dinamis `Menu Tampilan` untuk menampilkan atau menyembunyikan kolom "Kelas" dan kolom "Waktu", yang mana datanya akan langsung menyesuaikan/mengalkulasi ulang berdasarkan filter utama yang sedang diterapkan di poin 1.
- **Tabel Rekap Individu**: Daftar skor "Nama per Nama". Menunjukkan skor agregat Hadir, Izin, Sakit, Alpa bagi satu santri di *range* tanggal tersebut.
- **Modal Detail Histori**: Klik salah satu santri -> Muncul kotak dialog Modal. Modal ini menyajikan riwayat presensi harian secara spesifik, lengkap dengan kapabilitas **Tambah Absensi Manual** (menyusul input presensi) atau **Edit/Hapus Akses Cepat** data spesifik.
- **Grafik Komparasi Laporan**: Di bawah tabel terdapat Grafik *Stacked Bar* Akumulasi Individu, *Multi-Line Chart* persentase tren periode tersorot, dan *Pie Chart* Proporsi Status Global.

### 7.2. Laporan Waktu & Laporan Kelas
- Menyediakan *view* alternatif dari Laporan Rekap, namun ditata agar memanjakan visibilitas berdasarkan orientasi yang diinginkan.
- Laporan per Waktu membedah statistik "Dhuha vs Shubuh vs Ashar" untuk mengukur di sesi mana absensi/kehadiran bolong tertinggi.
- Laporan Kelas menyiapkan laporan format "Raport/Buku Nilai" yang nyaman jika hendak di-*Print-Out* langsung ke ukuran kertas A4/F4 oleh instruktur / wali kelas.

---

## 8. Manajemen Portal Administrasi Tertinggi

### 8.1. Manajemen Pengguna (`/users`)
- Akses diunci untuk level pengembang atau jabatan ketua *Super Admin*.
- **Kendali Registrasi Baru (Approval)**: Mengubah status user yang nyangkut di Pending Page agar akunnya `Active`.
- **Edit Perilaku Peran (RBAC - Role Based Access Control)**: Mengatur identitas akun tersebut bernaung sebagai apakah ia "Musammi", "Wali Kelas", "Admin", atau "Super Admin".
- **Hapus Akun Karyawan**: Menonaktifkan akses individu dari platform pangkalan jika telah resign/keluar.
