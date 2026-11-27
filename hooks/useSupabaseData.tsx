import React, { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Santri, Musammi, Halaqah, AttendanceRecord, HalaqahType, Waktu, StudentProgress, ProgressType, WaliKelas, ClassTarget, StudentEvaluation, EvaluationSetting, AppSetting, MasterKelas } from '../types';
import { Marhalah, Peran, AttendanceStatus } from '../types';
import { useAcademicYear } from '../lib/AcademicYearContext';

import { SupportSessionStore, resolveTenantContext, bersihkanCacheKonteks } from '../lib/permissions';
import { DEFAULT_FLUENCY_RULES, type FluencyRule } from '../lib/kelancaran';
import {
    normalisasiRekap, normalisasiField, periodeKeLegacy, periodeTahunAjaran,
    rekapKeStudentProgress, rekapKeStudentEvaluation, fieldKeEvaluationSettings,
    fieldKePertanyaanHalaqah, formKeHalaqahEvaluation,
    type EvaluationPeriod, type PeriodFormField, type PeriodRecap, type PeriodForm,
} from '../lib/rekapAdapter';
import {
    normalisasiRubrik, normalisasiPercobaan, RUBRIK_BAWAAN, PENGATURAN_RAPORT_BAWAAN,
    type Rubrik, type PercobaanUjian, type PeriodeUjianBulanan, type PengaturanRaport,
} from '../lib/ujian';
import { NotificationStore } from '../lib/NotificationStore';
import {
    recitationToSetoranRow, setoranInputToRpcArgs, attendanceToLegacy, attendanceInputToRpcRecords, isUuid,
    DEFAULT_KINDS, DEFAULT_STATUSES,
    type RecitationKind, type AttendanceStatusRef, type SessionSlotRef, type HalaqahTypeRef, type SetoranRow,
} from '../lib/v2Adapter';

// ---------------------------------------------------------------------------------------------
// Fase 7 · data per halaman. Saat dibuka, aplikasi hanya memuat absensi & setoran 14 hari terakhir
// (+ setoran terakhir per santri lewat rpc_setoran_terakhir) — cepat di HP. Riwayat penuh (absensi
// semester, semua setoran) dimuat oleh halaman yang membutuhkannya (useRiwayat / muatRiwayat).
// Semua tabel besar diambil per 1.000 baris (batas baris Supabase), jadi tidak ada data terpotong.
// ---------------------------------------------------------------------------------------------
export const JENDELA_OPERASIONAL_HARI = 14;
const tanggalLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const awalJendelaOperasional = (hariIni: Date = new Date()) => {
    const d = new Date(hariIni);
    d.setDate(d.getDate() - JENDELA_OPERASIONAL_HARI);
    return tanggalLokal(d);
};

/** Ambil semua baris per 1.000 (urutan WAJIB stabil di `buat`). */
export async function ambilBertahap(buat: (dari: number, sampai: number) => any, batasBaris = 200000): Promise<{ data: any[]; error: any }> {
    const semua: any[] = [];
    for (let dari = 0; dari < batasBaris; dari += 1000) {
        const { data, error } = await buat(dari, dari + 999);
        if (error) return { data: semua, error };
        semua.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return { data: semua, error: null };
}

/** Nama/marhalah/kelas untuk baris absensi bentuk lama. */
function beriNamaAbsensi(rows: any[], k: { santriAktif: any[]; semuaSantri: any[]; musammiList: any[]; musammiData: any[] }): AttendanceRecord[] {
    return (rows || [])
        .map((a: any): AttendanceRecord | null => {
            let person: any = null;
            if (a.peran === 'Santri' || a.peran === Peran.Santri) {
                person = k.santriAktif.find((p: any) => p.id === a.personId)
                    || k.semuaSantri.find((p: any) => p.id === a.personId);
            } else {
                person = k.musammiList.find((p: any) => p.id === a.personId)
                    || (k.musammiData || []).find((p: any) => p.id === a.personId);
            }
            const nama = person?.nama || (a.peran === 'Santri' ? `Santri (${a.personId})` : `Musammi (${a.personId})`);
            return {
                ...a,
                id: a.id,
                date: a.date,
                waktu: a.waktu as Waktu,
                personId: a.personId,
                nama,
                marhalah: (person?.marhalah || '-') as any,
                kelas: person?.kelas || '-',
                peran: a.peran as Peran,
                status: a.status as AttendanceStatus,
                halaqahId: a.halaqahId,
            };
        })
        .filter((a): a is AttendanceRecord => a !== null);
}

interface KonteksAbsensi {
    orgId: string; yearId: number; semMulai: string | null; semSelesai: string | null;
    statusesList: AttendanceStatusRef[]; kindsList: RecitationKind[];
    santriAktif: any[]; semuaSantri: any[]; musammiList: any[]; musammiData: any[];
}

/** Absensi santri & musammi' + setoran sesuai lingkup ('jendela' = 14 hari + terakhir per santri; 'lengkap' = semester/semua). */
async function ambilAbsensiSetoran(k: Pick<KonteksAbsensi, 'orgId' | 'yearId' | 'semMulai' | 'semSelesai'>, lengkap: boolean, catatGalat: (tabel: string, e: any) => void) {
    const sb: any = supabase;
    const mulai = awalJendelaOperasional();
    const adaSemester = Boolean(k.semMulai && k.semSelesai);
    const join = lengkap && !adaSemester ? ', halaqah_sessions!inner(academic_year_id)' : '';
    const saring = (q: any, kol: string) => {
        if (!lengkap) return q.gte(kol, mulai);
        return adaSemester ? q.gte(kol, k.semMulai).lte(kol, k.semSelesai) : q.eq('halaqah_sessions.academic_year_id', k.yearId);
    };
    const tabel = async (nama: string, buat: (dari: number, sampai: number) => any) => {
        const r = await ambilBertahap(buat);
        if (r.error) catatGalat(nama, r.error);
        return r.data;
    };
    const [santriAtt, musammiAtt, setoran, terakhir] = await Promise.all([
        tabel('attendance_records', (a, b) => saring(sb.from('attendance_records').select('*' + join).eq('organization_id', k.orgId), 'attendance_date')
            .order('attendance_date', { ascending: true }).order('id', { ascending: true }).range(a, b)),
        tabel('musammi_attendance_records', (a, b) => saring(sb.from('musammi_attendance_records').select('*' + join).eq('organization_id', k.orgId), 'attendance_date')
            .order('attendance_date', { ascending: true }).order('id', { ascending: true }).range(a, b)),
        tabel('recitation_entries', (a, b) => {
            let q = sb.from('recitation_entries').select('*').eq('organization_id', k.orgId).neq('status', 'voided');
            if (!lengkap) q = q.gte('recitation_date', mulai);
            return q.order('recitation_date', { ascending: true }).order('id', { ascending: true }).range(a, b);
        }),
        lengkap ? Promise.resolve([] as any[]) : tabel('rpc_setoran_terakhir', (a, b) => sb.rpc('rpc_setoran_terakhir', { p_org: k.orgId }).range(a, b)),
    ]);
    // Gabung setoran jendela + setoran terakhir per santri (tanpa duplikat), urut tanggal naik
    const peta = new Map<string, any>();
    for (const r of [...(terakhir || []), ...(setoran || [])]) peta.set(String(r.id), r);
    const gabung = [...peta.values()].sort((x, y) =>
        String(x.recitation_date).localeCompare(String(y.recitation_date)) || String(x.created_at || '').localeCompare(String(y.created_at || '')));
    return { santriAtt, musammiAtt, setoran: gabung };
}

const useSupabaseDataInternal = () => {
    const { selectedAcademicYear, loading: ayLoading } = useAcademicYear();
    const [santri, setSantri] = useState<Santri[]>([]);
    const [allSantri, setAllSantri] = useState<Santri[]>([]);
    const [musammi, setMusammi] = useState<Musammi[]>([]);
    const [waliKelas, setWaliKelas] = useState<WaliKelas[]>([]);
    const [musyrifs, setMusyrifs] = useState<any[]>([]);
    const [halaqah, setHalaqah] = useState<Halaqah[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);
    const [classTargets, setClassTargets] = useState<ClassTarget[]>([]);
    const [studentEvaluations, setStudentEvaluations] = useState<StudentEvaluation[]>([]);
    const [evaluationSettings, setEvaluationSettings] = useState<EvaluationSetting[]>([]);
    const [halaqahEvalQuestions, setHalaqahEvalQuestions] = useState<any[]>([]);
    const [halaqahEvaluations, setHalaqahEvaluations] = useState<any[]>([]);
    const [appSettings, setAppSettings] = useState<AppSetting[]>([]);
    const [masterKelas, setMasterKelas] = useState<MasterKelas[]>([]);
    const [masterMarhalahs, setMasterMarhalahs] = useState<any[]>([]);
    const [masterKelasRelasi, setMasterKelasRelasi] = useState<any[]>([]);
    const [userProfile, setUserProfile] = useState<{id: string, name: string, role: string} | null>(null);
    const [orgName, setOrgName] = useState<string>('');
    const [orgLogo, setOrgLogo] = useState<string>('');
    
    // Ujian states
    // Fase 5: nilai ujian dari exam_attempts (satu sumber), pengaturan raport & rubrik
    const [examAttempts, setExamAttempts] = useState<PercobaanUjian[]>([]);
    const [periodeUjianBulanan, setPeriodeUjianBulanan] = useState<PeriodeUjianBulanan[]>([]);
    const [rubrikAktif, setRubrikAktif] = useState<Rubrik>(RUBRIK_BAWAAN);
    const [pengaturanRaport, setPengaturanRaport] = useState<PengaturanRaport>(PENGATURAN_RAPORT_BAWAAN);
    const [pengujiUjian, setPengujiUjian] = useState<any[]>([]);
    const [catatanRaport, setCatatanRaport] = useState<any[]>([]);
    // Fase 2: setoran dari recitation_entries (bentuk baris lama lewat lib/v2Adapter)
    const [setoranHarian, setSetoranHarian] = useState<SetoranRow[]>([]);
    // Fase 2: tabel referensi per lembaga
    const [recitationKinds, setRecitationKinds] = useState<RecitationKind[]>(DEFAULT_KINDS);
    const [attendanceStatuses, setAttendanceStatuses] = useState<AttendanceStatusRef[]>(DEFAULT_STATUSES);
    const [sessionSlots, setSessionSlots] = useState<SessionSlotRef[]>([]);
    const [halaqahTypes, setHalaqahTypes] = useState<HalaqahTypeRef[]>([]);
    // Fase 3: Tabel Kelancaran lembaga
    const [fluencyRules, setFluencyRules] = useState<FluencyRule[]>(DEFAULT_FLUENCY_RULES);
    // Fase 4: Rekap Periode (satu sumber capaian per santri per periode)
    const [evaluationPeriods, setEvaluationPeriods] = useState<EvaluationPeriod[]>([]);
    const [periodFormFields, setPeriodFormFields] = useState<PeriodFormField[]>([]);
    const [periodRecaps, setPeriodRecaps] = useState<PeriodRecap[]>([]);
    const [periodForms, setPeriodForms] = useState<PeriodForm[]>([]);
    
    const [activeSemesterDates, setActiveSemesterDates] = useState<{ startDate: string | null; endDate: string | null }>({ startDate: null, endDate: null });
    const [studentEnrollments, setStudentEnrollments] = useState<any[]>([]);
    const [halaqahMemberships, setHalaqahMemberships] = useState<any[]>([]);
    const [musammiAssignments, setMusammiAssignments] = useState<any[]>([]);
    const [queryErrors, setQueryErrors] = useState<{ table: string; code?: string; message: string }[]>([]);
    const [loading, setLoading] = useState(true);
    // Fase 7: lingkup data absensi & setoran ('jendela' saat dibuka, 'lengkap' bila halaman butuh riwayat)
    const lingkupRef = useRef<'jendela' | 'lengkap'>('jendela');
    // Fase 7: muat-awal sedang berjalan? (muatRiwayat saat itu tidak boleh memicu muat-awal kedua)
    const sedangMuatRef = useRef(false);
    const segarkanRef = useRef<() => Promise<void>>(async () => undefined);
    const konteksAbsensiRef = useRef<KonteksAbsensi | null>(null);
    const [riwayatTermuat, setRiwayatTermuat] = useState(false);
    const [memuatRiwayat, setMemuatRiwayat] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Store Org ID to avoid repeated fetching
    const orgIdRef = useRef<string | null>(null);
    const orgIdPromiseRef = useRef<Promise<string> | null>(null);

    // Helper: Get Current User's Organization ID
    const updateOrganization = async (name: string, logoUrl: string) => {
        const orgId = await getOrgId();
        bersihkanCacheKonteks();
        const { data, error } = await supabase.from('organizations').update({ name, logo_url: logoUrl }).eq('id', orgId).select();
        if (!error && (!data || data.length === 0)) {
            throw new Error("Gagal memperbarui data. Anda mungkin tidak memiliki akses untuk mengubah data organisasi ini.");
        }
        if (error) throw error;
        setOrgName(name);
        setOrgLogo(logoUrl);
        await fetchData(); // Refresh other data if needed
    };

    const getOrgId = useCallback(async (): Promise<string> => {
        if (orgIdPromiseRef.current) return orgIdPromiseRef.current;

        orgIdPromiseRef.current = (async () => {
            try {
                const ctx = await resolveTenantContext(supabase);
                if (!ctx.userId || !ctx.isAuthorized) {
                    orgIdRef.current = null;
                    return '';
                }

                setUserProfile({
                    id: ctx.userId,
                    name: ctx.fullName || 'Pengguna',
                    role: ctx.effectiveRole,
                });

                if (ctx.organizationName) {
                    setOrgName(ctx.organizationName);
                }
                if (ctx.organizationLogo) {
                    setOrgLogo(ctx.organizationLogo);
                }

                if (ctx.organizationId) {
                    orgIdRef.current = ctx.organizationId;
                    return ctx.organizationId;
                }

                // Sesuai Blueprint Fase 1: Dilarang melakukan fallback ke organizations.limit(1)
                orgIdRef.current = null;
                return '';
            } catch (err) {
                console.warn("Could not determine organization:", err);
                return '';
            } finally {
                orgIdPromiseRef.current = null;
            }
        })();

        return orgIdPromiseRef.current;
    }, []);

    const fetchData = useCallback(async () => {
        if (!selectedAcademicYear) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        sedangMuatRef.current = true;
        const collectedErrors: { table: string; code?: string; message: string }[] = [];

        try {
            // Populate user profile and cache org ID
            const orgId = await getOrgId();
            if (!orgId) {
                setLoading(false);
                return;
            }
            
            // Helper query dengan pembedaan tegas antara data kosong vs error query nyata (Fase 4 Section 6)
            const executeTableQuery = async <T,>(
                tableName: string,
                queryPromise: any,
                fallback: T,
                options?: { optionalTransitionTable?: boolean }
            ): Promise<{ data: T; error: any }> => {
                try {
                    const res = await queryPromise;
                    if (res?.error) {
                        const code = String(res.error.code || '');
                        const msg = String(res.error.message || 'Unknown query error');
                        const isMissingTable = code === '42P01' || code === 'PGRST205' || msg.includes('does not exist');
                        if (!(options?.optionalTransitionTable && isMissingTable)) {
                            collectedErrors.push({ table: tableName, code, message: msg });
                            console.error(`[useSupabaseData] Query error on ${tableName} (${code}): ${msg}`);
                        }
                        return { data: fallback, error: res.error };
                    }
                    return { data: (res?.data ?? fallback) as T, error: null };
                } catch (e: any) {
                    const msg = e?.message || String(e);
                    collectedErrors.push({ table: tableName, message: msg });
                    console.error(`[useSupabaseData] Query exception on ${tableName}:`, e);
                    return { data: fallback, error: e };
                }
            };

            // Fase 7 · kinerja: batch 2 dan absensi/setoran 14 hari tidak bergantung pada batch 1,
            // jadi dimulai bersamaan (satu putaran jaringan lebih sedikit di HP).
            const catatGalatAbsensi = (tabel: string, e: any) => {
                collectedErrors.push({ table: tabel, code: String(e?.code || ''), message: String(e?.message || e) });
                console.error(`[useSupabaseData] Query error on ${tabel}: ${e?.message || e}`);
            };
            const janjiBatch2 = Promise.all([
                executeTableQuery('class_targets', (supabase as any).from('class_targets').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000), []),
                executeTableQuery('evaluation_periods', (supabase as any).from('evaluation_periods').select('*').eq('organization_id', orgId).order('start_date', { ascending: true }).limit(1000), [], { optionalTransitionTable: true }),
                executeTableQuery('app_settings', (supabase as any).from('app_settings').select('*').eq('organization_id', orgId).limit(500), []),
                executeTableQuery('period_form_fields', (supabase as any).from('period_form_fields').select('*').eq('organization_id', orgId).order('sort_order', { ascending: true }).limit(1000), [], { optionalTransitionTable: true }),
                executeTableQuery('recitation_kinds', (supabase as any).from('recitation_kinds').select('*').eq('organization_id', orgId).order('sort_order', { ascending: true }), []),
                executeTableQuery('attendance_statuses', (supabase as any).from('attendance_statuses').select('*').eq('organization_id', orgId).order('sort_order', { ascending: true }), []),
                executeTableQuery('session_slots', (supabase as any).from('session_slots').select('*').eq('organization_id', orgId).order('sort_order', { ascending: true }), []),
                executeTableQuery('halaqah_types', (supabase as any).from('halaqah_types').select('*').eq('organization_id', orgId).order('sort_order', { ascending: true }), []),
                executeTableQuery('fluency_rules', (supabase as any).from('fluency_rules').select('*').eq('organization_id', orgId).order('sort_order', { ascending: true }), [], { optionalTransitionTable: true })
            ]);
            const janjiJendela = lingkupRef.current === 'jendela'
                ? ambilAbsensiSetoran({ orgId, yearId: selectedAcademicYear.id, semMulai: null, semSelesai: null }, false, catatGalatAbsensi)
                : null;

            // Batch 1: Core reference & V2 Canonical Academic Structure (scoped by organization_id)
            const [
                { data: santriData, error: santriErr },
                { data: studentEnrollmentsData },
                { data: musammiData },
                { data: waliKelasData },
                { data: musyrifsData },
                { data: halaqahData, error: halaqahErr },
                { data: halaqahMembershipsData },
                { data: musammiAssignmentsData },
                { data: semestersData },
                { data: masterMarhalahData },
                { data: masterKelasRelasiData },
                { data: masterKelasData }
            ] = await Promise.all([
                executeTableQuery('santri', (supabase as any).from('santri').select('*').eq('organization_id', orgId).limit(5000).order('nama', { ascending: true }), []),
                executeTableQuery('student_enrollments', (supabase as any).from('student_enrollments').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(5000), []),
                executeTableQuery('musammi', (supabase as any).from('musammi').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('nama', { ascending: true }), []),
                executeTableQuery('wali_kelas', (supabase as any).from('wali_kelas').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('kelas', { ascending: true }), [], { optionalTransitionTable: true }),
                executeTableQuery('musyrifs', (supabase as any).from('musyrifs').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('nama', { ascending: true }), [], { optionalTransitionTable: true }),
                executeTableQuery('halaqah', (supabase as any).from('halaqah').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('id', { ascending: true }), []),
                executeTableQuery('halaqah_student_memberships', (supabase as any).from('halaqah_student_memberships').select('*').eq('organization_id', orgId).limit(10000), []),
                executeTableQuery('halaqah_musammi_assignments', (supabase as any).from('halaqah_musammi_assignments').select('*').eq('organization_id', orgId).limit(5000), []),
                executeTableQuery('semesters', (supabase as any).from('semesters').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(20), []),
                executeTableQuery('master_marhalah', (supabase as any).from('master_marhalah').select('*').eq('organization_id', orgId).limit(500), []),
                executeTableQuery('master_kelas_relasi', (supabase as any).from('master_kelas_relasi').select('*').eq('organization_id', orgId).limit(500), []),
                executeTableQuery('master_kelas', (supabase as any).from('master_kelas').select('*').eq('organization_id', orgId).limit(500).order('marhalah', { ascending: true }).order('nama_kelas', { ascending: true }), [], { optionalTransitionTable: true })
            ]);

            if (santriErr && halaqahErr) {
                throw new Error(`Gagal memuat data akademik utama (${santriErr.message || halaqahErr.message})`);
            }

            // Batch 2: Configuration & Targets (sudah dimulai di atas)
            const [
                { data: targetsData },
                { data: periodsData },
                { data: appSettingsData },
                { data: fieldsData },
                { data: kindsData },
                { data: statusesData },
                { data: slotsData },
                { data: halaqahTypesData },
                { data: fluencyData }
            ] = await janjiBatch2;

            const kindsList: RecitationKind[] = (kindsData as any[])?.length ? (kindsData as any[]) : DEFAULT_KINDS;
            const statusesList: AttendanceStatusRef[] = (statusesData as any[])?.length ? (statusesData as any[]) : DEFAULT_STATUSES;
            setRecitationKinds(kindsList);
            setAttendanceStatuses(statusesList);
            setSessionSlots((slotsData as any[]) || []);
            setHalaqahTypes((halaqahTypesData as any[]) || []);
            setFluencyRules((fluencyData as any[])?.length ? (fluencyData as any[]) : DEFAULT_FLUENCY_RULES);

            // Batch 3: Rekap Periode (Fase 4) & Ujian
            const allPeriods: EvaluationPeriod[] = ((periodsData as any[]) || []).map((p: any) => ({ ...p, academic_year_id: p.academic_year_id === null ? null : Number(p.academic_year_id) }));
            const yearPeriodIds = periodeTahunAjaran(allPeriods, selectedAcademicYear.id).map(p => p.id);
            // period_recaps bisa > 1000 baris: ambil bertahap (batas baris per permintaan Supabase)
            const fetchRecaps = async (): Promise<{ data: any[] }> => {
                if (yearPeriodIds.length === 0) return { data: [] };
                const all: any[] = [];
                for (let from = 0; from < 100000; from += 1000) {
                    const { data, error } = await executeTableQuery('period_recaps',
                        (supabase as any).from('period_recaps').select('*').eq('organization_id', orgId).in('period_id', yearPeriodIds)
                            .order('id', { ascending: true }).range(from, from + 999), [] as any[], { optionalTransitionTable: true });
                    all.push(...((data as any[]) || []));
                    if (error || !data || (data as any[]).length < 1000) break;
                }
                return { data: all };
            };
            const [
                { data: recapsData },
                { data: formsData },
                { data: attemptsData },
                { data: periodeUjianData },
                { data: rubrikData },
                { data: raportSetData },
                { data: pengujiData },
                { data: catatanData }
            ] = await Promise.all([
                fetchRecaps(),
                yearPeriodIds.length
                    ? executeTableQuery('period_forms', (supabase as any).from('period_forms').select('*').eq('organization_id', orgId).in('period_id', yearPeriodIds).limit(5000), [], { optionalTransitionTable: true })
                    : Promise.resolve({ data: [] as any[], error: null }),
                executeTableQuery('exam_attempts', (supabase as any).from('exam_attempts').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).order('attempt_no', { ascending: true }).limit(20000), []),
                executeTableQuery('monthly_exam_periods', (supabase as any).from('monthly_exam_periods').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).order('ke', { ascending: true }), [], { optionalTransitionTable: true }),
                executeTableQuery('rubric_versions', (supabase as any).from('rubric_versions').select('*').eq('organization_id', orgId).eq('is_active', true).order('version_no', { ascending: false }).limit(1), []),
                executeTableQuery('raport_settings', (supabase as any).from('raport_settings').select('*').eq('organization_id', orgId).limit(1), [], { optionalTransitionTable: true }),
                executeTableQuery('exam_assignments', (supabase as any).from('exam_assignments').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id), [], { optionalTransitionTable: true }),
                executeTableQuery('raport_catatan', (supabase as any).from('raport_catatan').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), [], { optionalTransitionTable: true })
            ]);
            const fieldsList: PeriodFormField[] = ((fieldsData as any[]) || []).map(normalisasiField);
            const recapsList: PeriodRecap[] = ((recapsData as any[]) || []).map(normalisasiRekap);
            const formsList: PeriodForm[] = ((formsData as any[]) || []).map((f: any) => ({ ...f, halaqah_id: Number(f.halaqah_id), activity_answers: f.activity_answers || {} }));
            setEvaluationPeriods(allPeriods);
            setPeriodFormFields(fieldsList);
            setPeriodRecaps(recapsList);
            setPeriodForms(formsList);

            // Fetch active semester dates from canonical V2 `semesters` table first, fallback to `app_settings`
            const currSemName = selectedAcademicYear.active_semester || 'Ganjil';
            const v2ActiveSem = ((semestersData as any[]) || []).find(
                (sem: any) => sem.name === currSemName || sem.is_active === true
            );
            let activeSemStartDate: string | null = v2ActiveSem?.start_date || null;
            let activeSemEndDate: string | null = v2ActiveSem?.end_date || null;

            if (!activeSemStartDate || !activeSemEndDate) {
                const semSettingKey = `SEMESTER_DATES_${selectedAcademicYear.id}`;
                const semSetting = (appSettingsData as any[])?.find(s => s.key === semSettingKey);
                if (semSetting?.value) {
                    try {
                        const parsed = JSON.parse(semSetting.value);
                        if (parsed[currSemName]) {
                            activeSemStartDate = activeSemStartDate || parsed[currSemName].startDate || null;
                            activeSemEndDate = activeSemEndDate || parsed[currSemName].endDate || null;
                        }
                    } catch(e) {}
                }
            }

            setActiveSemesterDates({ startDate: activeSemStartDate, endDate: activeSemEndDate });

            // Batch 4: Absensi & setoran (Fase 7: lingkup jendela/lengkap, bertahap per 1.000 baris)
            const lengkapSaatIni = !janjiJendela;
            const { santriAtt: santriAttData, musammiAtt: musammiAttData, setoran: recitationData } = janjiJendela
                ? await janjiJendela
                : await ambilAbsensiSetoran(
                    { orgId, yearId: selectedAcademicYear.id, semMulai: activeSemStartDate, semSelesai: activeSemEndDate },
                    true,
                    catatGalatAbsensi
                );
            setRiwayatTermuat(lengkapSaatIni);

            const rawAttendanceData = [
                ...((santriAttData as any[]) || []).map(r => attendanceToLegacy(r, 'santri', statusesList)),
                ...((musammiAttData as any[]) || []).map(r => attendanceToLegacy(r, 'musammi', statusesList)),
            ];
            const setoranHarianData = ((recitationData as any[]) || []).map(e => recitationToSetoranRow(e, kindsList));

            setQueryErrors(collectedErrors);
            setStudentEnrollments(studentEnrollmentsData || []);
            setHalaqahMemberships(halaqahMembershipsData || []);
            setMusammiAssignments(musammiAssignmentsData || []);

            const attendanceData = rawAttendanceData;

            // Process Class Targets
            let targetsList: ClassTarget[] = [];
            if (targetsData && Array.isArray(targetsData)) {
                targetsList = targetsData.map((t: any) => ({
                    id: t.id,
                    marhalah_id: t.marhalah_id,
                    kelas_id: t.kelas_id,
                    marhalah: t.marhalah as Marhalah,
                    kelas: t.kelas,
                    semester: t.semester || 'Ganjil',
                    target_ziyadah: t.target_ziyadah !== undefined && t.target_ziyadah !== null && t.target_ziyadah !== 0 ? t.target_ziyadah : (t.target_ziyadah_end ?? 0),
                    target_murojaah: t.target_murojaah !== undefined && t.target_murojaah !== null && t.target_murojaah !== 0 ? t.target_murojaah : (t.target_murojaah_end ?? 0),
                    target_hafalan: t.target_hafalan !== undefined && t.target_hafalan !== null && t.target_hafalan !== 0 ? t.target_hafalan : (t.target_hafalan_end ?? 0)
                }));
            }

            // Enrich from TARGET_CLASS_SEMESTER_CONFIG app setting if Genap records are not yet stored in DB column
            try {
                const semSetting = (appSettingsData as any[])?.find(s => s.key === `TARGET_CLASS_SEMESTER_CONFIG_${selectedAcademicYear.id}`);
                if (semSetting?.value) {
                    const parsed = JSON.parse(semSetting.value);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const hasGenapInDb = targetsList.some(t => t.semester === 'Genap');
                        if (!hasGenapInDb) {
                            parsed.forEach((item: any, idx: number) => {
                                if (item.semester === 'Genap') {
                                    targetsList.push({
                                        id: 95000 + idx,
                                        marhalah_id: item.marhalah_id,
                                        kelas_id: item.kelas_id,
                                        marhalah: item.marhalah as Marhalah,
                                        kelas: item.kelas,
                                        semester: 'Genap',
                                        target_ziyadah: item.target_ziyadah || 0,
                                        target_murojaah: item.target_murojaah || 0,
                                        target_hafalan: item.target_hafalan || 0
                                    });
                                }
                            });
                        }
                    }
                }
            } catch (e) {}

            // Map all santri in the organization using Canonical V2 `student_enrollments` first, merged with `student_classes`
            // FASE 4 RULE: Data santri tanpa enrollment pada tahun ajaran terpilih TIDAK otomatis dianggap terdaftar di semua kelas.
            const v2EnrollmentsList = (studentEnrollmentsData as any[]) || [];

            const allSantriMapped: Santri[] = (santriData || []).map(s => {
                const v2Enr = v2EnrollmentsList.find(
                    e => Number(e.student_id || e.santri_id) === Number(s.id)
                );
                const legacyCls: any = null;

                const enrStatus = v2Enr
                    ? (v2Enr.status || v2Enr.enrollment_status || 'active')
                    : (legacyCls ? 'active' : 'unenrolled');

                const hasEnrollmentInYear = Boolean(v2Enr || legacyCls);
                const isEnrolledActive = hasEnrollmentInYear && enrStatus === 'active';

                const mId = v2Enr?.master_marhalah_id || v2Enr?.marhalah_id || legacyCls?.marhalah_id || (isEnrolledActive ? s.marhalah_id : null);
                let marhalahName = v2Enr?.marhalah || legacyCls?.marhalah || s.marhalah;
                if (mId && masterMarhalahData) {
                    const matchedM = (masterMarhalahData as any[])?.find(m => String(m.id) === String(mId));
                    if (matchedM) marhalahName = matchedM.nama;
                }

                const kId = v2Enr?.master_kelas_id || v2Enr?.kelas_id || legacyCls?.kelas_id || (isEnrolledActive ? s.kelas_id : null);
                let kelasName = isEnrolledActive
                    ? (v2Enr?.kelas || legacyCls?.kelas || s.kelas || '-')
                    : '-';
                if (isEnrolledActive && kId && masterKelasRelasiData) {
                    const matchedK = (masterKelasRelasiData as any[])?.find(k => String(k.id) === String(kId));
                    if (matchedK) kelasName = matchedK.nama_kelas;
                }

                return { 
                    ...s, 
                    marhalah_id: mId,
                    kelas_id: kId,
                    marhalah: (marhalahName || s.marhalah) as Marhalah,
                    kelas: kelasName,
                    student_class_id: legacyCls?.id || v2Enr?.id,
                    enrollment_status: enrStatus,
                    enrolled_at: v2Enr?.enrolled_at || null,
                    left_at: v2Enr?.left_at || null,
                    is_enrolled_in_active_year: isEnrolledActive,
                    nama_wali: s.nama_wali || undefined,
                    no_hp_wali: s.no_hp_wali || undefined,
                    telegram_chat_id: s.telegram_chat_id || undefined,
                    isActiveInCurrentYear: isEnrolledActive,
                    original_marhalah: s.marhalah,
                    original_kelas: s.kelas
                };
            });

            // FASE 4 RULE: Santri tanpa enrollment aktif pada tahun ajaran terpilih TIDAK otomatis masuk daftar santri kelas operasional
            const santriList: Santri[] = allSantriMapped.filter(
                s => Boolean((s as any).isActiveInCurrentYear) && (s.status || 'active') === 'active'
            );
            const activeSantriListForApp = santriList;
            const musammiList: Musammi[] = (musammiData || []).map(m => ({ ...m, marhalah: m.marhalah as Marhalah }));
            const waliKelasList: WaliKelas[] = (waliKelasData || []).map(w => ({ ...w, marhalah: w.marhalah as Marhalah }));

            let mkData = masterKelasData || [];
            // If master_kelas is empty, synthesize in-memory from master_kelas_relasi or santri to avoid RLS insert violations
            if (mkData.length === 0 && masterKelasRelasiData && masterKelasRelasiData.length > 0) {
                mkData = masterKelasRelasiData.map((k: any, idx: number) => {
                    const mObj = (masterMarhalahData || []).find((m: any) => m.id === k.marhalah_id);
                    return {
                        id: idx + 1,
                        marhalah: mObj?.nama || 'Mutawassithah',
                        nama_kelas: k.nama_kelas
                    };
                });
            }

            if (mkData.length === 0 && activeSantriListForApp.length > 0) {
                const uniquePairs = new Set<string>();
                const syntheticMk: any[] = [];
                activeSantriListForApp.forEach((s, idx) => {
                    if (s.marhalah && s.kelas && s.kelas !== '-') {
                        const key = `${s.marhalah}|${s.kelas}`;
                        if (!uniquePairs.has(key)) {
                            uniquePairs.add(key);
                            syntheticMk.push({ id: idx + 1000, marhalah: s.marhalah, nama_kelas: s.kelas });
                        }
                    }
                });
                mkData = syntheticMk;
            }

            setAllSantri(allSantriMapped);
            setSantri(activeSantriListForApp);
            setMusammi(musammiList);
            setWaliKelas(waliKelasList);
            setMusyrifs((musyrifsData as unknown as any[]) || []);
            setClassTargets(targetsList);
            // Fase 4: bentuk lama diturunkan dari Rekap Periode (lib/rekapAdapter.ts)
            setStudentEvaluations(rekapKeStudentEvaluation(recapsList, fieldsList) as unknown as StudentEvaluation[]);
            setEvaluationSettings(fieldKeEvaluationSettings(fieldsList) as unknown as EvaluationSetting[]);
            setHalaqahEvalQuestions(fieldKePertanyaanHalaqah(fieldsList));
            setHalaqahEvaluations(formKeHalaqahEvaluation(formsList));
            setAppSettings((appSettingsData as unknown as any[]) || []);
            setExamAttempts(((attemptsData as any[]) || []).map(normalisasiPercobaan));
            setPeriodeUjianBulanan(((periodeUjianData as any[]) || []).map((p: any) => ({ ...p, academic_year_id: Number(p.academic_year_id), ke: Number(p.ke) })));
            setRubrikAktif(normalisasiRubrik((rubrikData as any[])?.[0]));
            const rs = (raportSetData as any[])?.[0];
            setPengaturanRaport(rs ? { ...rs, bobot_semester: Number(rs.bobot_semester), bobot_bulanan: Number(rs.bobot_bulanan), bobot_kehadiran: Number(rs.bobot_kehadiran) } : PENGATURAN_RAPORT_BAWAAN);
            setPengujiUjian((pengujiData as any[]) || []);
            setCatatanRaport((catatanData as any[]) || []);
            setSetoranHarian(setoranHarianData || []);
            setMasterKelas(mkData);
            setMasterMarhalahs(masterMarhalahData || []);
            setMasterKelasRelasi(masterKelasRelasiData || []);

            // Map santri & musammi assignments to their halaqah using Canonical V2 `halaqah_student_memberships` & `halaqah_musammi_assignments`
            const v2MembershipsList = (halaqahMembershipsData as any[]) || [];
            const v2AssignmentsList = (musammiAssignmentsData as any[]) || [];

            const halaqahWithSantri: Halaqah[] = (halaqahData || []).map((h): Halaqah | null => {
                // 1. Canonical V2 Memberships merged with Legacy `halaqah_santri`
                const v2ForGroup = v2MembershipsList.filter(m => Number(m.halaqah_id) === Number(h.id));

                const activeSantriIdsSet = new Set<number>();
                const historyRecords: any[] = [];
                const seenStudentStartKeys = new Set<string>();

                v2ForGroup.forEach(m => {
                    const sid = Number(m.student_id);
                    const isCurrentlyActive = m.status === 'active' && (!m.valid_to || String(m.valid_to).trim() === '');
                    if (isCurrentlyActive) {
                        activeSantriIdsSet.add(sid);
                    }
                    const statusLabel = isCurrentlyActive
                        ? 'Aktif'
                        : m.status === 'transferred'
                        ? 'Mutasi'
                        : m.status === 'completed'
                        ? 'Selesai TA'
                        : 'Dikeluarkan dari Grup';
                    const key = `${sid}_${m.valid_from || ''}`;
                    seenStudentStartKeys.add(key);
                    historyRecords.push({
                        halaqah_id: h.id,
                        santri_id: sid,
                        santri: allSantriMapped.find(s => Number(s.id) === sid),
                        start_date: m.valid_from || '',
                        end_date: m.valid_to || null,
                        status: statusLabel
                    });
                });

                // 2. Canonical V2 Musammi Assignments (Primary & Substitute)
                const groupAssignments = v2AssignmentsList
                    .filter(a => Number(a.halaqah_id) === Number(h.id))
                    .map(a => {
                        const matchedMusammi = musammiList.find(m => Number(m.id) === Number(a.musammi_id));
                        return {
                            id: a.id,
                            halaqah_id: Number(a.halaqah_id),
                            musammi_id: Number(a.musammi_id),
                            musammi_user_id: a.musammi_user_id || matchedMusammi?.user_id || null,
                            musammi_nama: matchedMusammi?.nama || `Musammi #${a.musammi_id}`,
                            assignment_type: (a.assignment_type === 'substitute' || a.is_primary === false ? 'substitute' : 'primary') as 'primary' | 'substitute',
                            is_primary: a.assignment_type ? a.assignment_type === 'primary' : Boolean(a.is_primary ?? true),
                            valid_from: a.valid_from || '',
                            valid_to: a.valid_to || null,
                            is_active: a.is_active !== false && a.status !== 'ended' && a.status !== 'revoked',
                            status: a.status || (a.is_active !== false ? 'active' : 'ended'),
                            notes: a.notes || null,
                        };
                    });

                const activePrimaryAssignment = groupAssignments.find(
                    a => a.is_active && a.assignment_type === 'primary' && !a.valid_to
                );
                const primaryMusammiId = activePrimaryAssignment?.musammi_id || h.musammi_id;

                const musammiForHalaqah: Musammi = musammiList.find(m => Number(m.id) === Number(primaryMusammiId)) || {
                    id: primaryMusammiId || 0,
                    nama: 'Belum Ada Musammi',
                    marhalah: (h.marhalah || 'Mutawassithah') as Marhalah,
                    kelas: '-'
                };

                const substituteMusammiList: Musammi[] = groupAssignments
                    .filter(a => a.is_active && a.assignment_type === 'substitute' && !a.valid_to)
                    .map(a => musammiList.find(m => Number(m.id) === Number(a.musammi_id)))
                    .filter((m): m is Musammi => Boolean(m));

                const activeSantriList = allSantriMapped.filter(
                    s => activeSantriIdsSet.has(Number(s.id)) && (s.status || 'active') === 'active'
                );

                let marhalahName = h.marhalah;
                if (h.marhalah_id && masterMarhalahData) {
                    const matchedM = (masterMarhalahData as any[])?.find(m => m.id === h.marhalah_id);
                    if (matchedM) marhalahName = matchedM.nama;
                }

                return {
                    id: h.id,
                    nama: h.nama,
                    musammi: musammiForHalaqah,
                    substitute_musammi: substituteMusammiList,
                    musammi_assignments: groupAssignments,
                    santri: activeSantriList,
                    active_santri: activeSantriList,
                    history: historyRecords,
                    marhalah: (marhalahName || h.marhalah) as Marhalah,
                    marhalah_id: h.marhalah_id,
                    jenis: h.jenis as HalaqahType,
                    waktu: h.waktu as Waktu[],
                    no_urut: h.no_urut || 999,
                    is_active: h.is_active !== false,
                    is_archived: Boolean(h.is_archived),
                    recording_mode: h.recording_mode === 'rekap' ? 'rekap' : 'harian',
                    created_at: h.created_at,
                    updated_at: h.updated_at,
                };
            }).filter((h): h is Halaqah => h !== null);
            
            setHalaqah(halaqahWithSantri);
            
            const konteksAbsensi: KonteksAbsensi = {
                orgId, yearId: selectedAcademicYear.id, semMulai: activeSemStartDate, semSelesai: activeSemEndDate,
                statusesList, kindsList, santriAktif: activeSantriListForApp, semuaSantri: allSantriMapped,
                musammiList, musammiData: (musammiData as any[]) || [],
            };
            konteksAbsensiRef.current = konteksAbsensi;
            // Riwayat diminta setelah batch 4 berjalan dengan lingkup jendela → susulkan absensi & setoran saja.
            if (!lengkapSaatIni && lingkupRef.current === 'lengkap') window.setTimeout(() => { segarkanRef.current(); }, 0);
            const attendanceWithNames: AttendanceRecord[] = beriNamaAbsensi(attendanceData, konteksAbsensi);
            setAttendance(attendanceWithNames);

            setStudentProgress(rekapKeStudentProgress(recapsList, fieldsList) as unknown as StudentProgress[]);

        } catch (err: any) {
            setError(err.message || String(err));
            console.error("Error fetching data:", err);
        } finally {
            sedangMuatRef.current = false;
            setLoading(false);
        }
    }, [selectedAcademicYear, getOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * Fase 7 (BUG-18): setelah simpan/ubah absensi atau setoran, muat ulang HANYA absensi & setoran
     * (lingkup saat ini) — bukan seluruh data aplikasi. Halaman tidak berkedip/kembali ke "memuat".
     */
    const segarkanAbsensiSetoran = useCallback(async () => {
        const k = konteksAbsensiRef.current;
        if (!k) { if (!sedangMuatRef.current) await fetchData(); return; }
        const lengkap = lingkupRef.current === 'lengkap';
        const { santriAtt, musammiAtt, setoran } = await ambilAbsensiSetoran(k, lengkap,
            (tabel, e) => console.error(`[useSupabaseData] Query error on ${tabel}: ${e?.message || e}`));
        setAttendance(beriNamaAbsensi([
            ...(santriAtt || []).map((r: any) => attendanceToLegacy(r, 'santri', k.statusesList)),
            ...(musammiAtt || []).map((r: any) => attendanceToLegacy(r, 'musammi', k.statusesList)),
        ], k));
        setSetoranHarian((setoran || []).map((e: any) => recitationToSetoranRow(e, k.kindsList)));
        setRiwayatTermuat(lengkap);
    }, [fetchData]);
    segarkanRef.current = segarkanAbsensiSetoran;

    /** Muat riwayat penuh (absensi semester & semua setoran) sekali; dipanggil halaman laporan/riwayat. */
    const muatRiwayat = useCallback(async () => {
        if (lingkupRef.current === 'lengkap') return;
        lingkupRef.current = 'lengkap';
        setMemuatRiwayat(true);
        try {
            await segarkanAbsensiSetoran();
        } finally {
            setMemuatRiwayat(false);
        }
    }, [segarkanAbsensiSetoran]);

    /** Pastikan data tanggal tertentu termuat (tanggal sebelum jendela 14 hari → muat riwayat). */
    const pastikanTanggal = useCallback((tanggal?: string | null) => {
        if (tanggal && lingkupRef.current === 'jendela' && tanggal < awalJendelaOperasional()) muatRiwayat();
    }, [muatRiwayat]);

    useEffect(() => {
        const unsubscribe = SupportSessionStore.subscribe(() => {
            orgIdRef.current = null;
            fetchData();
        });
        return unsubscribe;
    }, [fetchData]);

    // --- MUTATION FUNCTIONS ---

    const addMasterKelas = async (marhalah: string, nama_kelas: string) => {
        const orgId = await getOrgId();

        // 1. Dual Write for new system
        let marhalahId = null;
        let m = masterMarhalahs.find(m => m.nama === marhalah);
        if (!m) {
            const { data, error: mError } = await supabase.from('master_marhalah' as any).insert({ organization_id: orgId, nama: marhalah }).select().single();
            if (!mError) marhalahId = (data as any)?.id;
        } else {
            marhalahId = m.id;
        }

        if (marhalahId) {
            await supabase.from('master_kelas_relasi' as any).insert({
                organization_id: orgId,
                marhalah_id: marhalahId,
                nama_kelas: nama_kelas
            });
        }

        // 2. Backward compatibility
        const { error } = await (supabase as any).from('master_kelas').insert({
            organization_id: orgId,
            marhalah,
            nama_kelas
        });
        if (error) throw error;
        await fetchData();
    };

    const deleteMasterKelas = async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('master_kelas').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    };
    
    const addSantri = async (santriData: Omit<Santri, 'id'>) => {
        const orgId = await getOrgId();
        const { data, error } = await supabase.from('santri').insert({ ...santriData, organization_id: orgId }).select().single();
        if (error) throw error;
        if (data) {
            if (selectedAcademicYear?.id) {
                const { error: enrErr } = await (supabase.from('student_enrollments' as any) as any).upsert({
                    organization_id: orgId,
                    academic_year_id: selectedAcademicYear.id,
                    student_id: data.id,
                    santri_id: data.id,
                    master_marhalah_id: (data as any).marhalah_id || null,
                    master_kelas_id: (data as any).kelas_id || null,
                    marhalah: data.marhalah,
                    kelas: data.kelas,
                    status: 'active',
                    enrollment_status: 'active',
                    enrolled_at: new Date().toISOString().split('T')[0],
                    updated_at: new Date().toISOString()
                }, { onConflict: 'organization_id,student_id,academic_year_id' });
                if (enrErr) {
                    console.error('Error upserting student_enrollments:', enrErr);
                    throw enrErr;
                }
            }
            await fetchData();
        }
        return data;
    };

    const assignHalaqahMusammi = useCallback(async (params: {
        halaqahId: number;
        musammiId: number;
        assignmentType?: 'primary' | 'substitute';
        validFrom?: string;
        validTo?: string | null;
        notes?: string | null;
    }) => {
        const orgId = await getOrgId();
        const validFrom = params.validFrom || new Date().toISOString().split('T')[0];
        const assignmentType = params.assignmentType || 'primary';

        if (params.validTo && params.validTo < validFrom) {
            throw new Error('Masa berlaku penugasan Musammi tidak valid: tanggal berakhir tidak boleh sebelum tanggal mulai.');
        }

        const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc('rpc_assign_halaqah_musammi', {
            p_halaqah_id: params.halaqahId,
            p_musammi_id: params.musammiId,
            p_assignment_type: assignmentType,
            p_valid_from: validFrom,
            p_valid_to: params.validTo || null,
            p_notes: params.notes || null,
        });

        if (rpcErr) {
            const isMissingRpc = rpcErr.code === '42883' || String(rpcErr.message || '').includes('rpc_assign_halaqah_musammi');
            if (!isMissingRpc) {
                throw new Error(rpcErr.message || 'Gagal menetapkan penugasan Musammi');
            }

            if (assignmentType === 'primary') {
                const { error: endOldErr } = await (supabase.from('halaqah_musammi_assignments' as any) as any)
                    .update({ valid_to: validFrom, is_primary: false, is_active: false, status: 'ended' })
                    .eq('organization_id', orgId)
                    .eq('halaqah_id', params.halaqahId)
                    .eq('assignment_type', 'primary')
                    .eq('is_active', true)
                    .neq('musammi_id', params.musammiId);
                if (endOldErr) throw endOldErr;
            }

            const { error: upErr } = await (supabase.from('halaqah_musammi_assignments' as any) as any).upsert(
                {
                    organization_id: orgId,
                    academic_year_id: selectedAcademicYear?.id || null,
                    halaqah_id: params.halaqahId,
                    musammi_id: params.musammiId,
                    assignment_type: assignmentType,
                    is_primary: assignmentType === 'primary',
                    valid_from: validFrom,
                    valid_to: params.validTo || null,
                    is_active: true,
                    status: 'active',
                    notes: params.notes || null,
                },
                { onConflict: 'organization_id,halaqah_id,musammi_id,assignment_type' }
            );
            if (upErr) throw upErr;
        }

        return rpcRes;
    }, [getOrgId, selectedAcademicYear?.id]);
    
    const addHalaqah = useCallback(async (newHalaqahData: Omit<Halaqah, 'id' | 'musammi' | 'no_urut'> & { musammi_id: number, no_urut?: number }) => {
        const orgId = await getOrgId();
        const { nama, santri: santriList, marhalah, jenis, waktu, no_urut, marhalah_id } = newHalaqahData as any;
        const { data: halaqahResult, error: halaqahError } = await (supabase as any).from('halaqah').insert({
            organization_id: orgId, academic_year_id: selectedAcademicYear?.id, nama, marhalah, jenis, waktu, musammi_id: newHalaqahData.musammi_id, no_urut: no_urut || 999, marhalah_id: marhalah_id || null
        }).select().single();

        if (halaqahError) throw halaqahError;

        const startDate = new Date().toISOString().split('T')[0];

        if (halaqahResult && newHalaqahData.musammi_id) {
            await assignHalaqahMusammi({
                halaqahId: halaqahResult.id,
                musammiId: newHalaqahData.musammi_id,
                assignmentType: 'primary',
                validFrom: startDate,
            });
        }

        if (halaqahResult && santriList.length > 0) {
            const v2Memberships = santriList.map((s: any) => ({
                organization_id: orgId,
                academic_year_id: selectedAcademicYear?.id || null,
                halaqah_id: halaqahResult.id,
                student_id: s.id,
                valid_from: startDate,
                valid_to: null,
                status: 'active'
            }));
            const { error: v2Err } = await (supabase.from('halaqah_student_memberships' as any) as any).insert(v2Memberships);
            if (v2Err) {
                console.error('Error inserting halaqah_student_memberships:', v2Err);
                NotificationStore.addNotification(`Gagal mencatat keanggotaan halaqah V2: ${v2Err.message}`, 'error');
                throw v2Err;
            }
        }
        await fetchData();
    }, [assignHalaqahMusammi, fetchData, getOrgId, selectedAcademicYear?.id]);

    const updateHalaqah = useCallback(async (id: number, updatedData: {
        musammi_id?: number, 
        jenis?: HalaqahType, 
        nama?: string,
        marhalah?: Marhalah,
        no_urut?: number,
        waktu?: Waktu[]
    }) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('halaqah').update(updatedData).eq('organization_id', orgId).eq('id', id);
        if (error) throw error;

        if (updatedData.musammi_id) {
            const todayStr = new Date().toISOString().split('T')[0];
            await assignHalaqahMusammi({
                halaqahId: id,
                musammiId: updatedData.musammi_id,
                assignmentType: 'primary',
                validFrom: todayStr,
            });
        }

        await fetchData();
    }, [assignHalaqahMusammi, fetchData, getOrgId]);

    const deleteHalaqahBatch = useCallback(async (ids: number[]) => {
        if (ids.length === 0) return;
        const orgId = await getOrgId();
        // Arsipkan halaqah tanpa menghapus histori keanggotaan atau sesi (Fase 4 Section 4)
        const { error } = await (supabase as any)
            .from('halaqah')
            .update({ is_active: false, updated_at: new Date().toISOString() } as any)
            .eq('organization_id', orgId)
            .in('id', ids);
        if (error) {
            console.error(error);
            NotificationStore.addNotification("Gagal mengarsipkan Halaqah: " + error.message, "error");
            throw error;
        }
        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteHalaqah = useCallback(async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('halaqah').update({ is_active: false, updated_at: new Date().toISOString() } as any).eq('organization_id', orgId).eq('id', id);
        if (error) {
            console.error(error);
            NotificationStore.addNotification("Gagal mengarsipkan Halaqah: " + error.message, "error");
            throw error;
        }
        await fetchData();
    }, [fetchData, getOrgId]);

    const restoreHalaqah = useCallback(async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('halaqah').update({ is_active: true, updated_at: new Date().toISOString() } as any).eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const keluarkanSantri = useCallback(async (halaqahId: number, santriId: number, tanggal?: string) => {
        const orgId = await getOrgId();
        const endDate = tanggal || new Date().toISOString().split('T')[0];

        const { error: rpcErr } = await (supabase as any).rpc('rpc_mutate_halaqah_student', {
            p_student_id: santriId,
            p_from_halaqah_id: halaqahId,
            p_to_halaqah_id: null,
            p_effective_date: endDate,
            p_action: 'keluar',
        });

        if (rpcErr) {
            const isMissingRpc = rpcErr.code === '42883' || String(rpcErr.message || '').includes('rpc_mutate_halaqah_student');
            if (!isMissingRpc) {
                NotificationStore.addNotification(`Gagal mengeluarkan santri: ${rpcErr.message}`, 'error');
                throw rpcErr;
            }

            const { error: v2Err } = await (supabase.from('halaqah_student_memberships' as any) as any)
                .update({ valid_to: endDate, status: 'removed' })
                .eq('organization_id', orgId)
                .eq('halaqah_id', halaqahId)
                .eq('student_id', santriId)
                .is('valid_to', null);
            if (v2Err) {
                NotificationStore.addNotification(`Gagal memperbarui keanggotaan halaqah V2: ${v2Err.message}`, 'error');
                throw v2Err;
            }
        }

        await fetchData();
    }, [fetchData, getOrgId]);

    const mutasiSantri = useCallback(async (santriId: number, halaqahLamaId: number, halaqahBaruId: number, tanggal?: string) => {
        const orgId = await getOrgId();
        const mutasiDate = tanggal || new Date().toISOString().split('T')[0];

        const { error: rpcErr } = await (supabase as any).rpc('rpc_mutate_halaqah_student', {
            p_student_id: santriId,
            p_from_halaqah_id: halaqahLamaId,
            p_to_halaqah_id: halaqahBaruId,
            p_effective_date: mutasiDate,
            p_action: 'mutasi',
        });

        if (rpcErr) {
            const isMissingRpc = rpcErr.code === '42883' || String(rpcErr.message || '').includes('rpc_mutate_halaqah_student');
            if (!isMissingRpc) {
                NotificationStore.addNotification(`Gagal memutasi santri: ${rpcErr.message}`, 'error');
                throw rpcErr;
            }

            const { error: errClose } = await (supabase.from('halaqah_student_memberships' as any) as any)
                .update({ valid_to: mutasiDate, status: 'transferred' })
                .eq('organization_id', orgId)
                .eq('halaqah_id', halaqahLamaId)
                .eq('student_id', santriId)
                .is('valid_to', null);
            if (errClose) {
                NotificationStore.addNotification(`Gagal menutup riwayat halaqah lama: ${errClose.message}`, 'error');
                throw errClose;
            }

            const { error: errOpen } = await (supabase.from('halaqah_student_memberships' as any) as any).insert({
                organization_id: orgId,
                academic_year_id: selectedAcademicYear?.id || null,
                halaqah_id: halaqahBaruId,
                student_id: santriId,
                valid_from: mutasiDate,
                valid_to: null,
                status: 'active'
            });
            if (errOpen) {
                NotificationStore.addNotification(`Gagal menambahkan ke halaqah tujuan: ${errOpen.message}`, 'error');
                throw errOpen;
            }
        }

        await fetchData();
    }, [fetchData, getOrgId, selectedAcademicYear?.id]);

    const addSantriToHalaqah = useCallback(async (halaqahId: number, newSantri: Santri) => {
        const orgId = await getOrgId();
        const startDate = new Date().toISOString().split('T')[0];
        const { error: v2Err } = await (supabase.from('halaqah_student_memberships' as any) as any).insert({
            organization_id: orgId,
            academic_year_id: selectedAcademicYear?.id || null,
            halaqah_id: halaqahId,
            student_id: newSantri.id,
            valid_from: startDate,
            valid_to: null,
            status: 'active'
        });
        if (v2Err) {
            console.error(v2Err);
            NotificationStore.addNotification(`Gagal menambahkan santri ke halaqah: ${v2Err.message}`, "error");
            throw v2Err;
        }

        await fetchData();
    }, [fetchData, getOrgId, selectedAcademicYear?.id]);
    
    // ------------------------------------------------------------------
    // Fase 2: absensi & setoran hanya lewat RPC V2 (tidak ada tulis ke tabel lama)
    // ------------------------------------------------------------------
    const rpcOrThrow = async (fn: string, args: Record<string, any>) => {
        const { data, error } = await (supabase as any).rpc(fn, args);
        if (error) throw error;
        return data;
    };

    const addAttendanceRecords = async (records: Omit<AttendanceRecord, 'id' | 'nama' | 'marhalah' | 'kelas'>[], reason?: string) => {
        if (!records || records.length === 0) return;

        // Satu musammi' per halaqah per sesi: saat Musammi' lain dicatat untuk halaqah & sesi yang sama,
        // catatan musammi' sebelumnya dihapus (perilaku sama dengan versi lama).
        const musammiRecords = records.filter(r => r.peran === 'Musammi' && r.halaqahId);
        if (musammiRecords.length > 0) {
            const toRemove = attendance
                .filter((a: any) => a.peran === 'Musammi' && musammiRecords.some(r =>
                    r.halaqahId === a.halaqahId && r.date === a.date && r.waktu === a.waktu && r.personId !== a.personId))
                .map((a: any) => ({ kind: 'musammi', id: a.id }));
            if (toRemove.length > 0) {
                await rpcOrThrow('rpc_delete_attendance_entries', { p_items: toRemove, p_reason: reason || null });
            }
        }

        const chunkSize = 300;
        const payload = attendanceInputToRpcRecords(records);
        for (let i = 0; i < payload.length; i += chunkSize) {
            await rpcOrThrow('rpc_record_attendance', { p_records: payload.slice(i, i + chunkSize), p_reason: reason || null });
        }
        await segarkanAbsensiSetoran();
    };

    const findAttendanceById = (id: string | number) => attendance.find((a: any) => String(a.id) === String(id)) as any;

    const updateAttendanceRecord = useCallback(async (id: string | number, updates: { status?: AttendanceStatus, date?: string, waktu?: Waktu }, reason?: string) => {
        const existing = findAttendanceById(id);
        if (!existing) throw new Error('Catatan absensi tidak ditemukan. Muat ulang halaman.');
        if (updates.date && updates.date !== existing.date || updates.waktu && updates.waktu !== existing.waktu) {
            // Pindah tanggal/waktu = hapus catatan lama + catat di sesi baru
            await rpcOrThrow('rpc_delete_attendance_entries', { p_items: [{ kind: existing.kind, id: existing.id }], p_reason: reason || null });
            await rpcOrThrow('rpc_record_attendance', {
                p_records: attendanceInputToRpcRecords([{ ...existing, ...updates, status: updates.status || existing.status }]),
                p_reason: reason || null,
            });
        } else if (updates.status) {
            await rpcOrThrow('rpc_update_attendance_entry', { p_kind: existing.kind, p_id: existing.id, p_status: updates.status, p_reason: reason || null });
        }
        await segarkanAbsensiSetoran();
    }, [fetchData, attendance]);

    const deleteAttendanceRecord = useCallback(async (id: string | number, reason?: string) => {
        const existing = findAttendanceById(id);
        if (!existing) return;
        await rpcOrThrow('rpc_delete_attendance_entries', { p_items: [{ kind: existing.kind, id: existing.id }], p_reason: reason || null });
        await segarkanAbsensiSetoran();
    }, [fetchData, attendance]);

    const deleteAttendanceBatch = useCallback(async (date: string, waktu: string, options?: { peran?: string; halaqahId?: number; ids?: (string | number)[] }, reason?: string) => {
        let targets: any[];
        if (options?.ids && options.ids.length > 0) {
            const idSet = new Set(options.ids.map(String));
            targets = attendance.filter((a: any) => idSet.has(String(a.id)));
        } else {
            targets = attendance.filter((a: any) =>
                a.date === date && a.waktu === waktu &&
                (!options?.peran || options.peran === 'all' || a.peran === options.peran) &&
                (!options?.halaqahId || a.halaqahId === options.halaqahId));
        }
        const items = targets.map((a: any) => ({ kind: a.kind, id: a.id }));
        for (let i = 0; i < items.length; i += 300) {
            await rpcOrThrow('rpc_delete_attendance_entries', { p_items: items.slice(i, i + 300), p_reason: reason || null });
        }
        await segarkanAbsensiSetoran();
    }, [fetchData, attendance]);

    const addSetoranHarianRecord = useCallback(async (record: Partial<any>) => {
        const args = setoranInputToRpcArgs(record, {
            idempotencyKey: record.idempotency_key || `setoran_${record.santri_id}_${record.tanggal}_${record.waktu}_${Date.now()}`,
            sessionId: record.session_id || null,
        });
        const result = await rpcOrThrow('rpc_submit_recitation_entry', args);
        await segarkanAbsensiSetoran();
        return result;
    }, [fetchData]);

    /** Fase 3: simpan setoran dari argumen RPC lengkap (dipakai FormSetoranRingkas). */
    const simpanSetoran = useCallback(async (args: Record<string, any>, opts: { refresh?: boolean } = {}) => {
        const result = await rpcOrThrow('rpc_submit_recitation_entry', args);
        if (opts.refresh !== false) await segarkanAbsensiSetoran();
        return result;
    }, [fetchData]);

    const updateSetoranHarianRecord = useCallback(async (id: string | number, updates: Partial<any>, reason?: string) => {
        const existing: any = setoranHarian.find((r: any) => String(r.id) === String(id) || String(r.legacy_setoran_id) === String(id));
        if (!existing) throw new Error('Catatan setoran tidak ditemukan. Muat ulang halaman.');
        const merged = { ...existing, ...updates };
        // Isian surat/ayat baru menggantikan nomor surat lama
        if (updates.surat_mulai || updates.surat) { delete merged.surah_start_no; }
        if (updates.surat_selesai || updates.surat) { delete merged.surah_end_no; }
        const args = setoranInputToRpcArgs(merged, { existingEntryId: existing.v2_id || (isUuid(existing.id) ? existing.id : null), reason: reason || updates.alasan || null });
        const result = await rpcOrThrow('rpc_submit_recitation_entry', args);
        await segarkanAbsensiSetoran();
        return result;
    }, [fetchData, setoranHarian]);

    const deleteSetoranHarianRecord = useCallback(async (id: string | number, reason?: string) => {
        const existing: any = setoranHarian.find((r: any) => String(r.id) === String(id) || String(r.legacy_setoran_id) === String(id));
        const entryId = existing?.v2_id || (isUuid(id) ? id : null);
        if (!entryId) throw new Error('Catatan setoran tidak ditemukan. Muat ulang halaman.');
        // Setoran tidak dihapus permanen: dibatalkan (voided) dan tercatat di riwayat revisi
        await rpcOrThrow('rpc_review_recitation_entry', {
            p_entry_id: entryId,
            p_new_status: 'voided',
            p_reason: (reason || '').trim(),
        });
        await segarkanAbsensiSetoran();
    }, [fetchData, setoranHarian]);

    // Fase 4: student_progress tidak dipakai lagi. Capaian per periode = period_recaps (lewat RPC di bawah).
    const rpcRekap = async (fn: string, args: Record<string, any>) => {
        const { data, error } = await (supabase as any).rpc(fn, args);
        if (error) throw error;
        return data;
    };

    // Fase 5: Silabus Hafalan tidak lagi menjadi komponen raport (raport 3 komponen).

    // ---- Fase 4: Rekap Periode ----
    const bukaFormPeriode = useCallback((periodId: string, halaqahId: number) =>
        rpcRekap('rpc_buka_form_periode', { p_period: periodId, p_halaqah: halaqahId }), []);

    const simpanFormPeriode = useCallback(async (args: { periodId: string; halaqahId: number; rows: any[]; activity?: Record<string, any> | null; kirim?: boolean; reason?: string | null }) => {
        const res = await rpcRekap('rpc_simpan_form_periode', {
            p_period: args.periodId, p_halaqah: args.halaqahId, p_rows: args.rows,
            p_activity: args.activity ?? null, p_kirim: Boolean(args.kirim), p_reason: args.reason?.trim() || null,
        });
        await fetchData();
        return res;
    }, [fetchData]);

    const bukaKembaliFormPeriode = useCallback(async (formId: string, reason: string) => {
        const res = await rpcRekap('rpc_buka_kembali_form_periode', { p_form: formId, p_reason: reason.trim() });
        await fetchData();
        return res;
    }, [fetchData]);

    const hitungRekapHarian = useCallback(async (periodId: string, halaqahId?: number | null) => {
        const res = await rpcRekap('rpc_hitung_rekap_harian', { p_period: periodId, p_halaqah: halaqahId ?? null });
        await fetchData();
        return res;
    }, [fetchData]);

    const statusPeriode = useCallback(async (periodId: string) =>
        ((await rpcRekap('rpc_status_periode', { p_period: periodId })) || []) as any[], []);

    const simpanPeriode = useCallback(async (p: { id?: string; name: string; start_date: string; end_date: string; academic_year_id?: number | null }) => {
        const orgId = await getOrgId();
        const row = { name: p.name.trim(), start_date: p.start_date, end_date: p.end_date, academic_year_id: p.academic_year_id ?? null };
        const { error } = p.id
            ? await (supabase as any).from('evaluation_periods').update(row).eq('organization_id', orgId).eq('id', p.id)
            : await (supabase as any).from('evaluation_periods').insert({ ...row, organization_id: orgId });
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const hapusPeriode = useCallback(async (periodId: string, reason?: string | null) => {
        await rpcRekap('rpc_hapus_periode', { p_period: periodId, p_reason: reason?.trim() || null });
        await fetchData();
    }, [fetchData]);

    const setModeHalaqah = useCallback(async (halaqahId: number, mode: 'harian' | 'rekap') => {
        const res = await rpcRekap('rpc_set_mode_halaqah', { p_halaqah: halaqahId, p_mode: mode });
        await fetchData();
        return res;
    }, [fetchData]);

    /** Isian form periode (isian sistem: hanya nama; isian bebas & pertanyaan kegiatan: lengkap). */
    const simpanIsianForm = useCallback(async (f: Partial<PeriodFormField> & { scope: 'santri' | 'kegiatan' }) => {
        const orgId = await getOrgId();
        const row: Record<string, any> = {
            label: (f.label || '').trim(), description: f.description ?? null,
            sort_order: f.sort_order ?? 100, is_active: f.is_active ?? true,
        };
        if (!f.system_key) {
            row.field_type = f.field_type || 'text';
            row.options = f.options || [];
            row.scope = f.scope;
        }
        const { error } = f.id
            ? await (supabase as any).from('period_form_fields').update(row).eq('organization_id', orgId).eq('id', f.id)
            : await (supabase as any).from('period_form_fields').insert({ ...row, organization_id: orgId });
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const hapusIsianForm = useCallback(async (id: string) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('period_form_fields').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    // Class Target Mutation
    const saveClassTargetBatch = useCallback(async (targets: Omit<ClassTarget, 'id'>[]) => {
        const orgId = await getOrgId();
        const ayId = selectedAcademicYear?.id || 1;
        const legacyEnumList = ['Mutawassithah', 'Aliyah', 'Jamiah'];
        const isUUID = (str: any): boolean => {
            if (!str || typeof str !== 'string') return false;
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        };
        
        // Cache master marhalahs & kelas relasi
        let currentMarhalahs = [...(masterMarhalahs || [])];
        if (currentMarhalahs.length === 0) {
            try {
                const { data: mmData } = await (supabase.from('master_marhalah' as any) as any).select('*').eq('organization_id', orgId);
                if (mmData) currentMarhalahs = mmData;
            } catch (e) {
                console.warn('Error fetching master_marhalah:', e);
            }
        }

        let currentKelasRelasi = [...(masterKelasRelasi || [])];
        if (currentKelasRelasi.length === 0) {
            try {
                const { data: mkrData } = await (supabase.from('master_kelas_relasi' as any) as any).select('*').eq('organization_id', orgId);
                if (mkrData) currentKelasRelasi = mkrData;
            } catch (e) {
                console.warn('Error fetching master_kelas_relasi:', e);
            }
        }

        // Fetch existing class_targets for this organization and academic year
        let hasSemesterCol = true;
        let existingRecords: any[] = [];
        try {
            const { data: ctData, error: ctErr } = await (supabase.from('class_targets' as any) as any)
                .select('id, marhalah_id, kelas_id, marhalah, kelas, semester')
                .eq('organization_id', orgId)
                .eq('academic_year_id', ayId);
            if (ctErr && (ctErr.code === '42703' || ctErr.code === 'PGRST204' || ctErr.message?.includes('semester'))) {
                hasSemesterCol = false;
                const { data: fallbackCt } = await (supabase.from('class_targets' as any) as any)
                    .select('id, marhalah_id, kelas_id, marhalah, kelas')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', ayId);
                if (fallbackCt) existingRecords = fallbackCt;
            } else if (ctData) {
                existingRecords = ctData;
            }
        } catch (e) {
            hasSemesterCol = false;
            console.warn('Error fetching class_targets with semester:', e);
        }

        for (const targetData of targets) {
            const safeLegacyMarhalah = legacyEnumList.includes(targetData.marhalah) ? targetData.marhalah : 'Mutawassithah';
            const targetSemester = targetData.semester || 'Ganjil';

            // Resolve UUID for marhalah_id
            let mId = isUUID(targetData.marhalah_id) ? targetData.marhalah_id : null;
            if (!mId) {
                const foundM = currentMarhalahs.find((m: any) => m.nama === targetData.marhalah);
                if (foundM && isUUID(foundM.id)) {
                    mId = foundM.id;
                } else {
                    // Try lookup or insert in master_marhalah
                    try {
                        const { data: qM } = await (supabase.from('master_marhalah' as any) as any)
                            .select('id')
                            .eq('organization_id', orgId)
                            .eq('nama', targetData.marhalah)
                            .maybeSingle();
                        if (qM && isUUID(qM.id)) {
                            mId = qM.id;
                        } else {
                            const { data: insM } = await (supabase.from('master_marhalah' as any) as any)
                                .insert({ organization_id: orgId, nama: targetData.marhalah })
                                .select('id')
                                .maybeSingle();
                            if (insM && isUUID(insM.id)) {
                                mId = insM.id;
                                currentMarhalahs.push({ id: mId, nama: targetData.marhalah, organization_id: orgId });
                            }
                        }
                    } catch (e) {
                        console.warn('Could not auto-create master_marhalah:', e);
                    }
                }
            }

            // Resolve UUID for kelas_id (only if not 'all')
            let kId: string | null = null;
            if (targetData.kelas === 'all') {
                kId = null;
            } else {
                kId = isUUID(targetData.kelas_id) ? targetData.kelas_id : null;
                if (!kId) {
                    const foundK = currentKelasRelasi.find((k: any) => 
                        k.nama_kelas === targetData.kelas && (!mId || k.marhalah_id === mId)
                    ) || currentKelasRelasi.find((k: any) => k.nama_kelas === targetData.kelas);
                    
                    if (foundK && isUUID(foundK.id)) {
                        kId = foundK.id;
                    } else if (mId) {
                        // Try lookup or insert in master_kelas_relasi
                        try {
                            const { data: qK } = await (supabase.from('master_kelas_relasi' as any) as any)
                                .select('id')
                                .eq('organization_id', orgId)
                                .eq('marhalah_id', mId)
                                .eq('nama_kelas', targetData.kelas)
                                .maybeSingle();
                            if (qK && isUUID(qK.id)) {
                                kId = qK.id;
                            } else {
                                const { data: insK } = await (supabase.from('master_kelas_relasi' as any) as any)
                                    .insert({ organization_id: orgId, marhalah_id: mId, nama_kelas: targetData.kelas })
                                    .select('id')
                                    .maybeSingle();
                                if (insK && isUUID(insK.id)) {
                                    kId = insK.id;
                                    currentKelasRelasi.push({ id: kId, marhalah_id: mId, nama_kelas: targetData.kelas, organization_id: orgId });
                                }
                            }
                        } catch (e) {
                            console.warn('Could not auto-create master_kelas_relasi:', e);
                        }
                    }
                }

                // If kId still couldn't be resolved for a specific class and targets are zero, skip to avoid colliding with 'all' on unique constraint
                if (!kId) {
                    const hasValues = (targetData.target_ziyadah || 0) > 0 || (targetData.target_murojaah || 0) > 0 || (targetData.target_hafalan || 0) > 0;
                    if (!hasValues) {
                        continue;
                    }
                }
            }

            const payload: any = { 
                organization_id: orgId, 
                academic_year_id: ayId,
                marhalah: targetData.marhalah,
                kelas: targetData.kelas,
                target_ziyadah: targetData.target_ziyadah ?? 0,
                target_murojaah: targetData.target_murojaah ?? 0,
                target_hafalan: targetData.target_hafalan ?? 0,
                marhalah_id: mId,
                kelas_id: kId,
            };
            if (hasSemesterCol) {
                payload.semester = targetSemester;
            }

            const isTargetAll = targetData.kelas === 'all';
            let existing: any = null;
            if (existingRecords && existingRecords.length > 0) {
                existing = existingRecords.find((r: any) => {
                    const marhalahMatch = (mId && r.marhalah_id === mId) || (r.marhalah === targetData.marhalah);
                    if (!marhalahMatch) return false;

                    if (hasSemesterCol) {
                        const rSem = r.semester || 'Ganjil';
                        if (rSem !== targetSemester) return false;
                    }

                    if (isTargetAll) {
                        return r.kelas === 'all' || r.kelas_id === null || r.kelas_id === '00000000-0000-0000-0000-000000000000' || (!r.kelas && !r.kelas_id);
                    } else {
                        if (r.kelas === 'all') return false;
                        if (kId && r.kelas_id && r.kelas_id === kId) return true;
                        return r.kelas === targetData.kelas;
                    }
                });
            }

            if (existing) {
                let { error } = await (supabase.from('class_targets' as any) as any).update(payload).eq('id', existing.id);
                if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('semester'))) {
                    hasSemesterCol = false;
                    delete payload.semester;
                    const res = await (supabase.from('class_targets' as any) as any).update(payload).eq('id', existing.id);
                    error = res.error;
                }
                if (error && (error.code === '42703' || error.message?.includes('does not exist'))) {
                    delete payload.marhalah_id;
                    delete payload.kelas_id;
                    const res = await (supabase.from('class_targets' as any) as any).update(payload).eq('id', existing.id);
                    error = res.error;
                }
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await (supabase.from('class_targets' as any) as any).update(payload).eq('id', existing.id);
                    error = res.error;
                }
                // If update encounters duplicate key (23505), resolve by updating conflicting row
                if (error && error.code === '23505') {
                    let conflictQ = (supabase.from('class_targets' as any) as any)
                        .select('id')
                        .eq('organization_id', orgId)
                        .eq('academic_year_id', ayId);
                    if (hasSemesterCol && payload.semester) conflictQ = conflictQ.eq('semester', payload.semester);
                    if (mId) conflictQ = conflictQ.eq('marhalah_id', mId);
                    if (kId) conflictQ = conflictQ.eq('kelas_id', kId);
                    else conflictQ = conflictQ.is('kelas_id', null);
                    const { data: conflictRow } = await conflictQ.maybeSingle();
                    if (conflictRow && conflictRow.id !== existing.id) {
                        await (supabase.from('class_targets' as any) as any).delete().eq('id', existing.id);
                        await (supabase.from('class_targets' as any) as any).update(payload).eq('id', conflictRow.id);
                        existing.id = conflictRow.id;
                        error = null;
                    }
                }
                if (error) throw error;
            } else {
                let { data: insData, error } = await (supabase.from('class_targets' as any) as any).insert([payload]).select('id').maybeSingle();
                if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('semester'))) {
                    hasSemesterCol = false;
                    delete payload.semester;
                    const res = await (supabase.from('class_targets' as any) as any).insert([payload]).select('id').maybeSingle();
                    error = res.error;
                    insData = res.data;
                }
                if (error && (error.code === '42703' || error.message?.includes('does not exist'))) {
                    delete payload.marhalah_id;
                    delete payload.kelas_id;
                    const res = await (supabase.from('class_targets' as any) as any).insert([payload]).select('id').maybeSingle();
                    error = res.error;
                    insData = res.data;
                }
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await (supabase.from('class_targets' as any) as any).insert([payload]).select('id').maybeSingle();
                    error = res.error;
                    insData = res.data;
                }
                // Handle duplicate key error (23505) by falling back to update on existing row
                if (error && error.code === '23505') {
                    let conflictQ = (supabase.from('class_targets' as any) as any)
                        .select('id')
                        .eq('organization_id', orgId)
                        .eq('academic_year_id', ayId);
                    if (hasSemesterCol && payload.semester) conflictQ = conflictQ.eq('semester', payload.semester);
                    if (mId) conflictQ = conflictQ.eq('marhalah_id', mId);
                    if (kId) conflictQ = conflictQ.eq('kelas_id', kId);
                    else conflictQ = conflictQ.is('kelas_id', null);
                    const { data: conflictRow } = await conflictQ.maybeSingle();
                    if (conflictRow) {
                        const res = await (supabase.from('class_targets' as any) as any).update(payload).eq('id', conflictRow.id);
                        if (!res.error) {
                            error = null;
                            insData = conflictRow;
                        }
                    }
                }
                if (error) throw error;

                if (insData && insData.id) {
                    existingRecords.push({
                        id: insData.id,
                        marhalah_id: mId,
                        kelas_id: kId,
                        marhalah: targetData.marhalah,
                        kelas: targetData.kelas,
                        semester: targetSemester
                    });
                }
            }
        }

        // Also persist snapshot to app_settings as backup
        try {
            await saveAppSetting(`TARGET_CLASS_SEMESTER_CONFIG_${ayId}`, JSON.stringify(targets));
        } catch (e) {
            console.warn('Could not backup target semester config in app_settings:', e);
        }
        await fetchData();
    }, [fetchData, selectedAcademicYear, getOrgId, masterMarhalahs, masterKelasRelasi]);

    const saveClassTarget = useCallback(async (targetData: Omit<ClassTarget, 'id'>) => {
        await saveClassTargetBatch([targetData]);
    }, [saveClassTargetBatch]);

    const saveAppSetting = async (key: string, value: string) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('app_settings').upsert({
            organization_id: orgId,
            key,
            value
        }, { onConflict: 'organization_id,key' });
        if (error) throw error;
        await fetchData();
    };

    const saveMultipleAppSettings = async (settings: {key: string, value: string}[]) => {
        const orgId = await getOrgId();
        const records = settings.map(s => ({
            organization_id: orgId,
            key: s.key,
            value: s.value
        }));
        const { error } = await (supabase as any).from('app_settings').upsert(records, { onConflict: 'organization_id,key' });
        if (error) throw error;
        await fetchData();
    };

    // ---- Fase 5: Ujian & Raport (semua tulis lewat RPC / tabel ber-RLS Admin) ----
    const rpcUjian = async (fn: string, args: Record<string, any>) => {
        const { data, error } = await (supabase as any).rpc(fn, args);
        if (error) throw error;
        return data;
    };

    /** Simpan nilai ujian. mode: 'baru' | 'remedial' | 'koreksi' (Admin + alasan). */
    const simpanUjian = useCallback(async (args: {
        santriId: number; jenis: 'bulanan' | 'semester'; periodId?: string | null; materiJuz?: string | null;
        juz?: { juz: number; kabir: number; shoghir: number; nilai_custom?: number | null }[] | null; nilai?: number | null;
        mode?: 'baru' | 'remedial' | 'koreksi'; alasan?: string | null; catatan?: string | null;
    }, opts: { refresh?: boolean } = {}) => {
        if (!selectedAcademicYear?.id) throw new Error('Pilih tahun ajaran dulu.');
        const res = await rpcUjian('rpc_simpan_ujian', {
            p_santri_id: args.santriId, p_exam_type: args.jenis, p_academic_year_id: selectedAcademicYear.id,
            p_semester: selectedAcademicYear.active_semester || 'Ganjil', p_period_id: args.periodId ?? null,
            p_materi_juz: args.materiJuz ?? null, p_juz: args.juz ?? null, p_nilai: args.nilai ?? null,
            p_mode: args.mode || 'baru', p_reason: args.alasan?.trim() || null, p_notes: args.catatan ?? null,
        });
        if (opts.refresh !== false) await fetchData();
        return res;
    }, [fetchData, selectedAcademicYear]);

    const batalUjian = useCallback(async (attemptId: string, alasan: string) => {
        await rpcUjian('rpc_batal_ujian', { p_attempt_id: attemptId, p_reason: alasan.trim() });
        await fetchData();
    }, [fetchData]);

    const simpanCatatanRaport = useCallback(async (santriId: number, catatan: string, opts: { refresh?: boolean } = {}) => {
        if (!selectedAcademicYear?.id) throw new Error('Pilih tahun ajaran dulu.');
        await rpcUjian('rpc_simpan_catatan_raport', {
            p_santri_id: santriId, p_academic_year_id: selectedAcademicYear.id,
            p_semester: selectedAcademicYear.active_semester || 'Ganjil', p_catatan: catatan,
        });
        if (opts.refresh !== false) await fetchData();
    }, [fetchData, selectedAcademicYear]);

    /** Komponen raport & kekurangan (server). */
    const komponenRaport = useCallback(async (santriIds?: number[] | null) => {
        if (!selectedAcademicYear?.id) return [];
        const data = await rpcUjian('rpc_komponen_raport', {
            p_academic_year_id: selectedAcademicYear.id, p_semester: selectedAcademicYear.active_semester || 'Ganjil',
            p_santri_ids: santriIds && santriIds.length ? santriIds : null,
        });
        return ((data as any[]) || []).map((r: any) => ({ ...r.komponen, santri_id: Number(r.santri_id) }));
    }, [selectedAcademicYear]);

    /** Terbitkan / amandemen raport. Nilai dihitung server; ditolak bila komponen kurang. */
    const terbitkanRaport = useCallback(async (santriId: number, info: Record<string, any>, alasan?: string | null) =>
        rpcUjian('rpc_publish_report_card', {
            p_academic_year_id: selectedAcademicYear?.id, p_semester: selectedAcademicYear?.active_semester || 'Ganjil',
            p_santri_id: santriId, p_info: info || {}, p_amendment_reason: alasan?.trim() || null,
        }), [selectedAcademicYear]);

    const simpanPeriodeUjian = useCallback(async (p: { id?: string; ke: number; label: string }) => {
        const orgId = await getOrgId();
        if (!selectedAcademicYear?.id) throw new Error('Pilih tahun ajaran dulu.');
        const row = { ke: p.ke, label: p.label.trim() };
        const { error } = p.id
            ? await (supabase as any).from('monthly_exam_periods').update(row).eq('organization_id', orgId).eq('id', p.id)
            : await (supabase as any).from('monthly_exam_periods').insert({ ...row, organization_id: orgId, academic_year_id: selectedAcademicYear.id, semester: selectedAcademicYear.active_semester || 'Ganjil' });
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId, selectedAcademicYear]);

    const hapusPeriodeUjian = useCallback(async (id: string) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('monthly_exam_periods').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const simpanPengaturanRaport = useCallback(async (p: Partial<PengaturanRaport>) => {
        const orgId = await getOrgId();
        const { organization_id, ...rest } = p as any;
        const { error } = await (supabase as any).from('raport_settings').upsert({ ...rest, organization_id: orgId }, { onConflict: 'organization_id' });
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const tambahPenguji = useCallback(async (halaqahId: number, musammiId: number, jenis: 'semua' | 'bulanan' | 'semester') => {
        const orgId = await getOrgId();
        if (!selectedAcademicYear?.id) throw new Error('Pilih tahun ajaran dulu.');
        const { error } = await (supabase as any).from('exam_assignments').insert({
            organization_id: orgId, academic_year_id: selectedAcademicYear.id, semester: selectedAcademicYear.active_semester || 'Ganjil',
            halaqah_id: halaqahId, musammi_id: musammiId, exam_type: jenis,
        });
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId, selectedAcademicYear]);

    const hapusPenguji = useCallback(async (id: string) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('exam_assignments').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m: any) => m.nama), [masterMarhalahs]);
    const [globalWaktuHalaqah, setGlobalWaktuHalaqah] = useState<string[]>(['Shubuh', 'Dhuha', 'Ashar', 'Maghrib', 'Isya']);
    const [globalJenisHalaqah, setGlobalJenisHalaqah] = useState<string[]>(['Halaqah Utama', 'Halaqah Pagi']);
    const [globalAttendanceStatus, setGlobalAttendanceStatus] = useState<string[]>(['Hadir', 'Izin', 'Sakit', 'Terlambat', 'Alpa']);
    // Fase 5: skala predikat nilai = predikat rubrik penilaian aktif (bukan app_settings GLOBAL_PREDIKAT_NILAI)
    const globalPredikatNilai = rubrikAktif.predicates;

    useEffect(() => {
        if (!loading) {
            const marhalahSetting = appSettings.find(s => s.key === 'GLOBAL_MARHALAHS')?.value;
            const waktuSetting = appSettings.find(s => s.key === 'GLOBAL_WAKTU_HALAQAH')?.value;
            const jenisSetting = appSettings.find(s => s.key === 'GLOBAL_JENIS_HALAQAH')?.value;
            const statusSetting = appSettings.find(s => s.key === 'GLOBAL_ATTENDANCE_STATUS')?.value;
            
            
            // Fase 2: waktu, jenis halaqah, dan status kehadiran dari tabel referensi.
            // app_settings lama hanya dipakai bila tabel referensi belum dimigrasikan.
            const activeSlots = sessionSlots.filter(x => x.is_active).map(x => x.code);
            const activeTypes = halaqahTypes.filter(x => x.is_active).map(x => x.name);
            const activeStatuses = attendanceStatuses.filter(x => x.is_active).map(x => x.name);
            if (activeSlots.length) setGlobalWaktuHalaqah(activeSlots);
            else if (waktuSetting) { try { setGlobalWaktuHalaqah(JSON.parse(waktuSetting)); } catch(e) {} }
            if (activeTypes.length) setGlobalJenisHalaqah(activeTypes);
            else if (jenisSetting) { try { setGlobalJenisHalaqah(JSON.parse(jenisSetting)); } catch(e) {} }
            if (activeStatuses.length) setGlobalAttendanceStatus(activeStatuses);
            else if (statusSetting) { try { setGlobalAttendanceStatus(JSON.parse(statusSetting)); } catch(e) {} }
        }
    }, [appSettings, loading, sessionSlots, halaqahTypes, attendanceStatuses]);

    
    

    
    const addMasterMarhalah = async (nama: string) => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { error } = await supabase.from('master_marhalah' as any).insert({ organization_id: orgId, nama }).select().single();
            if (error) throw error;
            await fetchData();
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    };

    
    const updateMasterMarhalah = async (id: string, nama: string) => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;

            // First get the old name within this organization
            const { data: oldData } = await (supabase.from('master_marhalah' as any) as any)
                .select('nama')
                .eq('organization_id', orgId)
                .eq('id', id)
                .maybeSingle();
            const oldName = oldData?.nama;

            // Update master_marhalah scoped to organization
            const { error } = await (supabase.from('master_marhalah' as any) as any)
                .update({ nama })
                .eq('organization_id', orgId)
                .eq('id', id);
            if (error) throw error;
            
            // If name changed, update denormalized strings in other tables strictly within this organization
            if (oldName && oldName !== nama) {
                const tables = ['santri', 'student_classes', 'master_kelas', 'wali_kelas', 'musammi', 'musyrifs', 'halaqah', 'class_targets'];
                for (const table of tables) {
                    await (supabase.from(table as any) as any)
                        .update({ marhalah: nama })
                        .eq('organization_id', orgId)
                        .eq('marhalah', oldName);
                }
            }
            // Always sync rows linked via marhalah_id within this organization
            const tablesWithId = ['santri', 'student_classes', 'halaqah', 'wali_kelas', 'musammi', 'class_targets'];
            for (const table of tablesWithId) {
                await (supabase.from(table as any) as any)
                    .update({ marhalah: nama })
                    .eq('organization_id', orgId)
                    .eq('marhalah_id', id);
            }

            await fetchData();
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    };

    const deleteMasterMarhalah = async (id: string) => {
        try {
            const orgId = await getOrgId();
            const { error } = await (supabase.from('master_marhalah' as any) as any)
                .delete()
                .eq('organization_id', orgId)
                .eq('id', id);
            if (error) throw error;
            await fetchData();
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    };

    const addMasterKelasRelasi = async (marhalah_id: string, nama_kelas: string) => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { error } = await (supabase.from('master_kelas_relasi' as any) as any).insert({ organization_id: orgId, marhalah_id, nama_kelas }).select().single();
            if (error) throw error;
            await fetchData();
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    };

    
    const updateMasterKelasRelasi = async (id: string, marhalah_id: string, nama_kelas: string) => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;

            // First get the old name & marhalah_id within this organization
            const { data: oldData } = await (supabase.from('master_kelas_relasi' as any) as any)
                .select('nama_kelas, marhalah_id')
                .eq('organization_id', orgId)
                .eq('id', id)
                .maybeSingle();
            const oldName = oldData?.nama_kelas;
            const targetMarhalahName = masterMarhalahs.find((m: any) => m.id === (marhalah_id || oldData?.marhalah_id))?.nama;

            const { error } = await (supabase.from('master_kelas_relasi' as any) as any)
                .update({ nama_kelas, marhalah_id })
                .eq('organization_id', orgId)
                .eq('id', id);
            if (error) throw error;
            
            // Update rows linked by kelas_id first (exact relational match)
            const tablesWithKelasId = ['santri', 'student_classes', 'wali_kelas', 'musammi', 'class_targets'];
            for (const table of tablesWithKelasId) {
                await (supabase.from(table as any) as any)
                    .update({ kelas: nama_kelas })
                    .eq('organization_id', orgId)
                    .eq('kelas_id', id);
            }

            // If name changed, also update legacy rows matching both organization_id AND marhalah
            if (oldName && oldName !== nama_kelas && targetMarhalahName) {
                const legacyTables = ['santri', 'student_classes', 'wali_kelas', 'musammi', 'class_targets', 'master_kelas'];
                for (const table of legacyTables) {
                    const colName = table === 'master_kelas' ? 'nama_kelas' : 'kelas';
                    await (supabase.from(table as any) as any)
                        .update({ [colName]: nama_kelas })
                        .eq('organization_id', orgId)
                        .eq('marhalah', targetMarhalahName)
                        .eq(colName, oldName);
                }
            }
            await fetchData();
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    };

    const deleteMasterKelasRelasi = async (id: string) => {
        try {
            const orgId = await getOrgId();
            const { error } = await (supabase.from('master_kelas_relasi' as any) as any)
                .delete()
                .eq('organization_id', orgId)
                .eq('id', id);
            if (error) throw error;
            await fetchData();
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    };

    /** Periode tahun ajaran terpilih dalam bentuk lama (MasterEvaluationPeriod, id = UUID periode). */
    const periodeEvaluasi = useMemo(
        () => periodeTahunAjaran(evaluationPeriods, selectedAcademicYear?.id).map(periodeKeLegacy),
        [evaluationPeriods, selectedAcademicYear]
    );

    return {
        santri, allSantri, musammi, waliKelas, musyrifs, halaqah, attendance, studentProgress, classTargets, 
        studentEvaluations, evaluationSettings, halaqahEvalQuestions, halaqahEvaluations, appSettings,
        masterKelas, masterMarhalahs, masterKelasRelasi,
        studentEnrollments, halaqahMemberships, musammiAssignments, queryErrors,
        userProfile, setoranHarian, orgName, orgLogo, updateOrganization,
        recitationKinds, attendanceStatuses, sessionSlots, halaqahTypes, fluencyRules, simpanSetoran,
        globalMarhalahs, globalWaktuHalaqah, globalJenisHalaqah, globalAttendanceStatus, globalPredikatNilai,
        loading: loading || ayLoading, error, fetchData, 
        addHalaqah, updateHalaqah, deleteHalaqah, deleteHalaqahBatch, restoreHalaqah, keluarkanSantri, mutasiSantri, 
        addSantriToHalaqah, assignHalaqahMusammi, addAttendanceRecords, updateAttendanceRecord, deleteAttendanceRecord, deleteAttendanceBatch,
        addSetoranHarianRecord, updateSetoranHarianRecord, deleteSetoranHarianRecord,
        saveClassTarget, saveClassTargetBatch, saveAppSetting,
        // Fase 4: Rekap Periode
        evaluationPeriods, periodeEvaluasi, periodFormFields, periodRecaps, periodForms,
        bukaFormPeriode, simpanFormPeriode, bukaKembaliFormPeriode, hitungRekapHarian, statusPeriode,
        simpanPeriode, hapusPeriode, setModeHalaqah, simpanIsianForm, hapusIsianForm,
        saveMultipleAppSettings,
        // Fase 5: Ujian & Raport
        examAttempts, periodeUjianBulanan, rubrikAktif, pengaturanRaport, pengujiUjian, catatanRaport,
        simpanUjian, batalUjian, simpanCatatanRaport, komponenRaport, terbitkanRaport,
        simpanPeriodeUjian, hapusPeriodeUjian, simpanPengaturanRaport, tambahPenguji, hapusPenguji,
        addMasterKelas, deleteMasterKelas,
        addMasterMarhalah, updateMasterMarhalah, deleteMasterMarhalah,
        addMasterKelasRelasi, updateMasterKelasRelasi, deleteMasterKelasRelasi,
        getOrgId,
        // Fase 7: data per halaman
        riwayatTermuat, memuatRiwayat, muatRiwayat, pastikanTanggal, segarkanAbsensiSetoran,
        selectedAcademicYear,
        activeSemester: selectedAcademicYear?.active_semester || 'Ganjil',
        activeSemesterDates
    };
};

export type SupabaseDataContextType = ReturnType<typeof useSupabaseDataInternal>;
const SupabaseDataContext = createContext<SupabaseDataContextType | null>(null);

export const SupabaseDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const data = useSupabaseDataInternal();
    return (
        <SupabaseDataContext.Provider value={data}>
            {children}
        </SupabaseDataContext.Provider>
    );
};

export const useSupabaseData = () => {
    const context = useContext(SupabaseDataContext);
    if (!context) {
        throw new Error('useSupabaseData must be used within a SupabaseDataProvider');
    }
    return context;
};

/**
 * Fase 7 · dipanggil halaman/komponen yang butuh riwayat absensi & setoran (laporan, buku absensi,
 * grafik, detail santri). Muat sekali per sesi; `tunda` (ms) memberi waktu halaman tampil dulu.
 */
export const useRiwayat = (opsi: { aktif?: boolean; tunda?: number } = {}) => {
    const { muatRiwayat, memuatRiwayat, riwayatTermuat } = useSupabaseData();
    const aktif = opsi.aktif !== false;
    useEffect(() => {
        if (!aktif) return;
        if (!opsi.tunda) { muatRiwayat(); return; }
        const t = window.setTimeout(() => { muatRiwayat(); }, opsi.tunda);
        return () => window.clearTimeout(t);
    }, [aktif, opsi.tunda, muatRiwayat]);
    return { memuatRiwayat, riwayatTermuat, muatRiwayat };
};


/** Fase 7 · penanda kecil saat riwayat sedang dimuat (ditaruh di layout, di dalam provider). */
export const IndikatorRiwayat: React.FC = () => {
    const { memuatRiwayat } = useSupabaseData();
    if (!memuatRiwayat) return null;
    return (
        <div role="status" aria-live="polite"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg print:hidden">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Memuat riwayat…
        </div>
    );
};
