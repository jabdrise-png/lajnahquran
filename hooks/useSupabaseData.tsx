import React, { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Santri, Musammi, Halaqah, AttendanceRecord, HalaqahType, Waktu, StudentProgress, ProgressType, WaliKelas, ClassTarget, StudentEvaluation, EvaluationSetting, AppSetting, MasterKelas } from '../types';
import { Marhalah, Peran, AttendanceStatus } from '../types';
import { useAcademicYear } from '../lib/AcademicYearContext';

import { SupportSessionStore } from '../lib/permissions';
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
        const activeSupport = SupportSessionStore.getSession();
        if (activeSupport?.organizationId) {
            orgIdRef.current = activeSupport.organizationId;
            if (activeSupport.organizationName) {
                setOrgName(activeSupport.organizationName);
            }
            return activeSupport.organizationId;
        }

        if (orgIdRef.current) return orgIdRef.current;
        if (orgIdPromiseRef.current) return orgIdPromiseRef.current;

        orgIdPromiseRef.current = (async () => {
            try {
                let user: any = null;
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session?.user) {
                    user = sessionData.session.user;
                } else {
                    try {
                        const { data: userData, error: authError } = await supabase.auth.getUser();
                        if (authError && authError.message.includes('Refresh Token')) {
                             await supabase.auth.signOut().catch(() => {});
                        } else {
                            user = userData?.user;
                        }
                    } catch (e) {
                        // ignore network auth check failure
                    }
                }

                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select(`id, organization_id, full_name, role, organizations(name, logo_url)`)
                        .eq('id', user.id)
                        .maybeSingle();

                    if (profile) {
                        setUserProfile({ id: profile.id, name: profile.full_name || 'Admin', role: profile.role });
                        if ((profile.role === 'super_admin' || profile.role === 'superadmin') && activeSupport?.organizationId) {
                            orgIdRef.current = activeSupport.organizationId;
                            setOrgName(activeSupport.organizationName || '');
                            return activeSupport.organizationId;
                        }
                        if (profile.organization_id) {
                            if (profile.organizations) {
                                const org = Array.isArray(profile.organizations) ? profile.organizations[0] : profile.organizations;
                                setOrgName(org?.name || '');
                                setOrgLogo(org?.logo_url || '');
                            }
                            orgIdRef.current = profile.organization_id;
                            return profile.organization_id;
                        }
                    }
                }

                // Sesuai Blueprint Fase 1: Dilarang melakukan fallback ke organizations.limit(1)
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
        try {
            // Populate user profile and cache org ID
            const orgId = await getOrgId();
            
            // Helper for safe query execution with fallback
            const safeQuery = async <T,>(queryPromise: any, fallback: T): Promise<{ data: T; error: any }> => {
                try {
                    const res = await queryPromise;
                    if (res?.error) {
                        console.warn("Supabase query warning:", res.error.code, res.error.message);
                        return { data: fallback, error: res.error };
                    }
                    return { data: (res?.data ?? fallback) as T, error: null };
                } catch (e: any) {
                    console.warn("Supabase query exception:", e);
                    return { data: fallback, error: e };
                }
            };

            // Batch 1: Core reference & structure (scoped by organization_id)
            const [
                { data: santriData },
                { data: studentClassesData },
                { data: musammiData },
                { data: waliKelasData },
                { data: musyrifsData },
                { data: halaqahData },
                { data: halaqahSantriData },
                { data: masterMarhalahData },
                { data: masterKelasRelasiData },
                { data: masterKelasData }
            ] = await Promise.all([
                safeQuery((supabase as any).from('santri').select('*').eq('organization_id', orgId).limit(5000).order('nama', { ascending: true }), []),
                safeQuery((supabase as any).from('student_classes').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(5000), []),
                safeQuery((supabase as any).from('musammi').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('nama', { ascending: true }), []),
                safeQuery((supabase as any).from('wali_kelas').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('kelas', { ascending: true }), []),
                safeQuery((supabase as any).from('musyrifs').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('nama', { ascending: true }), []),
                safeQuery((supabase as any).from('halaqah').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000).order('id', { ascending: true }), []),
                safeQuery((supabase as any).from('halaqah_santri').select('*').eq('organization_id', orgId).limit(10000), []),
                safeQuery((supabase as any).from('master_marhalah').select('*').eq('organization_id', orgId).limit(500), []),
                safeQuery((supabase as any).from('master_kelas_relasi').select('*').eq('organization_id', orgId).limit(500), []),
                safeQuery((supabase as any).from('master_kelas').select('*').eq('organization_id', orgId).limit(500).order('marhalah', { ascending: true }).order('nama_kelas', { ascending: true }), [])
            ]);

            // Batch 2: Configuration & Targets
            const [
                { data: targetsData },
                { data: settingsData },
                { data: appSettingsData },
                { data: halaqahEvalQData }
            ] = await Promise.all([
                safeQuery((supabase as any).from('class_targets').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(1000), []),
                safeQuery((supabase as any).from('evaluation_settings').select('*').eq('organization_id', orgId).limit(1000).order('score', { ascending: false }), []),
                safeQuery((supabase as any).from('app_settings').select('*').eq('organization_id', orgId).limit(500), []),
                safeQuery((supabase as any).from('halaqah_evaluation_questions').select('*').eq('organization_id', orgId).limit(500).order('id', { ascending: true }), [])
            ]);

            // Batch 3: Progress, Evaluations & Exams
            const [
                { data: progressData },
                { data: evaluationData },
                { data: halaqahEvalData },
                { data: ujianBulananData },
                { data: ujianSemesterData }
            ] = await Promise.all([
                safeQuery((supabase as any).from('student_progress').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), []),
                safeQuery((supabase as any).from('student_evaluation').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), []),
                safeQuery((supabase as any).from('halaqah_evaluations').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), []),
                safeQuery((supabase as any).from('ujian_bulanan').select('*').eq('organization_id', orgId).limit(10000), []),
                safeQuery((supabase as any).from('ujian_semester').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).limit(10000), [])
            ]);

            // Fetch active semester dates from appSettingsData (Batch 2)
            const semSettingKey = `SEMESTER_DATES_${selectedAcademicYear.id}`;
            const semSetting = (appSettingsData as any[])?.find(s => s.key === semSettingKey);
            let activeSemStartDate: string | null = null;
            let activeSemEndDate: string | null = null;

            if (semSetting?.value) {
                try {
                    const parsed = JSON.parse(semSetting.value);
                    
                    const currSem = selectedAcademicYear.active_semester || 'Ganjil';
                    if (parsed[currSem]) {
                        activeSemStartDate = parsed[currSem].startDate || null;
                        activeSemEndDate = parsed[currSem].endDate || null;
                    }
                } catch(e) {}
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
                safeQuery(attendanceQuery.limit(50000), []),
                safeQuery((supabase as any).from('setoran_harian').select('*').eq('organization_id', orgId).limit(50000), [])
            ]);

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

            // Map all santri in the organization (enriched with current academic year class if plotted)
            const allSantriMapped: Santri[] = (santriData || []).map(s => {
                const currentClass = ((studentClassesData as any[]) || []).find(c => c.santri_id == s.id);
                
                let marhalahName = currentClass?.marhalah || s.marhalah;
                const mId = currentClass?.marhalah_id || s.marhalah_id;
                if (mId && masterMarhalahData) {
                    const matchedM = (masterMarhalahData as any[])?.find(m => m.id === mId);
                    if (matchedM) marhalahName = matchedM.nama;
                }

                let kelasName = currentClass?.kelas || s.kelas || '-';
                const kId = currentClass?.kelas_id || s.kelas_id;
                if (kId && masterKelasRelasiData) {
                    const matchedK = (masterKelasRelasiData as any[])?.find(k => k.id === kId);
                    if (matchedK) kelasName = matchedK.nama_kelas;
                }

                return { 
                    ...s, 
                    marhalah_id: mId,
                    kelas_id: kId,
                    marhalah: (marhalahName || s.marhalah) as Marhalah,
                    kelas: kelasName,
                    student_class_id: currentClass?.id,
                    nama_wali: s.nama_wali || undefined,
                    no_hp_wali: s.no_hp_wali || undefined,
                    telegram_chat_id: s.telegram_chat_id || undefined,
                    isActiveInCurrentYear: !!currentClass,
                    original_marhalah: s.marhalah,
                    original_kelas: s.kelas
                };
            });

            // Operational modules use plotted santri if student_classes exist for this year, or fallback to all active santri
            const hasAnyPlottedInYear = ((studentClassesData as any[]) || []).length > 0;
            const santriList: Santri[] = hasAnyPlottedInYear
                ? allSantriMapped.filter(s => (s as any).isActiveInCurrentYear)
                : allSantriMapped;
            const activeSantriListForApp = santriList.filter(s => (s.status || 'active') === 'active');
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

            // Map santri to their halaqah
            const halaqahWithSantri: Halaqah[] = (halaqahData || []).map((h): Halaqah | null => {
                const activeSantriIds = (halaqahSantriData || [])
                    .filter(hs => hs.halaqah_id == h.id && (!hs.end_date || hs.end_date.trim() === ''))
                    .map(hs => hs.santri_id);
                
                const historyRecords = (halaqahSantriData || [])
                    .filter(hs => hs.halaqah_id == h.id)
                    .map(hs => ({
                        halaqah_id: hs.halaqah_id,
                        santri_id: hs.santri_id,
                        santri: activeSantriListForApp.find(s => s.id == hs.santri_id),
                        start_date: hs.start_date,
                        end_date: hs.end_date,
                        status: hs.status
                    }));
                
                const musammiForHalaqah: Musammi = musammiList.find(m => m.id === h.musammi_id) || {
                    id: h.musammi_id || 0,
                    nama: 'Belum Ada Musammi',
                    marhalah: (h.marhalah || 'Mutawassithah') as Marhalah,
                    kelas: '-'
                };

                const activeSantriList = activeSantriListForApp.filter(s => activeSantriIds.some(id => id == s.id));

                let marhalahName = h.marhalah;
                if (h.marhalah_id && masterMarhalahData) {
                    const matchedM = (masterMarhalahData as any[])?.find(m => m.id === h.marhalah_id);
                    if (matchedM) marhalahName = matchedM.nama;
                }

                return {
                    id: h.id,
                    nama: h.nama,
                    musammi: musammiForHalaqah,
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
                            || (santriData || []).find((p: any) => p.id === a.person_id);
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
    }, [selectedAcademicYear]);

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
                await (supabase.from('student_classes' as any) as any).upsert({
                    organization_id: orgId,
                    academic_year_id: selectedAcademicYear.id,
                    santri_id: data.id,
                    marhalah_id: (data as any).marhalah_id || null,
                    kelas_id: (data as any).kelas_id || null,
                    marhalah: data.marhalah,
                    kelas: data.kelas
                }, { onConflict: 'academic_year_id, santri_id' });

                try {
                    await (supabase.from('student_enrollments' as any) as any).upsert({
                        organization_id: orgId,
                        academic_year_id: selectedAcademicYear.id,
                        student_id: data.id,
                        marhalah_id: (data as any).marhalah_id || null,
                        kelas_id: (data as any).kelas_id || null,
                        enrollment_status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'organization_id,academic_year_id,student_id' });
                } catch {
                    // Fallback aman jika tabel V2 belum dimigrasi
                }
            }
            setSantri(prev => [...prev, { ...data, marhalah: data.marhalah as Marhalah }]);
            setAllSantri(prev => [...prev, { ...data, marhalah: data.marhalah as Marhalah }]);
        }
        return data;
    }
    
    const addHalaqah = useCallback(async (newHalaqahData: Omit<Halaqah, 'id' | 'musammi' | 'no_urut'> & { musammi_id: number, no_urut?: number }) => {
        const orgId = await getOrgId();
        const { nama, santri: santriList, marhalah, jenis, waktu, no_urut, marhalah_id } = newHalaqahData as any;
        const { data: halaqahResult, error: halaqahError } = await (supabase as any).from('halaqah').insert({
            organization_id: orgId, academic_year_id: selectedAcademicYear?.id, nama, marhalah, jenis, waktu, musammi_id: newHalaqahData.musammi_id, no_urut: no_urut || 999, marhalah_id: marhalah_id || null
        }).select().single();

        if (halaqahError) throw halaqahError;

        const startDate = new Date().toISOString().split('T')[0];

        if (halaqahResult && newHalaqahData.musammi_id) {
            try {
                await (supabase.from('halaqah_musammi_assignments' as any) as any).insert({
                    organization_id: orgId,
                    halaqah_id: halaqahResult.id,
                    musammi_id: newHalaqahData.musammi_id,
                    valid_from: startDate,
                    valid_to: null,
                    is_primary: true
                });
            } catch {
                // Fallback aman jika tabel V2 belum dimigrasi
            }
        }

        if (halaqahResult && santriList.length > 0) {
            const santriLinks = santriList.map((s: any) => ({
                organization_id: orgId, 
                halaqah_id: halaqahResult.id, 
                santri_id: s.id,
                start_date: startDate,
                status: 'Aktif'
            }));
            const { error: linkError } = await (supabase as any).from('halaqah_santri').insert(santriLinks);
            if (linkError) {
                console.error(linkError);
                NotificationStore.addNotification("Berhasil membuat Halaqah, tetapi gagal menambahkan santri. Pastikan kolom start_date dan status ada di tabel halaqah_santri.", "error");
            }

            try {
                const v2Memberships = santriList.map((s: any) => ({
                    organization_id: orgId,
                    halaqah_id: halaqahResult.id,
                    student_id: s.id,
                    valid_from: startDate,
                    valid_to: null,
                    status: 'active'
                }));
                await (supabase.from('halaqah_student_memberships' as any) as any).insert(v2Memberships);
            } catch {
                // Fallback aman jika tabel V2 belum dimigrasi
            }
        }
        await fetchData();
    }, [fetchData, getOrgId, selectedAcademicYear?.id]);

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
            try {
                await (supabase.from('halaqah_musammi_assignments' as any) as any)
                    .update({ valid_to: todayStr, is_primary: false })
                    .eq('organization_id', orgId)
                    .eq('halaqah_id', id)
                    .is('valid_to', null)
                    .neq('musammi_id', updatedData.musammi_id);

                const { data: existingAssign } = await (supabase.from('halaqah_musammi_assignments' as any) as any)
                    .select('id')
                    .eq('organization_id', orgId)
                    .eq('halaqah_id', id)
                    .eq('musammi_id', updatedData.musammi_id)
                    .is('valid_to', null)
                    .maybeSingle();

                if (!existingAssign) {
                    await (supabase.from('halaqah_musammi_assignments' as any) as any).insert({
                        organization_id: orgId,
                        halaqah_id: id,
                        musammi_id: updatedData.musammi_id,
                        valid_from: todayStr,
                        valid_to: null,
                        is_primary: true
                    });
                }
            } catch {
                // Fallback aman jika tabel V2 belum dimigrasi
            }
        }

        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteHalaqahBatch = useCallback(async (ids: number[]) => {
        if (ids.length === 0) return;
        const orgId = await getOrgId();
        const { error } = await (supabase as any)
            .from('halaqah')
            .update({ is_active: false, updated_at: new Date().toISOString() } as any)
            .eq('organization_id', orgId)
            .in('id', ids);
        if (error) {
            console.error(error);
            NotificationStore.addNotification("Gagal mengarsipkan Halaqah. Pastikan Anda telah menjalankan perintah SQL untuk menambahkan kolom is_active dan updated_at.", "error");
            throw error;
        }
        await fetchData();
    }, [fetchData, getOrgId]);

    const deleteHalaqah = useCallback(async (id: number) => {
        const orgId = await getOrgId();
        const { error } = await (supabase as any).from('halaqah').update({ is_active: false, updated_at: new Date().toISOString() } as any).eq('organization_id', orgId).eq('id', id);
        if (error) {
            console.error(error);
            NotificationStore.addNotification("Gagal mengarsipkan Halaqah. Pastikan Anda telah menjalankan perintah SQL untuk menambahkan kolom is_active dan updated_at.", "error");
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
        // Soft delete: set end_date instead of actually deleting
        const orgId = await getOrgId();
        const endDate = tanggal || new Date().toISOString().split('T')[0];
        const { error } = await (supabase as any).from('halaqah_santri').update({ end_date:  endDate,
            status: 'Berhenti/Lulus'
        }).eq('organization_id', orgId).eq('halaqah_id', halaqahId).eq('santri_id', santriId).is('end_date', null);
        
        if (error) {
            console.error(error);
            NotificationStore.addNotification("Gagal mengeluarkan santri dari Halaqah.", "error");
            throw error;
        }

        try {
            await (supabase.from('halaqah_student_memberships' as any) as any)
                .update({ valid_to: endDate, status: 'removed' })
                .eq('organization_id', orgId)
                .eq('halaqah_id', halaqahId)
                .eq('student_id', santriId)
                .is('valid_to', null);
        } catch {
            // Fallback aman jika tabel V2 belum dimigrasi
        }

        await fetchData();
    }, [fetchData, getOrgId]);

    const mutasiSantri = useCallback(async (santriId: number, halaqahLamaId: number, halaqahBaruId: number, tanggal?: string) => {
        const orgId = await getOrgId();
        const mutasiDate = tanggal || new Date().toISOString().split('T')[0];
        
        // 1. Update halaqah lama
        const { error: errUpdate } = await (supabase as any).from('halaqah_santri').update({ end_date:  mutasiDate,
            status: 'Mutasi'
        }).eq('organization_id', orgId).eq('halaqah_id', halaqahLamaId).eq('santri_id', santriId).is('end_date', null);

        if (errUpdate) {
            console.error(errUpdate);
            NotificationStore.addNotification("Gagal mengupdate riwayat halaqah lama.", "error");
            throw errUpdate;
        }

        // 2. Insert ke halaqah baru
        const { error: errInsert } = await (supabase as any).from('halaqah_santri').upsert({
            organization_id: orgId,
            halaqah_id: halaqahBaruId,
            santri_id: santriId,
            start_date: mutasiDate,
            end_date: null,
            status: 'Aktif'
        }, { onConflict: 'halaqah_id, santri_id' });

        if (errInsert) {
            console.error(errInsert);
            NotificationStore.addNotification("Berhasil keluar dari halaqah lama, tapi gagal masuk ke halaqah baru.", "error");
            throw errInsert;
        }

        try {
            await (supabase.from('halaqah_student_memberships' as any) as any)
                .update({ valid_to: mutasiDate, status: 'transferred' })
                .eq('organization_id', orgId)
                .eq('halaqah_id', halaqahLamaId)
                .eq('student_id', santriId)
                .is('valid_to', null);

            await (supabase.from('halaqah_student_memberships' as any) as any).insert({
                organization_id: orgId,
                halaqah_id: halaqahBaruId,
                student_id: santriId,
                valid_from: mutasiDate,
                valid_to: null,
                status: 'active'
            });
        } catch {
            // Fallback aman jika tabel V2 belum dimigrasi
        }

        await fetchData();
    }, [fetchData, getOrgId]);

    const addSantriToHalaqah = useCallback(async (halaqahId: number, newSantri: Santri) => {
         const orgId = await getOrgId();
         const startDate = new Date().toISOString().split('T')[0];
         const { error } = await (supabase as any).from('halaqah_santri').upsert({
             organization_id: orgId,
             halaqah_id: halaqahId,
             santri_id: newSantri.id,
             start_date: startDate,
             end_date: null,
             status: 'Aktif'
         }, { onConflict: 'halaqah_id, santri_id' });
        if (error) {
            console.error(error);
            NotificationStore.addNotification("Gagal menambahkan santri. Pastikan kolom start_date dan status ada di tabel halaqah_santri.", "error");
            throw error;
        }

        try {
            await (supabase.from('halaqah_student_memberships' as any) as any).insert({
                organization_id: orgId,
                halaqah_id: halaqahId,
                student_id: newSantri.id,
                valid_from: startDate,
                valid_to: null,
                status: 'active'
            });
        } catch {
            // Fallback aman jika tabel V2 belum dimigrasi
        }

        await fetchData();
    }, [fetchData, getOrgId]);
    
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

                const { data: sessionRow } = await (supabase as any)
                    .from('halaqah_sessions')
                    .upsert({
                        organization_id: orgId,
                        academic_year_id: selectedAcademicYear?.id || null,
                        halaqah_id: halId,
                        session_date: sDate,
                        session_slot: sSlot,
                        status: 'submitted',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'organization_id,halaqah_id,session_date,session_slot' })
                    .select('id')
                    .maybeSingle();

                if (sessionRow?.id) {
                    const v2AttRows = groupRows.map(r => ({
                        organization_id: orgId,
                        session_id: sessionRow.id,
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

        // Sinkronkan perubahan ke recitation_entries dan catat di recitation_revisions
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
                    updated_at: new Date().toISOString(),
                };

                await (supabase as any)
                    .from('recitation_entries')
                    .update(v2Updates)
                    .eq('id', existingV2.id);

                await (supabase as any).from('recitation_revisions').insert({
                    organization_id: orgId,
                    entry_id: existingV2.id,
                    previous_status: existingV2.status,
                    new_status: v2Updates.status,
                    previous_payload: existingV2,
                    new_payload: v2Updates,
                    reason: updates.revision_reason || 'Pembaruan data setoran harian',
                    changed_by: userProfile?.id || null,
                });
            }
        } catch {
            // Fallback aman jika tabel V2 belum dimigrasi
        }

        await fetchData();
    }, [fetchData, getOrgId, userProfile?.id]);

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
        userProfile, setoranHarian, orgName, orgLogo, updateOrganization,
        globalMarhalahs, globalWaktuHalaqah, globalJenisHalaqah, globalAttendanceStatus, globalPredikatNilai,
        loading: loading || ayLoading, error, fetchData, 
        addHalaqah, updateHalaqah, deleteHalaqah, deleteHalaqahBatch, restoreHalaqah, keluarkanSantri, mutasiSantri, 
        addSantriToHalaqah, addAttendanceRecords, updateAttendanceRecord, deleteAttendanceRecord, deleteAttendanceBatch,
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
