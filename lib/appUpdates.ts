import { supabase } from './supabaseClient';
import { resolveTenantContext } from './permissions';

export interface AppUpdateItem {
    category: 'Fitur Baru' | 'Peningkatan' | 'Perbaikan';
    title: string;
    description: string;
}

export interface AppUpdateRelease {
    id: string;
    version: string;
    releaseDate: string;
    title: string;
    summary: string;
    isLatest?: boolean;
    items: AppUpdateItem[];
}

export const APP_UPDATES: AppUpdateRelease[] = [
    {
        id: 'update-v2-5-0',
        version: 'v2.5.0',
        releaseDate: '5 Oktober 2026',
        title: 'Sistem Proteksi 3 Lapis (Anti-Refresh), Auto-Save Draf & Penataan Antarmuka Akademik',
        summary: 'Pembaruan keandalan data pada modul operasional akademik dengan pelindung multi-lapis anti-kehilangan data akibat tarikan scroll layar (pull-to-refresh), sistem auto-save draf lokal, serta penyelarasan antarmuka formulir.',
        isLatest: true,
        items: [
            {
                category: 'Fitur Baru',
                title: 'Pencegahan Fisik Tarikan Layar (Gesture Guard & Overscroll Containment)',
                description: 'Mencegah browser ponsel atau tablet me-reload halaman secara tidak sengaja saat melakukan scroll cepat di halaman Absensi Harian, Input Setoran Harian, dan Input Evaluasi.'
            },
            {
                category: 'Fitur Baru',
                title: 'Pelindung Navigasi & Reload Browser (beforeunload Guard)',
                description: 'Browser otomatis mencegat dan menampilkan dialog konfirmasi perlindungan jika pengguna menekan tombol muat ulang atau berpindah halaman saat ada data kehadiran atau evaluasi yang belum disimpan.'
            },
            {
                category: 'Fitur Baru',
                title: 'Auto-Save Draf Lokal & Pemulihan Otomatis',
                description: 'Setiap pengisian kehadiran dan evaluasi santri otomatis tersimpan instan ke memori perangkat (localStorage). Jika layar tertutup atau baterai habis, data otomatis dipulihkan kembali secara aman saat halaman dibuka.'
            },
            {
                category: 'Peningkatan',
                title: 'Penyelarasan Warna Peringatan Sistem & Badge Status (Soft Blue)',
                description: 'Badge indikator "Perubahan belum disimpan" dan bilah notifikasi pemulihan draf kini menggunakan tema warna biru tipis yang tenang, bersih, dan konsisten dengan seluruh tema aplikasi.'
            },
            {
                category: 'Peningkatan',
                title: 'Penyederhanaan Toolbar Halaman Setoran Harian',
                description: 'Menghapus tombol "Pengaturan" di samping tombol "Simpan Kehadiran" pada halaman Setoran Harian, mencukupkan pada menu Pengaturan Evaluasi yang sudah memuat seluruh konfigurasi secara terpusat.'
            },
            {
                category: 'Peningkatan',
                title: 'Pembersihan Teks Breadcrumbs Halaman Absensi',
                description: 'Menghilangkan teks duplikat "Akademik > Absensi" di atas judul Absensi Harian, mencukupkan dengan indikator navigasi breadcrumb "Akademik / Absensi" yang ada pada header utama.'
            }
        ]
    },
    {
        id: 'update-v2-4-0',
        version: 'v2.4.0',
        releaseDate: '5 Oktober 2026',
        title: 'Otomatisasi Input Absensi & Standardisasi Buku Absensi',
        summary: 'Pembaruan menyeluruh pada modul absensi halaqah dengan fitur pembacaan otomatis riwayat kehadiran tersimpan, sinkronisasi buku absensi, perataan form filter, dan notifikasi pembaruan sistem.',
        isLatest: false,
        items: [
            {
                category: 'Fitur Baru',
                title: 'Auto-Load / Prefill Absensi Harian',
                description: 'Saat memilih kombinasi tanggal dan sesi waktu yang telah diisi sebelumnya, status kehadiran seluruh santri dan musammi di setiap halaqah langsung terisi otomatis sesuai riwayat di database.'
            },
            {
                category: 'Fitur Baru',
                title: 'Sinkronisasi Riwayat ke Buku Absensi',
                description: 'Kolom-kolom sesi waktu pada Buku Absensi dan pratinjau cetak PDF kini langsung membaca status kehadiran riil (H, I, S, A, T) yang telah tercatat sebelumnya.'
            },
            {
                category: 'Fitur Baru',
                title: 'Pusat Catatan Pembaruan & Notifikasi Sematan',
                description: 'Pusat Informasi kini dilengkapi tab Catatan Pembaruan Aplikasi, serta bar sematan minimalis dengan dot badge di bagian atas aplikasi.'
            },
            {
                category: 'Peningkatan',
                title: 'Tata Letak Filter Absensi 2 Baris',
                description: 'Pemisahan baris input filter: baris atas berisi Tanggal dan Pencarian santri proporsional, baris bawah berisi Marhalah, Jenis halaqah, Waktu halaqah, dan Pilih halaqah dengan tinggi seragam 44px (h-11).'
            },
            {
                category: 'Peningkatan',
                title: 'Standardisasi Tombol Aksi',
                description: 'Penyempurnaan label tombol menjadi "Cetak Buku" dan "Simpan Absensi" (atau "Perbarui Absensi") dengan tinggi standar h-11 tanpa ikon berlebih.'
            }
        ]
    },
    {
        id: 'update-v2-3-0',
        version: 'v2.3.0',
        releaseDate: '20 September 2026',
        title: 'Optimasi Ujian Semester & Format Raport Santri',
        summary: 'Penyempurnaan kalkulasi nilai rata-rata, penguncian target capaian juz, dan tata letak raport tahfidz standar siap cetak.',
        isLatest: false,
        items: [
            {
                category: 'Fitur Baru',
                title: 'Pratinjau Raport PDF Standar',
                description: 'Tata letak raport tahfidz dengan format baku siap cetak mencakup riwayat hafalan juz, nilai ujian semester, dan catatan pembimbing.'
            },
            {
                category: 'Peningkatan',
                title: 'Kalkulasi Nilai Otomatis',
                description: 'Perhitungan nilai rata-rata otomatis pada modul ujian semester dan rekapitulasi nilai.'
            },
            {
                category: 'Perbaikan',
                title: 'Validasi Input Nilai Santri',
                description: 'Pencegahan entri ganda pada penilaian berkala dan ujian bulanan santri.'
            }
        ]
    },
    {
        id: 'update-v2-2-0',
        version: 'v2.2.0',
        releaseDate: '15 Agustus 2026',
        title: 'Integrasi Manajemen Data Master & Kehadiran Sholat',
        summary: 'Peningkatan integrasi data santri, wali kelas, musammi, dan modul pencatatan presensi sholat berjamaah lima waktu.',
        isLatest: false,
        items: [
            {
                category: 'Fitur Baru',
                title: 'Presensi Sholat Berjamaah',
                description: 'Modul pemantauan kedisiplinan sholat lima waktu untuk santri asrama dan pelaporan berkala.'
            },
            {
                category: 'Peningkatan',
                title: 'Filter Marhalah Dinamis',
                description: 'Penyelarasan opsi marhalah dan kelas di seluruh modul operasional akademik.'
            }
        ]
    }
];

const STORAGE_CUSTOM_UPDATES_KEY = 'app_custom_system_updates_v2';
const DISMISSED_BANNER_KEY = 'app_update_dismissed_version';
const LAST_READ_VERSION_KEY = 'app_update_last_read_version';

export const getStoredUpdates = (): AppUpdateRelease[] => {
    try {
        const stored = localStorage.getItem(STORAGE_CUSTOM_UPDATES_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch {}
    return APP_UPDATES;
};

export const saveStoredUpdates = async (updates: AppUpdateRelease[]): Promise<void> => {
    try {
        localStorage.setItem(STORAGE_CUSTOM_UPDATES_KEY, JSON.stringify(updates));
    } catch {}

    try {
        const ctx = await resolveTenantContext(supabase);
        if (ctx.userId && ctx.isAuthorized && ctx.organizationId && ctx.supportSession?.mode !== 'read_only') {
            await (supabase as any).from('app_settings').upsert({
                organization_id: ctx.organizationId,
                key: 'APP_SYSTEM_UPDATES',
                value: JSON.stringify(updates)
            }, { onConflict: 'organization_id,key' });
        }
    } catch (e) {
        console.error('Failed to sync updates to app_settings:', e);
    }

    notifyUpdateStateChanged();
};

export const syncUpdatesFromCloud = async (): Promise<AppUpdateRelease[]> => {
    try {
        const ctx = await resolveTenantContext(supabase);
        if (ctx.userId && ctx.isAuthorized && ctx.organizationId) {
            const { data } = await (supabase as any).from('app_settings')
                .select('value')
                .eq('organization_id', ctx.organizationId)
                .eq('key', 'APP_SYSTEM_UPDATES')
                .maybeSingle();
            if (data?.value) {
                const parsed = JSON.parse(data.value);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    localStorage.setItem(STORAGE_CUSTOM_UPDATES_KEY, JSON.stringify(parsed));
                    notifyUpdateStateChanged();
                    return parsed;
                }
            }
        }
    } catch (e) {}
    return getStoredUpdates();
};

export const getLatestUpdate = (): AppUpdateRelease => {
    const list = getStoredUpdates();
    return list.find(u => u.isLatest) || list[0] || APP_UPDATES[0];
};

export const hasUnreadUpdates = (): boolean => {
    try {
        const latest = getLatestUpdate();
        const lastRead = localStorage.getItem(LAST_READ_VERSION_KEY);
        return lastRead !== latest.version;
    } catch {
        return false;
    }
};

export const isTopBannerDismissed = (): boolean => {
    try {
        const latest = getLatestUpdate();
        const dismissed = localStorage.getItem(DISMISSED_BANNER_KEY);
        return dismissed === latest.version;
    } catch {
        return false;
    }
};

export const dismissTopBanner = (): void => {
    try {
        const latest = getLatestUpdate();
        localStorage.setItem(DISMISSED_BANNER_KEY, latest.version);
        notifyUpdateStateChanged();
    } catch {}
};

export const markUpdatesAsRead = (): void => {
    try {
        const latest = getLatestUpdate();
        localStorage.setItem(LAST_READ_VERSION_KEY, latest.version);
        notifyUpdateStateChanged();
    } catch {}
};

export const notifyUpdateStateChanged = (): void => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app_updates_changed'));
    }
};
