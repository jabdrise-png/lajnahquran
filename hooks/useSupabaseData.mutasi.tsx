// Dipisah dari useSupabaseData.tsx (Fase 8 bagian 2): paruh awal useSupabaseDataInternal.
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
import { SupabaseDataContextType } from './useSupabaseData';

export function useSupabaseDataInternalMutasi() {
  const __muat = useSupabaseDataInternalMuat();
  const { selectedAcademicYear, ayLoading, santri, setSantri, allSantri, setAllSantri, musammi, setMusammi, waliKelas, setWaliKelas, musyrifs, setMusyrifs, halaqah, setHalaqah, attendance, setAttendance, studentProgress, setStudentProgress, classTargets, setClassTargets, studentEvaluations, setStudentEvaluations, evaluationSettings, setEvaluationSettings, halaqahEvalQuestions, setHalaqahEvalQuestions, halaqahEvaluations, setHalaqahEvaluations, appSettings, setAppSettings, masterKelas, setMasterKelas, masterMarhalahs, setMasterMarhalahs, masterKelasRelasi, setMasterKelasRelasi, userProfile, setUserProfile, orgName, setOrgName, orgLogo, setOrgLogo, examAttempts, setExamAttempts, periodeUjianBulanan, setPeriodeUjianBulanan, rubrikAktif, setRubrikAktif, pengaturanRaport, setPengaturanRaport, pengujiUjian, setPengujiUjian, catatanRaport, setCatatanRaport, setoranHarian, setSetoranHarian, recitationKinds, setRecitationKinds, attendanceStatuses, setAttendanceStatuses, sessionSlots, setSessionSlots, halaqahTypes, setHalaqahTypes, fluencyRules, setFluencyRules, evaluationPeriods, setEvaluationPeriods, periodFormFields, setPeriodFormFields, periodRecaps, setPeriodRecaps, periodForms, setPeriodForms, activeSemesterDates, setActiveSemesterDates, studentEnrollments, setStudentEnrollments, halaqahMemberships, setHalaqahMemberships, musammiAssignments, setMusammiAssignments, queryErrors, setQueryErrors, loading, setLoading, lingkupRef, sedangMuatRef, segarkanRef, konteksAbsensiRef, riwayatTermuat, setRiwayatTermuat, memuatRiwayat, setMemuatRiwayat, error, setError, orgIdRef, orgIdPromiseRef, updateOrganization, getOrgId, fetchData } = __muat;

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
            ...(santriAtt || []).map((r) => attendanceToLegacy(r, 'santri', k.statusesList)),
            ...(musammiAtt || []).map((r) => attendanceToLegacy(r, 'musammi', k.statusesList)),
        ], k));
        setSetoranHarian((setoran || []).map((e) => recitationToSetoranRow(e, k.kindsList)));
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
            const v2Memberships = santriList.map((s) => ({
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
                .filter((a) => a.peran === 'Musammi' && musammiRecords.some(r =>
                    r.halaqahId === a.halaqahId && r.date === a.date && r.waktu === a.waktu && r.personId !== a.personId))
                .map((a) => ({ kind: 'musammi', id: a.id }));
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

    const findAttendanceById = (id: string | number) => attendance.find((a) => String(a.id) === String(id)) as any;

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
            targets = attendance.filter((a) => idSet.has(String(a.id)));
        } else {
            targets = attendance.filter((a) =>
                a.date === date && a.waktu === waktu &&
                (!options?.peran || options.peran === 'all' || a.peran === options.peran) &&
                (!options?.halaqahId || a.halaqahId === options.halaqahId));
        }
        const items = targets.map((a) => ({ kind: a.kind, id: a.id }));
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
        const existing: any = setoranHarian.find((r) => String(r.id) === String(id) || String(r.legacy_setoran_id) === String(id));
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
        const existing: any = setoranHarian.find((r) => String(r.id) === String(id) || String(r.legacy_setoran_id) === String(id));
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
  return { __muat, selectedAcademicYear, ayLoading, santri, setSantri, allSantri, setAllSantri, musammi, setMusammi, waliKelas, setWaliKelas, musyrifs, setMusyrifs, halaqah, setHalaqah, attendance, setAttendance, studentProgress, setStudentProgress, classTargets, setClassTargets, studentEvaluations, setStudentEvaluations, evaluationSettings, setEvaluationSettings, halaqahEvalQuestions, setHalaqahEvalQuestions, halaqahEvaluations, setHalaqahEvaluations, appSettings, setAppSettings, masterKelas, setMasterKelas, masterMarhalahs, setMasterMarhalahs, masterKelasRelasi, setMasterKelasRelasi, userProfile, setUserProfile, orgName, setOrgName, orgLogo, setOrgLogo, examAttempts, setExamAttempts, periodeUjianBulanan, setPeriodeUjianBulanan, rubrikAktif, setRubrikAktif, pengaturanRaport, setPengaturanRaport, pengujiUjian, setPengujiUjian, catatanRaport, setCatatanRaport, setoranHarian, setSetoranHarian, recitationKinds, setRecitationKinds, attendanceStatuses, setAttendanceStatuses, sessionSlots, setSessionSlots, halaqahTypes, setHalaqahTypes, fluencyRules, setFluencyRules, evaluationPeriods, setEvaluationPeriods, periodFormFields, setPeriodFormFields, periodRecaps, setPeriodRecaps, periodForms, setPeriodForms, activeSemesterDates, setActiveSemesterDates, studentEnrollments, setStudentEnrollments, halaqahMemberships, setHalaqahMemberships, musammiAssignments, setMusammiAssignments, queryErrors, setQueryErrors, loading, setLoading, lingkupRef, sedangMuatRef, segarkanRef, konteksAbsensiRef, riwayatTermuat, setRiwayatTermuat, memuatRiwayat, setMemuatRiwayat, error, setError, orgIdRef, orgIdPromiseRef, updateOrganization, getOrgId, fetchData, segarkanAbsensiSetoran, muatRiwayat, pastikanTanggal, addMasterKelas, deleteMasterKelas, addSantri, assignHalaqahMusammi, addHalaqah, updateHalaqah, deleteHalaqahBatch, deleteHalaqah, restoreHalaqah, keluarkanSantri, mutasiSantri, addSantriToHalaqah, rpcOrThrow, addAttendanceRecords, findAttendanceById, updateAttendanceRecord, deleteAttendanceRecord, deleteAttendanceBatch, addSetoranHarianRecord, simpanSetoran, updateSetoranHarianRecord, deleteSetoranHarianRecord, rpcRekap, bukaFormPeriode, simpanFormPeriode, bukaKembaliFormPeriode, hitungRekapHarian };
}
