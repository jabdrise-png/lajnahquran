/**
 * SyncEngine - Utilitas Kalkulasi & Sinkronisasi Setoran Harian ke Evaluasi Periodik
 * 
 * Modul ini memproses riwayat transaksi Setoran Harian (setoran_harian) santri 
 * menjadi ringkasan capaian bulanan/periodik (Ziyadah, Murojaah, Hafalan Depan/Belakang, Kelancaran)
 * berdasarkan konfigurasi dinamis AUTO_SYNC_SETORAN_CONFIG.
 */

import { 
    SetoranHarian, 
    AutoSyncSetoranConfig, 
    DEFAULT_AUTO_SYNC_SETORAN_CONFIG,
    StudentProgress,
    EvaluationSetting
} from '../types';

import {
    getSurahInfo,
    calculateHafalanMaju,
    calculateHafalanMundur,
    calculateHalamanSetoran,
    parseRentangHafalanString,
    QuranSurahInfo
} from './quranPageMap';

import { quranMetadata } from './quranUtils';

// ============================================================================
// 1. TIPE DATA & HASIL SINKRONISASI
// ============================================================================

export interface CapaianHafalanSyncResult {
    // Hafalan Depan (Rute Maju: Al-Fatihah s.d Surat <= 29)
    juzDepan: number;
    juzDepanStr: string;
    suratAyatDepan: string;
    halamanDepan: number;
    lembarDepan: number;
    targetSurahDepanId?: number;
    targetAyatDepan?: number;

    // Hafalan Belakang (Rute Mundur: An-Nas s.d Surat >= 30)
    juzBelakang: number;
    juzBelakangStr: string;
    suratAyatBelakang: string;
    halamanBelakang: number;
    lembarBelakang: number;
    targetSurahBelakangId?: number;
    targetAyatBelakang?: number;

    // Akumulasi Total
    totalJuz: number;
    totalJuzStr: string;
    totalHalaman: number;
    totalLembar: number;
}

export interface KelancaranSyncResult {
    rawAverage: number | null;
    status: 'Lancar' | 'Sedang' | 'Hancur' | null;
    poin: number | null; // 3 = Lancar, 2 = Sedang, 1 = Hancur
    totalRecordsEvaluated: number;
    resolvedOptionLabel?: string;
}

export interface SyncEngineResultPerSantri {
    santriId: number;
    periodKey: string;

    // 1. Ziyadah
    ziyadahHalaman: number;
    ziyadahHalamanStr: string;
    ziyadahRecordsCount: number;

    // 2. Murojaah
    murojaahHalaman: number;
    murojaahJuz: number;
    murojaahJuzStr: string;
    murojaahRecordsCount: number;

    // 3. Capaian Hafalan (Depan & Belakang)
    capaianHafalan: CapaianHafalanSyncResult;

    // 4. Kelancaran Hafalan
    kelancaran: KelancaranSyncResult;

    // Form Progress Values siap pakai untuk localProgress state pada halaman input evaluasi
    formProgressValues: {
        ['Ziyadah']?: string;
        ['Murojaah']?: string;
        ['Hafalan Depan']?: string;
        ['Surat Ayat Depan']?: string;
        ['Hafalan Belakang']?: string;
        ['Surat Ayat Belakang']?: string;
        ['Total Hafalan']?: string;
        [category: string]: string | undefined;
    };
}

export interface SyncEngineOptions {
    startDate?: string | null;
    endDate?: string | null;
    periodKey?: string;
    previousProgress?: StudentProgress[];
    evaluationSettings?: EvaluationSetting[];
}

// ============================================================================
// 2. UTILITAS NILAI & PERINGKAT (SKALA FORMULA)
// ============================================================================

const NILAI_RANK: Record<string, number> = {
    'mumtaz': 5,
    'jayyid jiddan': 4,
    'jayyid': 3,
    'maqbul': 2,
    'dhaif': 1,
    'rasib': 1,
    'kurang': 1
};

/**
 * Normalisasi string nama nilai setoran (menghapus spasi ekstra, tanda baca, lowercase)
 */
export function normalizeNilaiString(nilai: string | null | undefined): string {
    if (!nilai) return '';
    return nilai.toLowerCase().trim().replace(/[^a-z\s]/g, '');
}

/**
 * Mengecek apakah nilai setoran memenuhi batas minimal yang ditentukan di pengaturan
 * Mumtaz (5) >= Jayyid Jiddan (4) >= Jayyid (3) >= Maqbul (2) >= Dhaif (1)
 */
export function isNilaiMemenuhiBatas(nilai: string | null | undefined, minNilai: string | null | undefined): boolean {
    if (!minNilai) return true;
    if (!nilai) return false;
    const cleanNilai = normalizeNilaiString(nilai);
    const cleanMin = normalizeNilaiString(minNilai);
    const rankNilai = NILAI_RANK[cleanNilai] ?? 0;
    const rankMin = NILAI_RANK[cleanMin] ?? 0;
    return rankNilai >= rankMin;
}

/**
 * Konversi nilai setoran ke skala poin kelancaran:
 * Mumtaz / Jayyid Jiddan = 3
 * Jayyid / Maqbul = 2
 * Dhaif / Rasib / Kurang = 1
 */
export function getNilaiPoinKelancaran(nilai: string | null | undefined): number | null {
    if (!nilai) return null;
    const clean = normalizeNilaiString(nilai);
    if (clean.includes('mumtaz') || clean.includes('jayyid jiddan')) return 3;
    if (clean.includes('jayyid') || clean.includes('maqbul')) return 2;
    if (clean.includes('dhaif') || clean.includes('rasib') || clean.includes('kurang')) return 1;
    return null;
}

// ============================================================================
// 3. PARSER SURAT & AYAT DARI RECORD SETORAN
// ============================================================================

export interface ParsedSetoranSurahAyat {
    fromSurah: QuranSurahInfo;
    fromAyah: number;
    toSurah: QuranSurahInfo;
    toAyah: number;
}

/**
 * Mengekstrak informasi surat & ayat dari baris setoran (baik format baru maupun lama)
 */
export function parseSetoranRange(record: SetoranHarian): ParsedSetoranSurahAyat | null {
    // 1. Coba dari kolom terpisah surat_mulai, ayat_mulai, surat_selesai, ayat_selesai
    if (record.surat_mulai && record.surat_selesai) {
        const sStart = getSurahInfo(record.surat_mulai);
        const sEnd = getSurahInfo(record.surat_selesai);
        if (sStart && sEnd) {
            const aStart = Math.max(1, parseInt(String(record.ayat_mulai || '1'), 10) || 1);
            const aEnd = Math.max(1, parseInt(String(record.ayat_selesai || '1'), 10) || 1);
            return {
                fromSurah: sStart,
                fromAyah: aStart,
                toSurah: sEnd,
                toAyah: aEnd
            };
        }
    }

    // 2. Coba dari kolom tunggal record.surat & record.ayat
    if (record.surat) {
        // Cek jika record.surat berisi rentang (contoh: "Annaba 1 - annas 6")
        const parsedRentang = parseRentangHafalanString(record.surat);
        if (parsedRentang) {
            const sStart = getSurahInfo(parsedRentang.startSurah);
            const sEnd = getSurahInfo(parsedRentang.endSurah);
            if (sStart && sEnd) {
                return {
                    fromSurah: sStart,
                    fromAyah: parsedRentang.startAyah,
                    toSurah: sEnd,
                    toAyah: parsedRentang.endAyah
                };
            }
        }

        const sInfo = getSurahInfo(record.surat);
        if (sInfo) {
            let aStart = 1;
            let aEnd = sInfo.totalAyah;

            if (record.ayat) {
                const ayatStr = String(record.ayat).trim();
                const m = ayatStr.match(/^(\d+)(?:\s*[-–—s\.d]\s*(\d+))?$/);
                if (m) {
                    aStart = parseInt(m[1], 10);
                    aEnd = m[2] ? parseInt(m[2], 10) : aStart;
                }
            }

            return {
                fromSurah: sInfo,
                fromAyah: Math.max(1, aStart),
                toSurah: sInfo,
                toAyah: Math.max(1, aEnd)
            };
        }
    }

    return null;
}

/**
 * Filter record setoran berdasarkan tanggal periode
 */
export function filterSetoranByPeriod(
    records: SetoranHarian[],
    startDate?: string | null,
    endDate?: string | null,
    periodKey?: string
): SetoranHarian[] {
    return records.filter(r => {
        if (!r.tanggal) return false;
        const tgl = r.tanggal.length >= 10 ? r.tanggal.substring(0, 10) : r.tanggal;

        if (startDate && endDate) {
            const s = startDate.length >= 10 ? startDate.substring(0, 10) : startDate;
            const e = endDate.length >= 10 ? endDate.substring(0, 10) : endDate;
            return tgl >= s && tgl <= e;
        }

        if (startDate && !endDate) {
            const s = startDate.length >= 10 ? startDate.substring(0, 10) : startDate;
            return tgl >= s;
        }

        if (periodKey) {
            // Jika format YYYY-MM
            if (/^\d{4}-\d{2}$/.test(periodKey)) {
                return tgl.startsWith(periodKey);
            }
            // Jika periodKey merupakan tanggal spesifik
            if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
                return tgl <= periodKey;
            }
        }

        return true;
    });
}

// ============================================================================
// 4. PEMETAAN OPSI KUESIONER KELANCARAN DINAMIS
// ============================================================================

/**
 * Memetakan hasil kelancaran (Lancar/Sedang/Hancur dengan skor 3/2/1)
 * ke pilihan opsi kuesioner yang tersedia di evaluationSettings lembaga.
 */
export function resolveKelancaranToEvaluationOption(
    categoryName: string,
    kelancaranStatus: 'Lancar' | 'Sedang' | 'Hancur',
    kelancaranScore: number,
    settings: EvaluationSetting[]
): string {
    if (!settings || settings.length === 0) return kelancaranStatus;

    const categorySettings = settings.filter(s => 
        s.category.toLowerCase().trim() === categoryName.toLowerCase().trim()
    );

    if (categorySettings.length === 0) return kelancaranStatus;

    // 1. Prioritas 1: Cocokkan nama label persis (case-insensitive)
    const exactMatch = categorySettings.find(s => 
        s.label.toLowerCase().trim() === kelancaranStatus.toLowerCase().trim()
    );
    if (exactMatch) return exactMatch.label;

    // 2. Prioritas 2: Cocokkan opsi yang memiliki score === kelancaranScore (3, 2, 1)
    const scoreMatch = categorySettings.find(s => s.score === kelancaranScore);
    if (scoreMatch) return scoreMatch.label;

    // 3. Prioritas 3: Pemetaan berurutan jika ada 3 pilihan atau lebih
    // Urutkan opsi berdasarkan score (tertinggi ke terendah) atau urutan index
    const sorted = [...categorySettings].sort((a, b) => {
        if (a.score !== undefined && b.score !== undefined) return b.score - a.score;
        return (a.order_index ?? 0) - (b.order_index ?? 0);
    });

    if (sorted.length >= 3) {
        if (kelancaranScore === 3) return sorted[0].label;
        if (kelancaranScore === 2) return sorted[1].label;
        if (kelancaranScore === 1) return sorted[sorted.length - 1].label;
    } else if (sorted.length === 2) {
        if (kelancaranScore >= 2) return sorted[0].label;
        return sorted[1].label;
    }

    return kelancaranStatus;
}

// ============================================================================
// 5. ENGINE UTAMA: KALKULASI SINKRONISASI PER SANTRI
// ============================================================================

/**
 * Menghitung seluruh formula sinkronisasi setoran harian untuk 1 santri
 */
export function calculateSyncSetoranForSantri(
    santriId: number,
    allSetoran: SetoranHarian[],
    config: AutoSyncSetoranConfig = DEFAULT_AUTO_SYNC_SETORAN_CONFIG,
    options: SyncEngineOptions = {}
): SyncEngineResultPerSantri {
    const periodKey = options.periodKey || '';
    const activeConfig = config || DEFAULT_AUTO_SYNC_SETORAN_CONFIG;

    // 1. Ambil setoran khusus santri ini dan filter tanggal periode evaluasi
    const santriSetoranAll = allSetoran.filter(s => s.santri_id === santriId);
    const setoranInPeriod = filterSetoranByPeriod(
        santriSetoranAll,
        options.startDate,
        options.endDate,
        periodKey
    );

    // ========================================================================
    // FORMULA 1: JUMLAH ZIYADAH
    // ========================================================================
    let ziyadahHalaman = 0;
    let ziyadahRecordsCount = 0;

    const ziyadahSchemes = (activeConfig.ziyadah.selected_schemes || []).map(s => s.toLowerCase().trim());
    const minNilai = activeConfig.ziyadah.min_nilai || 'Jayyid';

    // Kumpulkan record ziyadah yang valid (memenuhi skema & min_nilai) untuk analisis capaian hafalan nanti
    const validZiyadahRecords: SetoranHarian[] = [];

    if (activeConfig.ziyadah.enabled) {
        setoranInPeriod.forEach(rec => {
            const recSkema = (rec.skema || '').toLowerCase().trim();
            const isSchemeMatched = ziyadahSchemes.length === 0 || ziyadahSchemes.some(s => recSkema === s || recSkema.includes(s));

            if (isSchemeMatched) {
                const isGradeSatisfied = isNilaiMemenuhiBatas(rec.nilai, minNilai);
                if (isGradeSatisfied) {
                    validZiyadahRecords.push(rec);
                    ziyadahRecordsCount++;

                    // Ambil jumlah halaman, jika belum terisi hitung dari rentang surat/ayat
                    let pages = rec.jumlah_halaman;
                    if (pages == null || pages <= 0) {
                        const parsed = parseSetoranRange(rec);
                        if (parsed) {
                            const res = calculateHalamanSetoran(
                                parsed.fromSurah.id,
                                parsed.fromAyah,
                                parsed.toSurah.id,
                                parsed.toAyah
                            );
                            pages = res?.halaman ?? 0;
                        }
                    }
                    ziyadahHalaman += (pages || 0);
                }
                // Catatan: Jika nilai Maqbul/Dhaif di bawah batas minimal, otomatis diabaikan (0 halaman)
            }
        });
    }

    // Bulatkan ziyadah halaman ke 1 desimal
    ziyadahHalaman = Math.round(ziyadahHalaman * 10) / 10;
    const ziyadahHalamanStr = ziyadahHalaman > 0 ? ziyadahHalaman.toString() : '';

    // ========================================================================
    // FORMULA 2: JUMLAH MUROJAAH
    // ========================================================================
    let murojaahHalaman = 0;
    let murojaahRecordsCount = 0;

    const murojaahSchemes = (activeConfig.murojaah.selected_schemes || []).map(s => s.toLowerCase().trim());

    if (activeConfig.murojaah.enabled) {
        setoranInPeriod.forEach(rec => {
            const recSkema = (rec.skema || '').toLowerCase().trim();
            const isSchemeMatched = murojaahSchemes.length === 0 || murojaahSchemes.some(s => recSkema === s || recSkema.includes(s));

            if (isSchemeMatched) {
                murojaahRecordsCount++;
                let pages = rec.jumlah_halaman;
                if (pages == null || pages <= 0) {
                    const parsed = parseSetoranRange(rec);
                    if (parsed) {
                        const res = calculateHalamanSetoran(
                            parsed.fromSurah.id,
                            parsed.fromAyah,
                            parsed.toSurah.id,
                            parsed.toAyah
                        );
                        pages = res?.halaman ?? 0;
                    }
                }
                murojaahHalaman += (pages || 0);
            }
        });
    }

    murojaahHalaman = Math.round(murojaahHalaman * 10) / 10;
    // 1 Juz = 20 Halaman standar Mushaf Madinah
    const murojaahJuz = Math.round((murojaahHalaman / 20) * 10) / 10;
    const murojaahJuzStr = murojaahJuz > 0 ? murojaahJuz.toString() : '';

    // ========================================================================
    // FORMULA 3: CAPAIAN HAFALAN DEPAN & BELAKANG
    // ========================================================================
    // Default fallback dari riwayat progress periode sebelumnya jika ada
    let prevDepanJuz = 0;
    let prevDepanSurat = '';
    let prevBelakangJuz = 0;
    let prevBelakangSurat = '';

    if (options.previousProgress && options.previousProgress.length > 0) {
        const pDepan = options.previousProgress.find(p => p.santri_id === santriId && p.progress_type === 'Hafalan Depan');
        if (pDepan?.value) prevDepanJuz = parseFloat(pDepan.value) || 0;

        const pDepanSurat = options.previousProgress.find(p => p.santri_id === santriId && p.progress_type === 'Surat Ayat Depan');
        if (pDepanSurat?.value) prevDepanSurat = pDepanSurat.value;

        const pBelakang = options.previousProgress.find(p => p.santri_id === santriId && p.progress_type === 'Hafalan Belakang');
        if (pBelakang?.value) prevBelakangJuz = parseFloat(pBelakang.value) || 0;

        const pBelakangSurat = options.previousProgress.find(p => p.santri_id === santriId && p.progress_type === 'Surat Ayat Belakang');
        if (pBelakangSurat?.value) prevBelakangSurat = pBelakangSurat.value;
    }

    // Variabel kalkulasi rute depan & belakang
    let maxDepanSurahId = 0;
    let maxDepanAyat = 0;

    let minBelakangSurahId = 999;
    let minBelakangAyat = 999;

    const method = activeConfig.hafalan.method || 'history_and_juz';

    // Jika ada record ziyadah yang valid di periode ini, cari titik terjauh sesuai metode yang dipilih
    validZiyadahRecords.forEach(rec => {
        const parsed = parseSetoranRange(rec);
        if (!parsed) return;

        const { fromSurah, fromAyah, toSurah, toAyah } = parsed;

        if (method === 'only_front') {
            // METODE 1: HANYA HAFALAN DEPAN (Kurikulum Al-Fatihah Maju)
            // Seluruh setoran dialokasikan ke Rute Depan
            const sEndId = Math.max(fromSurah.id, toSurah.id);
            const endAyah = fromSurah.id === toSurah.id 
                ? Math.max(fromAyah, toAyah) 
                : (toSurah.id >= fromSurah.id ? toAyah : fromAyah);

            if (sEndId > maxDepanSurahId || (sEndId === maxDepanSurahId && endAyah > maxDepanAyat)) {
                maxDepanSurahId = sEndId;
                maxDepanAyat = endAyah;
            }
        } else if (method === 'only_back') {
            // METODE 2: HANYA HAFALAN BELAKANG (Kurikulum Juz 30 Mundur)
            // Seluruh setoran dialokasikan ke Rute Belakang (mundur dari An-Nas 114)
            const sStartId = Math.min(fromSurah.id, toSurah.id);
            const startAyah = fromSurah.id === toSurah.id 
                ? Math.min(fromAyah, toAyah) 
                : (fromSurah.id <= toSurah.id ? fromAyah : toAyah);

            if (sStartId < minBelakangSurahId || (sStartId === minBelakangSurahId && startAyah < minBelakangAyat)) {
                minBelakangSurahId = sStartId;
                minBelakangAyat = startAyah;
            }
        } else if (method === 'standard_boundary') {
            // METODE 3: BATAS STANDAR (Depan Juz 1–27 [Surat 1–57], Belakang Juz 28–30 [Surat 58–114])
            if (fromSurah.id <= 57 || toSurah.id <= 57) {
                const sEndId = Math.min(57, Math.max(fromSurah.id, toSurah.id));
                const endAyah = fromSurah.id === toSurah.id 
                    ? Math.max(fromAyah, toAyah) 
                    : (toSurah.id >= fromSurah.id ? toAyah : fromAyah);

                if (sEndId > maxDepanSurahId || (sEndId === maxDepanSurahId && endAyah > maxDepanAyat)) {
                    maxDepanSurahId = sEndId;
                    maxDepanAyat = endAyah;
                }
            }

            if (fromSurah.id >= 58 || toSurah.id >= 58) {
                const sStartId = Math.max(58, Math.min(fromSurah.id, toSurah.id));
                const startAyah = fromSurah.id === toSurah.id 
                    ? Math.min(fromAyah, toAyah) 
                    : (fromSurah.id <= toSurah.id ? fromAyah : toAyah);

                if (sStartId < minBelakangSurahId || (sStartId === minBelakangSurahId && startAyah < minBelakangAyat)) {
                    minBelakangSurahId = sStartId;
                    minBelakangAyat = startAyah;
                }
            }
        } else {
            // METODE 4: DETEKSI RIWAYAT & POSISI JUZ (Default: Surat 1–29 Depan, Surat 30–114 Belakang)
            if (fromSurah.id <= 29 || toSurah.id <= 29) {
                const sEndId = Math.min(29, Math.max(fromSurah.id, toSurah.id));
                const endAyah = fromSurah.id === toSurah.id 
                    ? Math.max(fromAyah, toAyah) 
                    : (toSurah.id >= fromSurah.id ? toAyah : fromAyah);

                if (sEndId > maxDepanSurahId || (sEndId === maxDepanSurahId && endAyah > maxDepanAyat)) {
                    maxDepanSurahId = sEndId;
                    maxDepanAyat = endAyah;
                }
            }

            if (fromSurah.id >= 30 || toSurah.id >= 30) {
                const sStartId = Math.max(30, Math.min(fromSurah.id, toSurah.id));
                const startAyah = fromSurah.id === toSurah.id 
                    ? Math.min(fromAyah, toAyah) 
                    : (fromSurah.id <= toSurah.id ? fromAyah : toAyah);

                if (sStartId < minBelakangSurahId || (sStartId === minBelakangSurahId && startAyah < minBelakangAyat)) {
                    minBelakangSurahId = sStartId;
                    minBelakangAyat = startAyah;
                }
            }
        }
    });

    // Kalkulasi Rute Depan (Maju dari Al-Fatihah 1:1)
    let calculatedDepanJuz = method === 'only_back' ? 0 : prevDepanJuz;
    let calculatedDepanSurat = method === 'only_back' ? '' : prevDepanSurat;
    let calculatedDepanHalaman = method === 'only_back' ? 0 : prevDepanJuz * 20;

    if (method !== 'only_back' && maxDepanSurahId > 0 && maxDepanAyat > 0) {
        try {
            const majuRes = calculateHafalanMaju(maxDepanSurahId, maxDepanAyat);
            // Gunakan titik yang lebih tinggi jika sebelumnya sudah ada
            if (majuRes.totalJuzDecimal >= prevDepanJuz) {
                calculatedDepanJuz = majuRes.totalJuzDecimal;
                calculatedDepanHalaman = majuRes.totalHalaman;
                const sName = majuRes.targetSurahName;
                calculatedDepanSurat = `Al-Fatihah 1 - ${sName} ${maxDepanAyat}`;
            }
        } catch (e) {
            console.error("Gagal kalkulasi hafalan maju:", e);
        }
    }

    // Kalkulasi Rute Belakang (Mundur dari An-Nas 114:6)
    let calculatedBelakangJuz = method === 'only_front' ? 0 : prevBelakangJuz;
    let calculatedBelakangSurat = method === 'only_front' ? '' : prevBelakangSurat;
    let calculatedBelakangHalaman = method === 'only_front' ? 0 : prevBelakangJuz * 20;

    if (method !== 'only_front' && minBelakangSurahId <= 114 && minBelakangAyat < 999) {
        try {
            const mundurRes = calculateHafalanMundur(minBelakangSurahId, minBelakangAyat);
            // Gunakan titik yang lebih tinggi jika sebelumnya sudah ada
            if (mundurRes.totalJuzDecimal >= prevBelakangJuz) {
                calculatedBelakangJuz = mundurRes.totalJuzDecimal;
                calculatedBelakangHalaman = mundurRes.totalHalaman;
                const sName = mundurRes.targetSurahName;
                calculatedBelakangSurat = `${sName} ${minBelakangAyat} - An-Nas 6`;
            }
        } catch (e) {
            console.error("Gagal kalkulasi hafalan mundur:", e);
        }
    }

    const totalJuz = Math.round((calculatedDepanJuz + calculatedBelakangJuz) * 100) / 100;
    const totalHalaman = Math.round((calculatedDepanHalaman + calculatedBelakangHalaman) * 10) / 10;
    const totalLembar = Math.round((totalHalaman / 2) * 10) / 10;

    const capaianHafalan: CapaianHafalanSyncResult = {
        juzDepan: calculatedDepanJuz,
        juzDepanStr: calculatedDepanJuz > 0 ? calculatedDepanJuz.toString() : '',
        suratAyatDepan: calculatedDepanSurat,
        halamanDepan: calculatedDepanHalaman,
        lembarDepan: Math.round((calculatedDepanHalaman / 2) * 10) / 10,
        targetSurahDepanId: maxDepanSurahId > 0 ? maxDepanSurahId : undefined,
        targetAyatDepan: maxDepanAyat > 0 ? maxDepanAyat : undefined,

        juzBelakang: calculatedBelakangJuz,
        juzBelakangStr: calculatedBelakangJuz > 0 ? calculatedBelakangJuz.toString() : '',
        suratAyatBelakang: calculatedBelakangSurat,
        halamanBelakang: calculatedBelakangHalaman,
        lembarBelakang: Math.round((calculatedBelakangHalaman / 2) * 10) / 10,
        targetSurahBelakangId: minBelakangSurahId <= 114 ? minBelakangSurahId : undefined,
        targetAyatBelakang: minBelakangAyat < 999 ? minBelakangAyat : undefined,

        totalJuz,
        totalJuzStr: totalJuz > 0 ? totalJuz.toString() : '',
        totalHalaman,
        totalLembar
    };

    // ========================================================================
    // FORMULA 4: KELANCARAN HAFALAN
    // ========================================================================
    let rawAverage: number | null = null;
    let kelancaranStatus: 'Lancar' | 'Sedang' | 'Hancur' | null = null;
    let kelancaranPoin: number | null = null;
    let totalEvaluated = 0;
    let resolvedOptionLabel: string | undefined = undefined;

    if (activeConfig.kelancaran.enabled) {
        let totalScore = 0;
        setoranInPeriod.forEach(rec => {
            const poin = getNilaiPoinKelancaran(rec.nilai);
            if (poin !== null) {
                totalScore += poin;
                totalEvaluated++;
            }
        });

        if (totalEvaluated > 0) {
            rawAverage = Math.round((totalScore / totalEvaluated) * 100) / 100;
            const targetCategory = activeConfig.kelancaran.target_category_id || 'Hafalan';

            // 1. Jika ada aturan dinamis rules yang ditentukan admin
            if (activeConfig.kelancaran.rules && activeConfig.kelancaran.rules.length > 0) {
                const sortedRules = [...activeConfig.kelancaran.rules].sort((a, b) => b.min_score - a.min_score);
                const matchedRule = sortedRules.find(r => (rawAverage || 0) >= r.min_score);

                if (matchedRule) {
                    resolvedOptionLabel = matchedRule.option_label;
                } else if (activeConfig.kelancaran.fallback_option) {
                    resolvedOptionLabel = activeConfig.kelancaran.fallback_option;
                } else if (sortedRules.length > 0) {
                    resolvedOptionLabel = sortedRules[sortedRules.length - 1].option_label;
                }

                // Status umum untuk laporan
                const firstMin = sortedRules[0]?.min_score ?? 2.5;
                const secondMin = sortedRules[1]?.min_score ?? 1.6;
                if ((rawAverage || 0) >= firstMin) {
                    kelancaranStatus = 'Lancar';
                    kelancaranPoin = 3;
                } else if ((rawAverage || 0) >= secondMin) {
                    kelancaranStatus = 'Sedang';
                    kelancaranPoin = 2;
                } else {
                    kelancaranStatus = 'Hancur';
                    kelancaranPoin = 1;
                }
            } else {
                // 2. Fallback default thresholds
                const thLancar = activeConfig.kelancaran.thresholds?.lancar ?? 2.5;
                const thSedang = activeConfig.kelancaran.thresholds?.sedang ?? 1.6;

                if (rawAverage >= thLancar) {
                    kelancaranStatus = 'Lancar';
                    kelancaranPoin = 3;
                } else if (rawAverage >= thSedang) {
                    kelancaranStatus = 'Sedang';
                    kelancaranPoin = 2;
                } else {
                    kelancaranStatus = 'Hancur';
                    kelancaranPoin = 1;
                }

                // Tautkan ke opsi kuesioner dinamis pada tabel evaluation_settings
                resolvedOptionLabel = resolveKelancaranToEvaluationOption(
                    targetCategory,
                    kelancaranStatus,
                    kelancaranPoin,
                    options.evaluationSettings || []
                );
            }
        }
    }

    const kelancaran: KelancaranSyncResult = {
        rawAverage,
        status: kelancaranStatus,
        poin: kelancaranPoin,
        totalRecordsEvaluated: totalEvaluated,
        resolvedOptionLabel
    };

    // ========================================================================
    // BENTUK HASIL FORM PROGRESS MAPPING
    // ========================================================================
    const formProgressValues: Record<string, string | undefined> = {};

    if (activeConfig.ziyadah.enabled && ziyadahHalamanStr) {
        formProgressValues['Ziyadah'] = ziyadahHalamanStr;
    }

    if (activeConfig.murojaah.enabled && murojaahJuzStr) {
        formProgressValues['Murojaah'] = murojaahJuzStr;
    }

    if (activeConfig.hafalan.enabled) {
        if (capaianHafalan.juzDepanStr) {
            formProgressValues['Hafalan Depan'] = capaianHafalan.juzDepanStr;
        }
        if (capaianHafalan.suratAyatDepan) {
            formProgressValues['Surat Ayat Depan'] = capaianHafalan.suratAyatDepan;
        }
        if (capaianHafalan.juzBelakangStr) {
            formProgressValues['Hafalan Belakang'] = capaianHafalan.juzBelakangStr;
        }
        if (capaianHafalan.suratAyatBelakang) {
            formProgressValues['Surat Ayat Belakang'] = capaianHafalan.suratAyatBelakang;
        }
        if (capaianHafalan.totalJuzStr) {
            formProgressValues['Total Hafalan'] = capaianHafalan.totalJuzStr;
        }
    }

    if (activeConfig.kelancaran.enabled && resolvedOptionLabel) {
        const catName = activeConfig.kelancaran.target_category_id || 'Hafalan';
        formProgressValues[catName] = resolvedOptionLabel;
    }

    return {
        santriId,
        periodKey,
        ziyadahHalaman,
        ziyadahHalamanStr,
        ziyadahRecordsCount,
        murojaahHalaman,
        murojaahJuz,
        murojaahJuzStr,
        murojaahRecordsCount,
        capaianHafalan,
        kelancaran,
        formProgressValues
    };
}

// ============================================================================
// 6. ENGINE BATCH: KALKULASI SINKRONISASI BANYAK SANTRI
// ============================================================================

/**
 * Menghitung sinkronisasi untuk sejumlah ID santri sekaligus
 */
export function calculateSyncSetoranBatch(
    santriIds: number[],
    allSetoran: SetoranHarian[],
    config: AutoSyncSetoranConfig = DEFAULT_AUTO_SYNC_SETORAN_CONFIG,
    options: SyncEngineOptions = {}
): Record<number, SyncEngineResultPerSantri> {
    const results: Record<number, SyncEngineResultPerSantri> = {};
    santriIds.forEach(id => {
        results[id] = calculateSyncSetoranForSantri(id, allSetoran, config, options);
    });
    return results;
}
