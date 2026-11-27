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
import { JENDELA_OPERASIONAL_HARI, tanggalLokal, awalJendelaOperasional, ambilBertahap, beriNamaAbsensi, ambilAbsensiSetoran, type KonteksAbsensi } from './useSupabaseData.absensi';
import { useSupabaseDataInternalMuat } from './useSupabaseData.muat';
import { useSupabaseDataInternalMutasi } from './useSupabaseData.mutasi';
export * from './useSupabaseData.absensi';

function useSupabaseDataInternal() {
  const __mutasi = useSupabaseDataInternalMutasi();
  const { __muat, selectedAcademicYear, ayLoading, santri, setSantri, allSantri, setAllSantri, musammi, setMusammi, waliKelas, setWaliKelas, musyrifs, setMusyrifs, halaqah, setHalaqah, attendance, setAttendance, studentProgress, setStudentProgress, classTargets, setClassTargets, studentEvaluations, setStudentEvaluations, evaluationSettings, setEvaluationSettings, halaqahEvalQuestions, setHalaqahEvalQuestions, halaqahEvaluations, setHalaqahEvaluations, appSettings, setAppSettings, masterKelas, setMasterKelas, masterMarhalahs, setMasterMarhalahs, masterKelasRelasi, setMasterKelasRelasi, userProfile, setUserProfile, orgName, setOrgName, orgLogo, setOrgLogo, examAttempts, setExamAttempts, periodeUjianBulanan, setPeriodeUjianBulanan, rubrikAktif, setRubrikAktif, pengaturanRaport, setPengaturanRaport, pengujiUjian, setPengujiUjian, catatanRaport, setCatatanRaport, setoranHarian, setSetoranHarian, recitationKinds, setRecitationKinds, attendanceStatuses, setAttendanceStatuses, sessionSlots, setSessionSlots, halaqahTypes, setHalaqahTypes, fluencyRules, setFluencyRules, evaluationPeriods, setEvaluationPeriods, periodFormFields, setPeriodFormFields, periodRecaps, setPeriodRecaps, periodForms, setPeriodForms, activeSemesterDates, setActiveSemesterDates, studentEnrollments, setStudentEnrollments, halaqahMemberships, setHalaqahMemberships, musammiAssignments, setMusammiAssignments, queryErrors, setQueryErrors, loading, setLoading, lingkupRef, sedangMuatRef, segarkanRef, konteksAbsensiRef, riwayatTermuat, setRiwayatTermuat, memuatRiwayat, setMemuatRiwayat, error, setError, orgIdRef, orgIdPromiseRef, updateOrganization, getOrgId, fetchData, segarkanAbsensiSetoran, muatRiwayat, pastikanTanggal, addMasterKelas, deleteMasterKelas, addSantri, assignHalaqahMusammi, addHalaqah, updateHalaqah, deleteHalaqahBatch, deleteHalaqah, restoreHalaqah, keluarkanSantri, mutasiSantri, addSantriToHalaqah, rpcOrThrow, addAttendanceRecords, findAttendanceById, updateAttendanceRecord, deleteAttendanceRecord, deleteAttendanceBatch, addSetoranHarianRecord, simpanSetoran, updateSetoranHarianRecord, deleteSetoranHarianRecord, rpcRekap, bukaFormPeriode, simpanFormPeriode, bukaKembaliFormPeriode, hitungRekapHarian } = __mutasi;

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
                const foundM = currentMarhalahs.find((m) => m.nama === targetData.marhalah);
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
                    const foundK = currentKelasRelasi.find((k) => 
                        k.nama_kelas === targetData.kelas && (!mId || k.marhalah_id === mId)
                    ) || currentKelasRelasi.find((k) => k.nama_kelas === targetData.kelas);
                    
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
                existing = existingRecords.find((r) => {
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
        return ((data as any[]) || []).map((r) => ({ ...r.komponen, santri_id: Number(r.santri_id) }));
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

    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m) => m.nama), [masterMarhalahs]);
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
            const targetMarhalahName = masterMarhalahs.find((m) => m.id === (marhalah_id || oldData?.marhalah_id))?.nama;

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
}

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
