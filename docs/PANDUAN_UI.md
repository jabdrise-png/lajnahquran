# Panduan Tampilan (UI) Lajnah Quran

Satu sumber aturan desain untuk semua layar aplikasi (`/app/*`). Dijaga test `tests/v2/f7b-ui.test.ts`.
Halaman publik (Landing, Editor Website), konsol Superadmin, dan dokumen cetak (raport, buku absensi cetak) punya gaya sendiri.

## 1. Warna

| Peran | Kelas | Nilai |
| --- | --- | --- |
| Merek / tombol utama / tautan | `blue-600` (hover `blue-700`), latar lembut `blue-50` | `#1557D5` |
| Teks utama / sekunder / keterangan | `slate-900` / `slate-600` / `slate-500` | |
| Garis & latar | garis `slate-200` (input `slate-300`), latar halaman `slate-100`, kartu putih | |
| Berhasil / Hadir | `emerald` | |
| Peringatan / Sakit | `amber` | |
| Bahaya / Alpa | `red` | |
| Info / Izin | `blue` | |
| Terlambat | `yellow` (khusus status absensi) | |

Palet `blue` di `tailwind.config.js` sudah diganti ke biru merek, jadi cukup tulis `bg-blue-600`.
**Dilarang:** warna hex di kelas (`bg-[#...]`), `indigo`, `sky`, `green`, `rose`, `gray`.

## 2. Ukuran

- **Teks:** `text-2xs` (11 px, hanya label kecil/badge), `text-xs` (12), `text-sm` (14, isi), `text-base` (16), `text-lg`/`xl`/`2xl` (judul). Di layar operasional HP pakai `text-sm sm:text-xs`. Dilarang `text-[13px]` dsb.
- **Sudut:** tombol & input `rounded-lg` (8 px), kartu `rounded-xl` (12 px), modal/panel besar `rounded-2xl` (16 px), badge/avatar `rounded-full`. Dilarang `rounded-[..]`.
- **Bayangan:** kartu `shadow-xs`, menu/modal `shadow-lg`/`shadow-xl`. Dilarang `shadow-[...]`. Tanpa efek "melompat" (`hover:-translate-y`).
- **Huruf:** Inter. `font-mono` hanya untuk kode (kode verifikasi, kode Telegram, ID, templat).

## 3. Komponen (kelas di `index.css`)

| Kebutuhan | Pakai |
| --- | --- |
| Tombol | `btn btn-primary` (satu per layar/area), `btn btn-secondary`, `btn btn-soft`, `btn btn-ghost`, `btn btn-danger`, `btn btn-danger-soft`; ukuran `btn-sm` / `btn-lg`; ikon saja `btn-icon` + `aria-label` |
| Input / pilihan / teks panjang | `field` (+ `field-label` untuk label) |
| Kartu | `card` (+ `card-body`) |
| Label status | `badge badge-hijau / badge-kuning / badge-merah / badge-biru / badge-netral` |
| Tab | wadah `tabs`, tombol `tab` + `tab-aktif` |
| Tabel | `tabel`; agar terbaca di HP tambah `tabel-kartu` dan `data-label="…"` di setiap `<td>` |
| Komponen React | `components/ui/SaaSPrimitives.tsx`: `PageHeader`, `Button`, `Input`, `Select`, `Card`, `StatCard`, `StatusBadge`, `EmptyState`, `LoadingState`, `Modal`, `ConfirmDialog` |

## 4. Pola halaman

1. **Judul:** `PageHeader` (judul + deskripsi satu kalimat, tombol di kanan). Tanpa label kapital di atas judul.
2. **Filter** di bawah judul dalam satu baris yang membungkus.
3. **Isi:** kartu / tabel (kartu di HP).
4. **Simpan:** tombol utama di kanan; bilah simpan melayang memakai `pr-20` agar tidak tertutup tombol obrolan.
5. **Memuat:** `LoadingState` ("Memuat data…"); **kosong:** `EmptyState` dengan langkah berikutnya.

## 5. Bahasa

- Semua teks bahasa Indonesia: Ekspor/Impor, Unduh, Pratinjau, Memuat…, Simpan, Batal, Hapus.
- Jangan menampilkan nama tabel/kolom/istilah teknis (`student_enrollments`, `snapshot`, `tenant`, `RLS`, `enrollment`). Pakai istilah pengguna: *kelas*, *arsip raport*, *lembaga*.
- Label normal (bukan HURUF KAPITAL), kecuali singkatan.

## 6. Aksesibilitas & HP

- Fokus keyboard terlihat (cincin biru, otomatis dari `index.css`).
- Target sentuh ≥ 40 px (tombol `btn`), tombol status absensi ≥ 44 px.
- Tidak ada geser horizontal di 375 px untuk layar operasional, ujian, dan data master.
- Modal di HP muncul dari bawah (lembar bawah) dan bisa ditutup dengan tombol ✕ atau Escape.
