import React, { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Santri, Musammi, Halaqah, AttendanceRecord, HalaqahType, Waktu, StudentProgress, ProgressType, WaliKelas, ClassTarget, StudentEvaluation, EvaluationSetting, AppSetting, MasterKelas } from '../types';
import { Marhalah, Peran, AttendanceStatus } from '../types';
import { useAcademicYear } from '../lib/AcademicYearContext';

import { SupportSessionStore, resolveTenantContext } from '../lib/permissions';
import { NotificationStore } from '../lib/NotificationStore';

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
    const [ujianBulanan, setUjianBulanan] = useState<any[]>([]);
    const [ujianSemester, setUjianSemester] = useState<any[]>([]);
    const [setoranHarian, setSetoranHarian] = useState<any[]>([]);
    
    const [activeSemesterDates, setActiveSemesterDates] = useState<{ startDate: string | null; endDate: string | null }>({ startDate: null, endDate: null });
    const [studentEnrollments, setStudentEnrollments] = useState<any[]>([]);
    const [halaqahMemberships, setHalaqahMemberships] = useState<any[]>([]);
    const [musammiAssignments, setMusammiAssignments] = useState<any[]>([]);
    const [queryErrors, setQueryErrors] = useState<{ table: string; code?: string; message: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Store Org ID to avoid repeated fetching
    const orgIdRef = useRef<string | null>(null);
    const orgIdPromiseRef = useRef<Promise<string> | null>(null);

    // Helper: Get Current User's Organization ID
    const updateOrganization = async (name: string, logoUrl: string) => {
        const orgId = await getOrgId();
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

            // Batch 1: Core reference & V2 Canonical Academic Structure (scoped by organization_id)
            const [
                { data: santriData, error: santriErr },
                { data: studentEnrollmentsData },
                { data: studentClassesData },
                { data: musammiData },
                { data: waliKelasData },
                { data: musyrifsData },
                { data: halaqahData, error: halaqahErr },
                { data: halaqahMembershipsData },
                { data: halaqahSantriData },
                { data: musammiAssignmentsData },
                { data: semestersData },
                { data: masterMarhalahData },
                { data: masterKelasRelasiData },
                { data: masterKelasData }
            ] = await Promise.all([
                executeTableQuery('santri', (supabase as any).from('santri').select('*').eq('organization_id', orgId).limit(5000).order('nama', { ascending: true }), []),
                executeTableQuery('student_enrollments', (supabase as any).from('student_enrollments').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(5000), []),
                executeTableQuery('student_classes', (supabase as any).from('student_classes').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(5000), [], { optionalTransitionTable: true }),
                executeTableQuery('musammi', (supabase as any).from('musammi').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('nama', { ascending: true }), []),
                executeTableQuery('wali_kelas', (supabase as any).from('wali_kelas').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('kelas', { ascending: true }), [], { optionalTransitionTable: true }),
                executeTableQuery('musyrifs', (supabase as any).from('musyrifs').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('nama', { ascending: true }), [], { optionalTransitionTable: true }),
                executeTableQuery('halaqah', (supabase as any).from('halaqah').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('id', { ascending: true }), []),
                executeTableQuery('halaqah_student_memberships', (supabase as any).from('halaqah_student_memberships').select('*').eq('organization_id', orgId).limit(10000), []),
                executeTableQuery('halaqah_santri', (supabase as any).from('halaqah_santri').select('*').eq('organization_id', orgId).limit(10000), [], { optionalTransitionTable: true }),
                executeTableQuery('halaqah_musammi_assignments', (supabase as any).from('halaqah_musammi_assignments').select('*').eq('organization_id', orgId).limit(5000), []),
                executeTableQuery('semesters', (supabase as any).from('semesters').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(20), []),
                executeTableQuery('master_marhalah', (supabase as any).from('master_marhalah').select('*').eq('organization_id', orgId).limit(500), []),
                executeTableQuery('master_kelas_relasi', (supabase as any).from('master_kelas_relasi').select('*').eq('organization_id', orgId).limit(500), []),
                executeTableQuery('master_kelas', (supabase as any).from('master_kelas').select('*').eq('organization_id', orgId).limit(500).order('marhalah', { ascending: true }).order('nama_kelas', { ascending: true }), [], { optionalTransitionTable: true })
            ]);

            if (santriErr && halaqahErr) {
                throw new Error(`Gagal memuat data akademik utama (${santriErr.message || halaqahErr.message})`);
            }

            // Batch 2: Configuration & Targets
            const [
                { data: targetsData },
                { data: settingsData },
                { data: appSettingsData },
                { data: halaqahEvalQData }
            ] = await Promise.all([
                executeTableQuery('class_targets', (supabase as any).from('class_targets').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000), []),
                executeTableQuery('evaluation_settings', (supabase as any).from('evaluation_settings').select('*').eq('organization_id', orgId).limit(1000).order('score', { ascending: false }), []),
                executeTableQuery('app_settings', (supabase as any).from('app_settings').select('*').eq('organization_id', orgId).limit(500), []),
                executeTableQuery('halaqah_evaluation_questions', (supabase as any).from('halaqah_evaluation_questions').select('*').eq('organization_id', orgId).limit(500).order('id', { ascending: true }), [])
            ]);

            // Batch 3: Progress, Evaluations & Exams
            const [
                { data: progressData },
                { data: evaluationData },
                { data: halaqahEvalData },
                { data: ujianBulananData },
                { data: ujianSemesterData }
            ] = await Promise.all([
                executeTableQuery('student_progress', (supabase as any).from('student_progress').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), []),
                executeTableQuery('student_evaluation', (supabase as any).from('student_evaluation').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), []),
                executeTableQuery('halaqah_evaluations', (supabase as any).from('halaqah_evaluations').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), []),
                executeTableQuery('ujian_bulanan', (supabase as any).from('ujian_bulanan').select('*').eq('organization_id', orgId).limit(10000), []),
                executeTableQuery('ujian_semester', (supabase as any).from('ujian_semester').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), [])
            ]);

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

            // Batch 4: Daily Logs & Attendance
            let attendanceQuery = (supabase as any)
                .from('attendance')
                .select('*')
                .eq('organization_id', orgId);

            if (activeSemStartDate && activeSemEndDate) {
                attendanceQuery = attendanceQuery.gte('date', activeSemStartDate).lte('date', activeSemEndDate);
            } else {
                attendanceQuery = attendanceQuery.eq('academic_year_id', selectedAcademicYear.id);
            }

            const [
                { data: rawAttendanceData },
                { data: setoranHarianData }
            ] = await Promise.all([
                executeTableQuery('attendance', attendanceQuery.limit(50000), []),
                executeTableQuery('setoran_harian', (supabase as any).from('setoran_harian').select('*').eq('organization_id', orgId).limit(50000), [])
            ]);

            setQueryErrors(collectedErrors);
            setStudentEnrollments(studentEnrollmentsData || []);
            setHalaqahMemberships(halaqahMembershipsData || []);
            setMusammiAssignments(musammiAssignmentsData || []);

            const attendanceData = (rawAttendanceData || []).filter((a: any) => {
                if (activeSemStartDate && activeSemEndDate) {
                    return a.date >= activeSemStartDate && a.date <= activeSemEndDate;
                }
                return a.academic_year_id === selectedAcademicYear.id;
            });

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
            const legacyClassesList = (studentClassesData as any[]) || [];

            const allSantriMapped: Santri[] = (santriData || []).map(s => {
                const v2Enr = v2EnrollmentsList.find(
                    e => Number(e.student_id || e.santri_id) === Number(s.id)
                );
                const legacyCls = legacyClassesList.find(
                    c => Number(c.santri_id) === Number(s.id)
                );

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
            setStudentEvaluations((evaluationData as unknown as StudentEvaluation[]) || []);
            setEvaluationSettings((settingsData as unknown as EvaluationSetting[]) || []);
            setHalaqahEvalQuestions((halaqahEvalQData as unknown as any[]) || []);
            setHalaqahEvaluations((halaqahEvalData as unknown as any[]) || []);
            setAppSettings((appSettingsData as unknown as any[]) || []);
            setUjianBulanan(ujianBulananData || []);
            setUjianSemester(ujianSemesterData || []);
            setSetoranHarian(setoranHarianData || []);
            setMasterKelas(mkData);
            setMasterMarhalahs(masterMarhalahData || []);
            setMasterKelasRelasi(masterKelasRelasiData || []);

            // Map santri & musammi assignments to their halaqah using Canonical V2 `halaqah_student_memberships` & `halaqah_musammi_assignments`
            const v2MembershipsList = (halaqahMembershipsData as any[]) || [];
            const legacyMembershipsList = (halaqahSantriData as any[]) || [];
            const v2AssignmentsList = (musammiAssignmentsData as any[]) || [];

            const halaqahWithSantri: Halaqah[] = (halaqahData || []).map((h): Halaqah | null => {
                // 1. Canonical V2 Memberships merged with Legacy `halaqah_santri`
                const v2ForGroup = v2MembershipsList.filter(m => Number(m.halaqah_id) === Number(h.id));
                const legacyForGroup = legacyMembershipsList.filter(hs => Number(hs.halaqah_id) === Number(h.id));

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

                legacyForGroup.forEach(hs => {
                    const sid = Number(hs.santri_id);
                    const isCurrentlyActive = (!hs.end_date || String(hs.end_date).trim() === '') && (hs.status || 'Aktif') === 'Aktif';
                    if (isCurrentlyActive && v2ForGroup.length === 0) {
                        activeSantriIdsSet.add(sid);
                    }
                    const key = `${sid}_${hs.start_date || ''}`;
                    if (!seenStudentStartKeys.has(key) && !v2ForGroup.some(m => Number(m.student_id) === sid)) {
                        historyRecords.push({
                            halaqah_id: h.id,
                            santri_id: sid,
                            santri: allSantriMapped.find(s => Number(s.id) === sid),
                            start_date: hs.start_date || '',
                            end_date: hs.end_date || null,
                            status: hs.status || (isCurrentlyActive ? 'Aktif' : 'Berhenti')
                        });
                    }
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
                    created_at: h.created_at,
                    updated_at: h.updated_at,
                };
            }).filter((h): h is Halaqah => h !== null);
            
            setHalaqah(halaqahWithSantri);
            
            const attendanceWithNames: AttendanceRecord[] = (attendanceData || [])
                .map((a): AttendanceRecord | null => {
                    let person: any = null;
                    if (a.peran === 'Santri' || a.peran === Peran.Santri) {
                        person = activeSantriListForApp.find(p => p.id === a.person_id)
                            || santriList.find(p => p.id === a.person_id)
                            || allSantriMapped.find((p: any) => p.id === a.person_id);
                    } else {
                        person = musammiList.find(p => p.id === a.person_id)
                            || (musammiData || []).find((p: any) => p.id === a.person_id);
                    }
                    
                    const nama = person?.nama || (a.peran === 'Santri' ? `Santri (${a.person_id})` : `Musammi (${a.person_id})`);
                    const marhalah = person?.marhalah || '-';
                    const kelas = person?.kelas || '-';

                    return {
                        id: a.id,
                        date: a.date,
                        waktu: a.waktu as Waktu,
                        personId: a.person_id,
                        nama,
                        marhalah: marhalah as any,
                        kelas,
                        peran: a.peran as Peran,
                        status: a.status as AttendanceStatus,
                        halaqahId: a.halaqah_id,
                    };
                })
                .filter((a): a is AttendanceRecord => a !== null);
            setAttendance(attendanceWithNames);

            const progressList: StudentProgress[] = (progressData || []).map(p => ({
                id: p.id,
                santri_id: p.santri_id,
                month_key: p.month_key,
                progress_type: p.progress_type as ProgressType,
                value: p.value
            }));
            setStudentProgress(progressList);

        } catch (err: any) {
            setError(err.message || String(err));
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    }, [selectedAcademicYear, getOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
    
    const addAttendanceRecords = async (records: Omit<AttendanceRecord, 'id' | 'nama' | 'marhalah' | 'kelas'>[]) => {
        if (!records || records.length === 0) return;
        const orgId = await getOrgId();
        
        const dates = Array.from(new Set(records.map(r => r.date).filter(Boolean)));
        const waktus = Array.from(new Set(records.map(r => r.waktu).filter(Boolean)));
        const roles = Array.from(new Set(records.map(r => r.peran).filter(Boolean)));
        const personIds = Array.from(new Set(records.map(r => r.personId).filter(Boolean)));
        const targetHalaqahIds = Array.from(new Set(records.map(r => r.halaqahId).filter(Boolean)));

        // If records only contains Musammi, we clear prior Musammi records for the targeted halaqahs
        // so that changing Musammi does not leave orphaned prior-musammi records,
        // while STRICTLY GUARANTEEING that Santri records are never touched.
        const isOnlyMusammi = roles.length === 1 && roles[0] === 'Musammi';

        // Delete existing records ONLY for the targeted criteria to avoid duplicates without wiping other people
        let deleteQuery = (supabase as any)
            .from('attendance')
            .delete()
            .eq('organization_id', orgId);

        if (dates.length === 1) {
            deleteQuery = deleteQuery.eq('date', dates[0]);
        } else if (dates.length > 1) {
            deleteQuery = deleteQuery.in('date', dates);
        }

        if (waktus.length === 1) {
            deleteQuery = deleteQuery.eq('waktu', waktus[0]);
        } else if (waktus.length > 1) {
            deleteQuery = deleteQuery.in('waktu', waktus);
        }

        if (targetHalaqahIds.length > 0) {
            deleteQuery = deleteQuery.in('halaqah_id', targetHalaqahIds);
        }

        // CRITICAL: Always restrict deletion by the specific roles being inserted
        if (roles.length > 0) {
            deleteQuery = deleteQuery.in('peran', roles);
        }

        // When inserting records for Santri (or mixed), strictly limit deletion to the person_ids being updated
        // so that inserting attendance for one person NEVER wipes other people's attendance in the same halaqah
        if (!isOnlyMusammi || targetHalaqahIds.length === 0) {
            if (personIds.length > 0) {
                deleteQuery = deleteQuery.in('person_id', personIds);
            }
        }

        const { error: delError } = await deleteQuery;
        if (delError) {
            console.warn("Delete prior attendance warning:", delError);
        }

        const recordsToInsert = records.map(r => ({
            organization_id: orgId, 
            academic_year_id: selectedAcademicYear?.id, 
            date: r.date, 
            waktu: r.waktu, 
            person_id: r.personId, 
            peran: r.peran, 
            status: r.status, 
            halaqah_id: r.halaqahId,
        }));
        const { error } = await supabase.from('attendance').insert(recordsToInsert);
        if (error) throw error;

        // Sinkronisasi V2: halaqah_sessions & attendance_records dengan idempotency_key
        try {
            const santriRecords = records.filter(r => r.peran === 'Santri' && r.halaqahId && r.date && r.waktu);
            const sessionKeys = Array.from(new Set(santriRecords.map(r => `${r.halaqahId}|${r.date}|${r.waktu}`)));
            for (const sKey of sessionKeys) {
                const [halIdStr, sDate, sSlot] = sKey.split('|');
                const halId = Number(halIdStr);
                const groupRows = santriRecords.filter(r => r.halaqahId === halId && r.date === sDate && r.waktu === sSlot);
                const idempotencyKey = `att_${orgId}_${halId}_${sDate}_${sSlot}`;

                const { data: existingSession } = await (supabase as any)
                    .from('halaqah_sessions')
                    .select('id, status')
                    .eq('organization_id', orgId)
                    .eq('halaqah_id', halId)
                    .eq('session_date', sDate)
                    .eq('session_slot', sSlot)
                    .maybeSingle();

                let sessionRowId = existingSession?.id;

                if (!existingSession) {
                    const { data: insertedSession } = await (supabase as any)
                        .from('halaqah_sessions')
                        .insert({
                            organization_id: orgId,
                            academic_year_id: selectedAcademicYear?.id || null,
                            halaqah_id: halId,
                            session_date: sDate,
                            session_slot: sSlot,
                            status: 'submitted',
                            updated_at: new Date().toISOString()
                        })
                        .select('id')
                        .maybeSingle();
                    sessionRowId = insertedSession?.id;
                } else if (existingSession.status !== 'locked') {
                    await (supabase as any)
                        .from('halaqah_sessions')
                        .update({
                            status: 'submitted',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingSession.id);
                }

                if (sessionRowId) {
                    const v2AttRows = groupRows.map(r => ({
                        organization_id: orgId,
                        session_id: sessionRowId,
                        halaqah_id: halId,
                        santri_id: r.personId,
                        attendance_date: sDate,
                        session_slot: sSlot,
                        status: (r.status || 'hadir').toLowerCase(),
                        idempotency_key: `${idempotencyKey}_${r.personId}`,
                        marked_by: userProfile?.id || null,
                        updated_at: new Date().toISOString()
                    }));
                    const { error: v2AttErr } = await (supabase as any).from('attendance_records').upsert(v2AttRows, {
                        onConflict: 'session_id,santri_id'
                    });
                    if (v2AttErr && v2AttErr.code !== '42P01') {
                        console.warn('V2 attendance_records sync warning:', v2AttErr.message);
                    }
                }
            }
        } catch (v2SyncErr) {
            console.warn('V2 attendance sync skipped:', v2SyncErr);
        }

        await fetchData();
    };

    const updateAttendanceRecord = useCallback(async (id: number, updates: { status?: AttendanceStatus, date?: string, waktu?: Waktu }) => {
        const orgId = await getOrgId();
        const { error } = await supabase.from('attendance').update(updates as any).eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteAttendanceRecord = useCallback(async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await supabase.from('attendance').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);
    
    const deleteAttendanceBatch = useCallback(async (date: string, waktu: string, options?: { peran?: string; halaqahId?: number; ids?: number[] }) => {
        const orgId = await getOrgId();

        if (options?.ids && options.ids.length > 0) {
            const chunkSize = 200;
            for (let i = 0; i < options.ids.length; i += chunkSize) {
                const chunk = options.ids.slice(i, i + chunkSize);
                const { error } = await (supabase as any)
                    .from('attendance')
                    .delete()
                    .eq('organization_id', orgId)
                    .in('id', chunk);
                if (error) throw error;
            }
            await fetchData();
            return;
        }

        let q = (supabase as any)
            .from('attendance')
            .delete()
            .eq('organization_id', orgId)
            .eq('date', date)
            .eq('waktu', waktu as Waktu);

        if (options?.peran && options.peran !== 'all') {
            q = q.eq('peran', options.peran);
        }
        if (options?.halaqahId) {
            q = q.eq('halaqah_id', options.halaqahId);
        }

        const { error } = await q;
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const addSetoranHarianRecord = useCallback(async (record: Partial<any>) => {
        const orgId = await getOrgId();
        const { data: insertedRows, error } = await (supabase as any)
            .from('setoran_harian')
            .insert([{ ...record, organization_id: orgId }])
            .select();
        if (error) throw error;

        // Sinkronisasi otomatis ke Catatan Setoran V2 (recitation_entries)
        try {
            const inserted = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;
            if (inserted && orgId) {
                const rawKind = String(record.jenis_setoran || record.skema || 'ziyadah').toLowerCase();
                const normalizedKind =
                    rawKind.includes('sabqi')
                        ? 'sabqi'
                        : rawKind.includes('manzil') || rawKind.includes('murojaah') || rawKind.includes('murajaah')
                        ? 'manzil'
                        : 'ziyadah';
                const { error: v2RecErr } = await (supabase as any).from('recitation_entries').upsert(
                    {
                        organization_id: orgId,
                        academic_year_id: selectedAcademicYear?.id || null,
                        halaqah_id: record.halaqah_id || null,
                        santri_id: record.santri_id,
                        recitation_date: record.tanggal,
                        session_slot: record.waktu || 'Shubuh',
                        kind: normalizedKind,
                        surah_start_no: Number(record.surah_start_no) || 1,
                        ayah_start: Number(record.ayat_mulai) || 1,
                        surah_end_no: Number(record.surah_end_no) || 1,
                        ayah_end: Number(record.ayat_akhir || record.ayat_selesai) || 1,
                        calculated_pages: Number(record.jumlah_halaman) || 0,
                        minor_mistakes: Number(record.kesalahan_shoghir) || 0,
                        major_mistakes: Number(record.kesalahan_kabir) || 0,
                        predicate: record.nilai || null,
                        notes: record.catatan || record.keterangan || null,
                        status: 'submitted',
                        legacy_setoran_id: inserted.id,
                    },
                    { onConflict: 'legacy_setoran_id' }
                );
                if (v2RecErr && v2RecErr.code !== '42P01') {
                    console.warn('V2 recitation_entries sync warning:', v2RecErr.message);
                }
            }
        } catch (v2RecSyncErr) {
            console.warn('V2 recitation sync skipped:', v2RecSyncErr);
        }

        await fetchData();
    }, [fetchData, getOrgId, selectedAcademicYear]);

    const updateSetoranHarianRecord = useCallback(async (id: number, updates: Partial<any>) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('setoran_harian').update(updates).eq('organization_id', orgId).eq('id', id);
        if (error) throw error;

        // Sinkronkan perubahan ke recitation_entries (trg_audit_recitation_entry_mutation otomatis mencatat ke recitation_revisions)
        try {
            const { data: existingV2 } = await (supabase as any)
                .from('recitation_entries')
                .select('*')
                .eq('organization_id', orgId)
                .eq('legacy_setoran_id', id)
                .maybeSingle();

            if (existingV2) {
                const rawKind = String(updates.jenis_setoran || updates.skema || existingV2.kind || 'ziyadah').toLowerCase();
                const normalizedKind =
                    rawKind.includes('sabqi')
                        ? 'sabqi'
                        : rawKind.includes('manzil') || rawKind.includes('murojaah') || rawKind.includes('murajaah')
                        ? 'manzil'
                        : 'ziyadah';

                const v2Updates: any = {
                    kind: normalizedKind,
                    ayah_start: Number(updates.ayat_mulai || updates.ayat) || existingV2.ayah_start || 1,
                    ayah_end: Number(updates.ayat_selesai || updates.ayat_akhir) || existingV2.ayah_end || 1,
                    calculated_pages: updates.jumlah_halaman !== undefined ? Number(updates.jumlah_halaman) || 0 : existingV2.calculated_pages,
                    minor_mistakes: updates.kesalahan_shoghir !== undefined ? Number(updates.kesalahan_shoghir) || 0 : existingV2.minor_mistakes,
                    major_mistakes: updates.kesalahan_kabir !== undefined ? Number(updates.kesalahan_kabir) || 0 : existingV2.major_mistakes,
                    predicate: updates.nilai !== undefined ? updates.nilai : existingV2.predicate,
                    notes: updates.keterangan !== undefined ? updates.keterangan : existingV2.notes,
                    status: existingV2.status === 'returned' ? 'submitted' : existingV2.status,
                    revision_no: existingV2.status === 'returned' ? (existingV2.revision_no || 1) + 1 : existingV2.revision_no,
                    updated_at: new Date().toISOString(),
                };

                const { error: v2Err } = await (supabase as any)
                    .from('recitation_entries')
                    .update(v2Updates)
                    .eq('id', existingV2.id)
                    .eq('organization_id', orgId);

                if (v2Err && v2Err.code !== '42P01') {
                    console.warn('V2 recitation_entries update warning:', v2Err.message);
                }
            }
        } catch (v2UpdateErr) {
            console.warn('V2 recitation update skipped:', v2UpdateErr);
        }

        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteSetoranHarianRecord = useCallback(async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('setoran_harian').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;

        try {
            await (supabase as any)
                .from('recitation_entries')
                .update({ status: 'voided', updated_at: new Date().toISOString() })
                .eq('organization_id', orgId)
                .eq('legacy_setoran_id', id);
        } catch {
            // Fallback aman
        }

        await fetchData();
    }, [fetchData, getOrgId]);

    // Student Progress Mutations
    const addStudentProgressBatch = useCallback(async (progressRecords: Omit<StudentProgress, 'id'>[], skipFetch = false) => {
        const orgId = await getOrgId();
        const recordsWithOrg = progressRecords.map(p => {
            const { id, created_at, ...rest } = p as any;
            return { ...rest, organization_id: orgId, academic_year_id: selectedAcademicYear?.id };
        });
        const { error } = await supabase.from('student_progress').upsert(recordsWithOrg, { onConflict: 'santri_id, academic_year_id, month_key, progress_type' });
        if (error) throw error;
        if (!skipFetch) {
            await fetchData();
        }
    }, [fetchData, selectedAcademicYear, getOrgId]);

    const deleteStudentProgress = useCallback(async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await supabase.from('student_progress').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteStudentProgressByMonth = useCallback(async (month: string, type: ProgressType) => {
        const orgId = await getOrgId();
        let query = supabase.from('student_progress').delete().eq('organization_id', orgId).eq('month_key', month).eq('progress_type', type);
        if (selectedAcademicYear?.id) {
            query = query.eq('academic_year_id', selectedAcademicYear.id);
        }
        const { error } = await query;
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId, selectedAcademicYear]);

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

    // --- EVALUATION MUTATIONS ---
    const updateEvaluation = useCallback(async (evalData: Partial<StudentEvaluation> & { santri_id: number, month_key: string }) => {
        const orgId = await getOrgId();
        const { id, created_at, ...rest } = evalData as any;
        const { error } = await supabase.from('student_evaluation').upsert(
            { ...rest, organization_id: orgId, academic_year_id: selectedAcademicYear?.id },
            { onConflict: 'santri_id, academic_year_id, month_key' }
        );
        if (error) throw error;
        // Don't refetch all, update local state optimistically or silently
        await fetchData();
    }, [fetchData, selectedAcademicYear]);

    const updateEvaluationBatch = useCallback(async (evalDataArray: (Partial<StudentEvaluation> & { santri_id: number, month_key: string })[], skipFetch = false) => {
        const orgId = await getOrgId();
        const recordsWithOrg = evalDataArray.map(e => {
            const { id, created_at, ...rest } = e as any;
            
    

    return { ...rest, organization_id: orgId, academic_year_id: selectedAcademicYear?.id };
        });
        const { error } = await supabase.from('student_evaluation').upsert(
            recordsWithOrg,
            { onConflict: 'santri_id, academic_year_id, month_key' }
        );
        if (error) throw error;
        if (!skipFetch) {
            await fetchData();
        }
    }, [fetchData, selectedAcademicYear]);

    const deleteEvaluationPeriod = useCallback(async (month: string, marhalah?: string) => {
        const orgId = await getOrgId();
        const { error: e1 } = await supabase.from('student_progress').delete().eq('organization_id', orgId).eq('month_key', month);
        if (e1) console.error("Error deleting progress:", e1);
        const { error: e2 } = await supabase.from('student_evaluation').delete().eq('organization_id', orgId).eq('month_key', month);
        if (e2) console.error("Error deleting evaluation:", e2);
        const { error: e3 } = await (supabase as any).from('halaqah_evaluations').delete().eq('organization_id', orgId).eq('month_key', month);
        if (e3) console.error("Error deleting halaqah evaluation:", e3);

        let key = 'EVALUATION_PERIODS';

        const periodSettings = appSettings.find(s => s.key === key)?.value;
        if (periodSettings) {
            let updatedValue = '';
            if (periodSettings.startsWith('[')) {
                try {
                    const parsed = JSON.parse(periodSettings);
                    const updated = parsed.filter((p: any) => p.id !== month);
                    updatedValue = JSON.stringify(updated);
                } catch(e) {}
            } else {
                const periodsList = periodSettings.split(',').filter(p => p.trim() !== '');
                const updatedPeriods = periodsList.filter(p => p !== month);
                updatedValue = updatedPeriods.join(',');
            }
            if (updatedValue) {
                const { error: e4 } = await (supabase as any).from('app_settings').upsert({
                    organization_id: orgId,
                    key: key,
                    value: updatedValue
                }, { onConflict: 'organization_id,key' });
                if (e4) console.error("Error updating settings:", e4);
            }
        }
        await fetchData();
    }, [fetchData, appSettings]);

    const saveEvaluationSetting = useCallback(async (setting: Omit<EvaluationSetting, 'id'> & { id?: number }) => {
        const orgId = await getOrgId();
        if (setting.id) {
            const { error } = await supabase.from('evaluation_settings').update({
                label: setting.label,
                score: setting.score
            }).eq('organization_id', orgId).eq('id', setting.id);
            if (error) throw error;
        } else {
            const { color, ...settingWithoutColor } = setting;
            const { error } = await supabase.from('evaluation_settings').insert({ ...settingWithoutColor, organization_id: orgId });
            if (error) throw error;
        }
        await fetchData();
    }, [fetchData, getOrgId]);

        const updateEvaluationSettingsBatch = useCallback(async (toDelete: number[], toUpdate: any[], toInsert: any[]) => {
        const orgId = await getOrgId();
        if (toDelete.length > 0) {
            await supabase.from('evaluation_settings').delete().eq('organization_id', orgId).in('id', toDelete);
        }
        await Promise.all(toUpdate.map(async (setting) => {
            const { error } = await supabase.from('evaluation_settings').update({
                label: setting.label,
                score: setting.score
            }).eq('organization_id', orgId).eq('id', setting.id);
            if (error) throw error;
        }));
        if (toInsert.length > 0) {
            const inserts = toInsert.map(s => {
                const { color, ...rest } = s;
                return { ...rest, organization_id: orgId };
            });
            const { error } = await supabase.from('evaluation_settings').insert(inserts);
            if (error) throw error;
        }
        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteEvaluationSetting = useCallback(async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await supabase.from('evaluation_settings').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteEvaluationCategory = useCallback(async (category: string) => {
        const orgId = await getOrgId();
        const { error } = await supabase.from('evaluation_settings').delete().eq('organization_id', orgId).eq('category', category);
        if (error) throw error;
        await fetchData();
    }, [fetchData, getOrgId]);

    const updateEvaluationCategory = useCallback(async (oldCategory: string, newCategory: string) => {
        const orgId = await getOrgId();
        const { error: error1 } = await supabase.from('evaluation_settings').update({ category: newCategory }).eq('organization_id', orgId).eq('category', oldCategory);
        if (error1) throw error1;
        const { error: error2 } = await supabase.from('student_progress').update({ progress_type: newCategory }).eq('organization_id', orgId).eq('progress_type', oldCategory);
        if (error2) throw error2;
        await fetchData();
    }, [fetchData, getOrgId]);

    const saveHalaqahEvalQuestion = async (q: Partial<any>) => {
        const orgId = await getOrgId();
        if (q.id) {
            const { error } = await (supabase as any).from('halaqah_evaluation_questions').update(q).eq('organization_id', orgId).eq('id', q.id);
            if (error) throw error;
        } else {
            const { error } = await (supabase as any).from('halaqah_evaluation_questions').insert({ ...q, organization_id: orgId });
            if (error) throw error;
        }
        await fetchData();
    };

    const deleteHalaqahEvalQuestion = async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('halaqah_evaluation_questions').delete().eq('organization_id', orgId).eq('id', id);
        if (error) throw error;
        await fetchData();
    };

    const saveHalaqahEvaluation = async (evalData: Partial<any>, skipFetch = false) => {
        const orgId = await getOrgId();
        const { id, created_at, ...rest } = evalData as any;
        const { error } = await (supabase as any).from('halaqah_evaluations').upsert({
            ...rest,
            organization_id: orgId,
            academic_year_id: selectedAcademicYear?.id
        }, { onConflict: 'halaqah_id,month_key' });
        if (error) throw error;
        if (!skipFetch) {
            await fetchData();
        }
    };

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

    const saveUjianBulanan = async (data: any[]) => {
        const orgId = await getOrgId();
        const semester = selectedAcademicYear?.active_semester || 'Ganjil';
        if (!data || data.length === 0) return;

        // Query existing ujian_bulanan records for this org to differentiate insert vs update
        const santriIds = data.map(d => d.santri_id).filter(Boolean);
        const periodes = Array.from(new Set(data.map(d => d.periode).filter(Boolean)));

        let existingMap = new Map<string, any>();
        if (santriIds.length > 0 && periodes.length > 0) {
            const { data: existingRecords, error: fetchErr } = await (supabase as any)
                .from('ujian_bulanan')
                .select('id, santri_id, periode')
                .eq('organization_id', orgId)
                .in('santri_id', santriIds)
                .in('periode', periodes);

            if (!fetchErr && existingRecords) {
                existingRecords.forEach((row: any) => {
                    existingMap.set(`${row.santri_id}_${row.periode}`, row.id);
                });
            }
        }

        const toInsert: any[] = [];
        const toUpdate: any[] = [];

        for (const item of data) {
            const key = `${item.santri_id}_${item.periode}`;
            const existingId = item.id || existingMap.get(key);
            const payload: any = {
                organization_id: orgId,
                academic_year_id: item.academic_year_id || selectedAcademicYear?.id || null,
                santri_id: item.santri_id,
                periode: item.periode,
                materi_juz: item.materi_juz !== undefined ? item.materi_juz : '',
                nilai: item.nilai !== undefined ? item.nilai : null,
                semester: item.semester || semester,
                updated_at: new Date().toISOString()
            };

            if (existingId) {
                toUpdate.push({ id: existingId, ...payload });
            } else {
                toInsert.push(payload);
            }
        }

        if (toInsert.length > 0) {
            const { error: insertErr } = await (supabase as any).from('ujian_bulanan').insert(toInsert);
            if (insertErr) {
                console.error('Error inserting ujian_bulanan:', insertErr);
                throw insertErr;
            }
        }

        if (toUpdate.length > 0) {
            for (const item of toUpdate) {
                const { id, ...updateFields } = item;
                const { error: updateErr } = await (supabase as any)
                    .from('ujian_bulanan')
                    .update(updateFields)
                    .eq('organization_id', orgId)
                    .eq('id', id);
                if (updateErr) {
                    console.error(`Error updating ujian_bulanan ID ${id}:`, updateErr);
                    throw updateErr;
                }
            }
        }

        await fetchData();
    };

    const deleteUjianBulanan = async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('ujian_bulanan').delete().eq('organization_id', orgId).eq('id', id);
        if (error) {
            console.error('Error deleting ujian_bulanan:', error);
            throw error;
        }
        await fetchData();
    };

    const saveUjianSemester = async (data: any[]) => {
        const orgId = await getOrgId();
        if (!data || data.length === 0) return;

        const santriIds = data.map(d => d.santri_id).filter(Boolean);
        const academicYearIds = Array.from(new Set(data.map(d => d.academic_year_id).filter(Boolean)));
        const semesters = Array.from(new Set(data.map(d => d.semester).filter(Boolean)));

        let existingMap = new Map<string, any>();
        if (santriIds.length > 0 && academicYearIds.length > 0) {
            let query = (supabase as any)
                .from('ujian_semester')
                .select('id, santri_id, academic_year_id, semester')
                .eq('organization_id', orgId)
                .in('santri_id', santriIds)
                .in('academic_year_id', academicYearIds);
            
            if (semesters.length > 0) {
                query = query.in('semester', semesters);
            }

            const { data: existingRecords, error: fetchErr } = await query;
            if (!fetchErr && existingRecords) {
                existingRecords.forEach((row: any) => {
                    existingMap.set(`${row.santri_id}_${row.academic_year_id}_${row.semester}`, row.id);
                });
            }
        }

        const toInsert: any[] = [];
        const toUpdate: any[] = [];

        for (const item of data) {
            const key = `${item.santri_id}_${item.academic_year_id}_${item.semester}`;
            const existingId = item.id || existingMap.get(key);
            const payload: any = {
                organization_id: orgId,
                santri_id: item.santri_id,
                academic_year_id: item.academic_year_id,
                semester: item.semester,
                materi_juz: item.materi_juz !== undefined ? item.materi_juz : '',
                khoto_shogir: item.khoto_shogir || {},
                khoto_kabir: item.khoto_kabir || {},
                is_custom_nilai: item.is_custom_nilai || false,
                custom_nilai: item.custom_nilai !== undefined ? item.custom_nilai : null,
                nilai_akhir: item.nilai_akhir !== undefined ? item.nilai_akhir : null,
                catatan: item.catatan !== undefined ? item.catatan : '',
                updated_at: new Date().toISOString()
            };

            if (existingId) {
                toUpdate.push({ id: existingId, ...payload });
            } else {
                toInsert.push(payload);
            }
        }

        if (toInsert.length > 0) {
            const { error: insertErr } = await (supabase as any).from('ujian_semester').insert(toInsert);
            if (insertErr) {
                console.error('Error inserting ujian_semester:', insertErr);
                throw insertErr;
            }
        }

        if (toUpdate.length > 0) {
            for (const item of toUpdate) {
                const { id, ...updateFields } = item;
                const { error: updateErr } = await (supabase as any)
                    .from('ujian_semester')
                    .update(updateFields)
                    .eq('id', id);
                if (updateErr) {
                    console.error(`Error updating ujian_semester ID ${id}:`, updateErr);
                    throw updateErr;
                }
            }
        }

        // Catat riwayat percobaan ujian/remedial ke tabel V2 exam_attempts tanpa menimpa histori lama (Blueprint Fase 4)
        try {
            const attemptRows = data
                .filter((d) => d.santri_id && d.nilai_akhir !== null && d.nilai_akhir !== undefined)
                .map((d) => ({
                    organization_id: orgId,
                    santri_id: d.santri_id,
                    attempt_no: d.is_remedial ? 2 : 1,
                    is_remedial: Boolean(d.is_remedial),
                    raw_score: Number(d.nilai_akhir) || 0,
                    final_score: Number(d.nilai_akhir) || 0,
                    notes: d.catatan || `Materi Juz: ${d.materi_juz || '-'}`,
                }));
            if (attemptRows.length > 0) {
                await (supabase as any).from('exam_attempts').insert(attemptRows);
            }
        } catch {
            // Abaikan bila tabel exam_attempts belum dimigrasikan
        }

        await fetchData();
    };

    // Parse app settings for global references
    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m: any) => m.nama), [masterMarhalahs]);
    const [globalWaktuHalaqah, setGlobalWaktuHalaqah] = useState<string[]>(['Shubuh', 'Dhuha', 'Ashar', 'Maghrib', 'Isya']);
    const [globalJenisHalaqah, setGlobalJenisHalaqah] = useState<string[]>(['Halaqah Utama', 'Halaqah Pagi']);
    const [globalAttendanceStatus, setGlobalAttendanceStatus] = useState<string[]>(['Hadir', 'Izin', 'Sakit', 'Terlambat', 'Alpa']);
    const [globalPredikatNilai, setGlobalPredikatNilai] = useState<{label: string; minScore: number}[]>([
        { label: 'Mumtaz', minScore: 90 },
        { label: 'Jayyid Jiddan', minScore: 80 },
        { label: 'Jayyid', minScore: 70 },
        { label: 'Maqbul', minScore: 60 },
        { label: 'Rasib', minScore: 0 }
    ]);

    useEffect(() => {
        if (!loading && appSettings.length > 0) {
            const marhalahSetting = appSettings.find(s => s.key === 'GLOBAL_MARHALAHS')?.value;
            const waktuSetting = appSettings.find(s => s.key === 'GLOBAL_WAKTU_HALAQAH')?.value;
            const jenisSetting = appSettings.find(s => s.key === 'GLOBAL_JENIS_HALAQAH')?.value;
            const statusSetting = appSettings.find(s => s.key === 'GLOBAL_ATTENDANCE_STATUS')?.value;
            const predikatSetting = appSettings.find(s => s.key === 'GLOBAL_PREDIKAT_NILAI')?.value;
            
            
            if (waktuSetting) {
                try { setGlobalWaktuHalaqah(JSON.parse(waktuSetting)); } catch(e) {}
            }
            if (jenisSetting) {
                try { setGlobalJenisHalaqah(JSON.parse(jenisSetting)); } catch(e) {}
            }
            if (statusSetting) {
                try { setGlobalAttendanceStatus(JSON.parse(statusSetting)); } catch(e) {}
            }
            if (predikatSetting) {
                try { 
                    const parsed = JSON.parse(predikatSetting);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setGlobalPredikatNilai(parsed); 
                    }
                } catch(e) {}
            }
        }
    }, [appSettings, loading]);

    
    

    
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

    return {
        santri, allSantri, musammi, waliKelas, musyrifs, halaqah, attendance, studentProgress, classTargets, 
        studentEvaluations, evaluationSettings, halaqahEvalQuestions, halaqahEvaluations, appSettings,
        ujianBulanan, ujianSemester, masterKelas, masterMarhalahs, masterKelasRelasi,
        studentEnrollments, halaqahMemberships, musammiAssignments, queryErrors,
        userProfile, setoranHarian, orgName, orgLogo, updateOrganization,
        globalMarhalahs, globalWaktuHalaqah, globalJenisHalaqah, globalAttendanceStatus, globalPredikatNilai,
        loading: loading || ayLoading, error, fetchData, 
        addHalaqah, updateHalaqah, deleteHalaqah, deleteHalaqahBatch, restoreHalaqah, keluarkanSantri, mutasiSantri, 
        addSantriToHalaqah, assignHalaqahMusammi, addAttendanceRecords, updateAttendanceRecord, deleteAttendanceRecord, deleteAttendanceBatch,
        addSetoranHarianRecord, updateSetoranHarianRecord, deleteSetoranHarianRecord,
        addStudentProgressBatch, deleteStudentProgress, deleteStudentProgressByMonth, saveClassTarget, saveClassTargetBatch,
        updateEvaluation, updateEvaluationBatch, saveEvaluationSetting, updateEvaluationSettingsBatch, deleteEvaluationSetting, deleteEvaluationCategory, updateEvaluationCategory, deleteEvaluationPeriod,
        saveHalaqahEvalQuestion, deleteHalaqahEvalQuestion, saveHalaqahEvaluation, saveAppSetting,
        saveMultipleAppSettings,
        saveUjianBulanan, deleteUjianBulanan, saveUjianSemester,
        addMasterKelas, deleteMasterKelas,
        addMasterMarhalah, updateMasterMarhalah, deleteMasterMarhalah,
        addMasterKelasRelasi, updateMasterKelasRelasi, deleteMasterKelasRelasi,
        getOrgId,
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
