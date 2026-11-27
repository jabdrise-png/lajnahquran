// Dipisah dari useSupabaseData.tsx (Fase 8 bagian 2): paruh awal useSupabaseDataInternal.
import React, { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Santri, Musammi, Halaqah, AttendanceRecord, HalaqahType, Waktu, StudentProgress, ProgressType, WaliKelas, ClassTarget, StudentEvaluation, EvaluationSetting, AppSetting, MasterKelas, HalaqahEvaluationQuestion, HalaqahEvaluation, MasterMarhalah, MasterKelasRelasi } from '../types';
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
import { JENDELA_OPERASIONAL_HARI, tanggalLokal, awalJendelaOperasional, ambilBertahap, beriNamaAbsensi, ambilAbsensiSetoran, type KonteksAbsensi } from './useSupabaseData.absensi';
import { SupabaseDataContextType } from './useSupabaseData';

export function useSupabaseDataInternalMuat() {
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
    const [halaqahEvalQuestions, setHalaqahEvalQuestions] = useState<HalaqahEvaluationQuestion[]>([]);
    const [halaqahEvaluations, setHalaqahEvaluations] = useState<HalaqahEvaluation[]>([]);
    const [appSettings, setAppSettings] = useState<AppSetting[]>([]);
    const [masterKelas, setMasterKelas] = useState<MasterKelas[]>([]);
    const [masterMarhalahs, setMasterMarhalahs] = useState<MasterMarhalah[]>([]);
    const [masterKelasRelasi, setMasterKelasRelasi] = useState<MasterKelasRelasi[]>([]);
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
            const allPeriods: EvaluationPeriod[] = ((periodsData as any[]) || []).map((p) => ({ ...p, academic_year_id: p.academic_year_id === null ? null : Number(p.academic_year_id) }));
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
            const formsList: PeriodForm[] = ((formsData as any[]) || []).map((f) => ({ ...f, halaqah_id: Number(f.halaqah_id), activity_answers: f.activity_answers || {} }));
            setEvaluationPeriods(allPeriods);
            setPeriodFormFields(fieldsList);
            setPeriodRecaps(recapsList);
            setPeriodForms(formsList);

            // Fetch active semester dates from canonical V2 `semesters` table first, fallback to `app_settings`
            const currSemName = selectedAcademicYear.active_semester || 'Ganjil';
            const v2ActiveSem = ((semestersData as any[]) || []).find(
                (sem) => sem.name === currSemName || sem.is_active === true
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
                targetsList = targetsData.map((t) => ({
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
                            parsed.forEach((item, idx: number) => {
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
                mkData = masterKelasRelasiData.map((k, idx: number) => {
                    const mObj = (masterMarhalahData || []).find((m) => m.id === k.marhalah_id);
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
            setPeriodeUjianBulanan(((periodeUjianData as any[]) || []).map((p) => ({ ...p, academic_year_id: Number(p.academic_year_id), ke: Number(p.ke) })));
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
  return { selectedAcademicYear, ayLoading, santri, setSantri, allSantri, setAllSantri, musammi, setMusammi, waliKelas, setWaliKelas, musyrifs, setMusyrifs, halaqah, setHalaqah, attendance, setAttendance, studentProgress, setStudentProgress, classTargets, setClassTargets, studentEvaluations, setStudentEvaluations, evaluationSettings, setEvaluationSettings, halaqahEvalQuestions, setHalaqahEvalQuestions, halaqahEvaluations, setHalaqahEvaluations, appSettings, setAppSettings, masterKelas, setMasterKelas, masterMarhalahs, setMasterMarhalahs, masterKelasRelasi, setMasterKelasRelasi, userProfile, setUserProfile, orgName, setOrgName, orgLogo, setOrgLogo, examAttempts, setExamAttempts, periodeUjianBulanan, setPeriodeUjianBulanan, rubrikAktif, setRubrikAktif, pengaturanRaport, setPengaturanRaport, pengujiUjian, setPengujiUjian, catatanRaport, setCatatanRaport, setoranHarian, setSetoranHarian, recitationKinds, setRecitationKinds, attendanceStatuses, setAttendanceStatuses, sessionSlots, setSessionSlots, halaqahTypes, setHalaqahTypes, fluencyRules, setFluencyRules, evaluationPeriods, setEvaluationPeriods, periodFormFields, setPeriodFormFields, periodRecaps, setPeriodRecaps, periodForms, setPeriodForms, activeSemesterDates, setActiveSemesterDates, studentEnrollments, setStudentEnrollments, halaqahMemberships, setHalaqahMemberships, musammiAssignments, setMusammiAssignments, queryErrors, setQueryErrors, loading, setLoading, lingkupRef, sedangMuatRef, segarkanRef, konteksAbsensiRef, riwayatTermuat, setRiwayatTermuat, memuatRiwayat, setMemuatRiwayat, error, setError, orgIdRef, orgIdPromiseRef, updateOrganization, getOrgId, fetchData };
}
