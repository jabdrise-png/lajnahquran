
export const Marhalah = {
  Mutawassithah: 'Mutawassithah',
  Aliyah: 'Aliyah',
  Jamiah: 'Jamiah',
} as const;

export type Marhalah = string;

export const Waktu = {
  Shubuh: 'Shubuh',
  Dhuha: 'Dhuha',
  Ashar: 'Ashar',
  Maghrib: 'Maghrib',
  Isya: 'Isya',
} as const;

export type Waktu = string;

// Mengubah enum menjadi konstanta objek dan tipe string
// agar fleksibel menerima input custom dari user
export const HalaqahType = {
  Utama: 'Halaqah Utama',
  Pagi: 'Halaqah Pagi',
} as const;

export type HalaqahType = string;

export type AttendanceStatus = string;

export enum Peran {
    Santri = 'Santri',
    Musammi = 'Musammi'
}

export interface Person {
  id: number;
  kode?: string;
  nama: string;
  marhalah: Marhalah;
  kelas: string;
  marhalah_id?: string;
  kelas_id?: string;
}

export interface MasterKelas {
  id: number;
  organization_id: string;
  marhalah: string;
  nama_kelas: string;
  academic_year_id?: number | null;
}

export interface StudentClass {
  id: number;
  santri_id: number;
  academic_year_id: number;
  marhalah: Marhalah;
  kelas: string;
}

export interface Santri extends Person {
    status?: string;
    nama_wali?: string;
    no_hp_wali?: string;
    telegram_chat_id?: string;
    student_class_id?: number; // Added to track current class assignment
}
export interface Musammi extends Person {
    academic_year_id?: number;
    no_hp?: string;
    user_id?: string | null;
    santri_id?: number | null;
}

export interface AppSetting {
    id: number;
    key: string;
    value: string;
}

export interface WaliKelas {
    user_id?: string | null;
    id: number;
    academic_year_id?: number;
    nama: string;
    marhalah: Marhalah;
    kelas: string;
    no_hp?: string;
}

export interface AcademicYear {
    id: number;
    organization_id: string;
    name: string;
    active_semester: string;
    is_active: boolean;
}

export interface MasterKelas {
    id: number;
    organization_id: string;
    marhalah: Marhalah | string;
    nama_kelas: string;
}

export interface MurojaahRule {
    min_capaian: number;
    target: number;
}
export type TargetMurojaahConfig = Record<string, MurojaahRule[]>;

export interface ClassTarget {
    id: number;
    marhalah: Marhalah;
    kelas: string;
    semester?: 'Ganjil' | 'Genap' | string;
    marhalah_id?: string;
    kelas_id?: string;
    
    target_ziyadah: number;
    
    target_murojaah: number;
    
    target_hafalan: number;
}

export interface HalaqahSantriHistory {
  halaqah_id: number;
  santri_id: number;
  santri?: Santri;
  start_date: string;
  end_date: string | null;
  status: string;
}

export interface Halaqah {
  id: number;
  nama: string;
  musammi: Musammi;
  santri: Santri[]; // Maintain for backward compatibility or represents active santri
  active_santri?: Santri[]; // explicitly active ones
  history?: HalaqahSantriHistory[];
  marhalah: Marhalah;
  marhalah_id?: string;
  jenis: HalaqahType;
  waktu: Waktu[];
  no_urut: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceRecord {
  id: number;
  date: string;
  waktu: Waktu;
  personId: number;
  nama: string;
  marhalah: Marhalah;
  kelas: string;
  peran: Peran;
  status: AttendanceStatus;
  halaqahId?: number | null;
}

export interface MasterEvaluationPeriod {
    id: string; // The original 'month_key' like '2023-11-20'
    name: string; // "November 2023" or similar
    startDate: string; // '2023-11-01'
    endDate: string; // '2023-11-30'
    academic_year_id?: number | null;
}

export type ProgressType = string; // Was 'Hafalan' | 'Murojaah' | 'Ziyadah', now string to allow dynamic evaluations
export type ViewMode = 'detail' | 'recap_class';
export type SchemeOption = 'Hafalan' | 'Murojaah' | 'Ziyadah' | 'Total Hafalan' | 'Hafalan Depan' | 'Hafalan Belakang' | 'All' | string;

export interface StudentProgress {
    id: number;
    santri_id: number;
    month_key: string;
    progress_type: ProgressType;
    value: string;
}

export interface HalaqahEvaluationQuestion {
    id: number;
    question: string;
    description?: string;
    type: 'dropdown' | 'text';
    order_index?: number;
    options?: { label: string, color: string }[];
}

export interface HalaqahEvaluation {
    id: number;
    halaqah_id: number;
    month_key: string;
    answers: Record<string, string>;
}

export interface EvaluationSetting {
    id: number;
    category: string;
    label: string;
    order_index?: number;
    score?: number;
    color?: string;
}

export interface StudentEvaluation {
    id: number;
    santri_id: number;
    month_key: string;
    kualitas_hafalan?: string;
    kualitas_bacaan?: string;
    sikap_prilaku?: string;
    catatan_musammi?: string;
    catatan_muroqib?: string;
    catatan_lajnah?: string;
}

export interface UjianBulanan {
    id: number;
    santri_id: number;
    periode: string;
    semester?: string;
    materi_juz: string; // e.g., '1,2,3,4'
    nilai: number | null; // e.g., 85
}

export interface UjianSemester {
    id: number;
    santri_id: number;
    semester: string; // e.g., 'Ganjil 2024'
    academic_year_id: number;
    materi_juz: string; // e.g., '1-10'
    khoto_shogir: Record<number, number | null>; // juz -> total khoto shogir
    khoto_kabir: Record<number, number | null>; // juz -> total khoto kabir
    nilai_akhir: number | null; 
    nilai_silabus?: number | null;
    catatan?: string | null;
}

export interface SetoranHarian {
    id: number;
    organization_id: string;
    santri_id: number;
    halaqah_id?: number | null;
    tanggal: string;
    waktu?: string | null;
    surat?: string | null;
    ayat?: string | null;
    surat_mulai?: string | null;
    ayat_mulai?: string | null;
    surat_selesai?: string | null;
    ayat_selesai?: string | null;
    skema?: string | null;
    nilai?: string | null;
    jumlah_halaman?: number | null;
    kesalahan_kabir?: number | null;
    kesalahan_shoghir?: number | null;
    keterangan?: string | null;
    created_at?: string;
    updated_at?: string;
}

// UPDATE: Added sub-pages for Sidebar navigation
export type Page = 
  | 'Dashboard' 
  | 'Absensi' 
  | 'Buku Absensi' 
  | 'CetakBukuFisik'
  | 'Manajemen Data' // Parent (Optional use)
  | 'TahunAjaran'
  | 'DataSantri' 
  | 'DataMusammi' 
  | 'DataMusyrif'
  | 'DataHalaqah' 
  | 'DataWaliKelas' 
  | 'DataWaliSantri'
  | 'KenaikanKelas'
  | 'Akademik' // Parent
  | 'Perkembangan Santri' 
  | 'SetoranHarian' // Added new page
  | 'EvaluasiSantri' 
  | 'Dashboard Analytics'
  | 'Input Evaluasi'
  | 'Master Data Perkembangan'
  | 'Pengaturan Evaluasi'
  | 'Ujian & Raport' // Parent
  | 'UjianBulanan'
  | 'UjianSemester'
  | 'RekapNilai'
  | 'PengaturanNilai'
  | 'Wali Santri' 
  | 'Pusat Informasi' 
  | 'Laporan' // Parent (Optional use)
  | 'LaporanRekap'
  | 'LaporanKelas'
  | 'LaporanWaktu'
  | 'Users'
  | 'Settings'
  | 'WebsiteEditor';

export interface MasterMarhalah {
    id: string;
    organization_id: string;
    nama: string;
}

export interface MasterKelasRelasi {
    id: string;
    organization_id: string;
    marhalah_id: string;
    nama_kelas: string;
}

export interface AutoSyncZiyadahConfig {
    enabled: boolean;
    selected_schemes: string[];
    min_nilai: string;
}

export interface AutoSyncMurojaahConfig {
    enabled: boolean;
    selected_schemes: string[];
}

export type AutoSyncHafalanMethod = 
    | 'history_and_juz' 
    | 'standard_boundary' 
    | 'only_front' 
    | 'only_back';

export interface AutoSyncHafalanConfig {
    enabled: boolean;
    method: AutoSyncHafalanMethod;
}

export interface AutoSyncKelancaranThresholds {
    lancar: number;
    sedang: number;
}

export interface AutoSyncConversionRule {
    option_label: string;
    min_score: number;
}

export interface AutoSyncKelancaranConfig {
    enabled: boolean;
    target_category_id: string;
    thresholds?: AutoSyncKelancaranThresholds;
    rules?: AutoSyncConversionRule[];
    fallback_option?: string;
}

export interface AutoSyncSetoranConfig {
    enabled: boolean;
    ziyadah: AutoSyncZiyadahConfig;
    murojaah: AutoSyncMurojaahConfig;
    hafalan: AutoSyncHafalanConfig;
    kelancaran: AutoSyncKelancaranConfig;
}

export const DEFAULT_AUTO_SYNC_SETORAN_CONFIG: AutoSyncSetoranConfig = {
    enabled: false,
    ziyadah: {
        enabled: true,
        selected_schemes: ['Ziyadah'],
        min_nilai: 'Jayyid'
    },
    murojaah: {
        enabled: true,
        selected_schemes: ['Murojaah', 'Sabqi', 'Manzil']
    },
    hafalan: {
        enabled: true,
        method: 'history_and_juz'
    },
    kelancaran: {
        enabled: true,
        target_category_id: 'Hafalan',
        thresholds: {
            lancar: 2.5,
            sedang: 1.6
        },
        rules: [],
        fallback_option: undefined
    }
};
