// Dipecah otomatis dari TahunAjaranPage.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen TahunAjaranPage.
// Ubah perilaku di sini; tampilan ada di TahunAjaranPage.tsx.
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { AcademicYear } from '../../types';
import { Plus, Edit, Trash, RefreshCw, Archive, CheckCircle2, AlertTriangle, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { PageShell, PageHeader, StatCard, StatusBadge, ConfirmDialog } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';


export type AcademicYearLifecycleStatus = 'draft' | 'setup' | 'active' | 'closing' | 'closed';

export interface ClosingPrerequisite {
    key: string;
    label: string;
    count: number;
    passed: boolean;
}

export interface ClosingReadinessReport {
    academic_year_id: number;
    academic_year_name: string;
    status: string;
    can_close: boolean;
    total_blockers: number;
    prerequisites: ClosingPrerequisite[];
}


export const LIFECYCLE_LABELS: Record<AcademicYearLifecycleStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'primary' | 'danger' }> = {
    // Fase 8: bagi pengguna hanya dua keadaan — Aktif (bisa diubah) / Ditutup (terkunci)
    draft: { label: 'Aktif', tone: 'success' },
    setup: { label: 'Aktif', tone: 'success' },
    active: { label: 'Aktif', tone: 'success' },
    closing: { label: 'Aktif', tone: 'success' },
    closed: { label: 'Ditutup', tone: 'danger' },
};

export function useTahunAjaranPageLogika() {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const {
        getOrgId,
        appSettings,
        saveAppSetting,
        fetchData,
        allSantri,
        santri,
        halaqah,
        masterMarhalahs,
        masterKelasRelasi,
    } = useSupabaseData();
    const {
        refreshAcademicYears,
        selectedAcademicYear,
        activeAcademicYear,
        isArchivedView,
        openArchivedYear,
        returnToActiveYear,
    } = useAcademicYear();

    const isStructureRoute =
        location.pathname.includes('/structure/marhalah') ||
        location.pathname.includes('/structure/classes') ||
        searchParams.get('tab') === 'structure';

    // Fase 2: tab Rekonsiliasi dihapus (data lama sudah dipindah ke V2 oleh migrasi database)
    const [activeSection, setActiveSection] = useState<'years' | 'structure'>(
        isStructureRoute ? 'structure' : 'years'
    );

    useEffect(() => {
        if (isStructureRoute) {
            setActiveSection('structure');
        }
    }, [isStructureRoute]);

    const [localAcademicYears, setLocalAcademicYears] = useState<(AcademicYear & { status?: AcademicYearLifecycleStatus; closed_at?: string | null })[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [closingTargetYear, setClosingTargetYear] = useState<(AcademicYear & { status?: AcademicYearLifecycleStatus }) | null>(null);
    const [closingReason, setClosingReason] = useState('');
    const [closingReadiness, setClosingReadiness] = useState<ClosingReadinessReport | null>(null);
    const [checkingReadiness, setCheckingReadiness] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        active_semester: 'Ganjil',
        status: 'setup' as AcademicYearLifecycleStatus,
        is_active: false,
        ganjil_start_date: '',
        ganjil_end_date: '',
        genap_start_date: '',
        genap_end_date: '',
    });


    // State untuk Struktur Marhalah & Kelas (Atribut Wali Kelas / Musyrif)
    const [isMarhalahModalOpen, setIsMarhalahModalOpen] = useState(false);
    const [editingMarhalah, setEditingMarhalah] = useState<any | null>(null);
    const [marhalahForm, setMarhalahForm] = useState({ nama: '', urutan: 1 });

    const [isKelasModalOpen, setIsKelasModalOpen] = useState(false);
    const [editingKelas, setEditingKelas] = useState<any | null>(null);
    const [kelasForm, setKelasForm] = useState({
        marhalah_id: '' as string | number,
        nama_kelas: '',
        urutan: 1,
        wali_kelas_name: '',
        wali_kelas_phone: '',
        musyrif_name: '',
    });

    const fetchAcademicYears = async () => {
        setLoading(true);
        const orgId = await getOrgId();
        if (orgId) {
            const { data, error } = await supabase
                .from('academic_years')
                .select('*')
                .eq('organization_id', orgId)
                .order('id', { ascending: false });

            if (error) {
                NotificationStore.addNotification(`Gagal memuat tahun ajaran: ${error.message}`, 'error');
            } else if (data) {
                setLocalAcademicYears(data as any);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAcademicYears();
    }, []);

    // Indikator Kesiapan Enrollment Tahun Ajaran Terpilih
    const enrollmentReadiness = useMemo(() => {
        const totalMasterSantri = (allSantri || []).filter((s) => (s as any).status !== 'nonaktif').length;
        const enrolledSantri = (santri || []).filter((s) => s.is_enrolled_in_active_year !== false && s.kelas && s.kelas !== '-').length;
        const unassignedCount = Math.max(0, totalMasterSantri - enrolledSantri);
        const activeHalaqahCount = (halaqah || []).filter((h) => h.is_active !== false).length;
        return {
            totalMasterSantri,
            enrolledSantri,
            unassignedCount,
            activeHalaqahCount,
        };
    }, [allSantri, santri, halaqah]);

    const getEffectiveLifecycleStatus = (ay: AcademicYear & { status?: AcademicYearLifecycleStatus }): AcademicYearLifecycleStatus => {
        if (ay.status && LIFECYCLE_LABELS[ay.status]) {
            return ay.status;
        }
        return ay.is_active ? 'active' : 'closed';
    };

    const openModal = async (ay: (AcademicYear & { status?: AcademicYearLifecycleStatus }) | null) => {
        if (ay) {
            setEditingId(ay.id);

            let gStartDate = (ay as any).ganjil_start_date || (ay as any).start_date || '';
            let gEndDate = (ay as any).ganjil_end_date || (ay as any).end_date || '';
            let genStartDate = (ay as any).genap_start_date || '';
            let genEndDate = (ay as any).genap_end_date || '';

            const settingKey = `SEMESTER_DATES_${ay.id}`;
            let existingSetting = appSettings.find((s) => s.key === settingKey);

            if (!existingSetting) {
                const orgId = await getOrgId();
                const { data } = await (supabase as any)
                    .from('app_settings')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('key', settingKey)
                    .maybeSingle();
                if (data) existingSetting = data;
            }

            if (existingSetting && existingSetting.value) {
                try {
                    const parsed = JSON.parse(existingSetting.value);
                    if (parsed.Ganjil) {
                        gStartDate = parsed.Ganjil.startDate || gStartDate;
                        gEndDate = parsed.Ganjil.endDate || gEndDate;
                    }
                    if (parsed.Genap) {
                        genStartDate = parsed.Genap.startDate || genStartDate;
                        genEndDate = parsed.Genap.endDate || genEndDate;
                    }
                } catch {}
            }

            setFormData({
                name: ay.name,
                active_semester: ay.active_semester,
                status: getEffectiveLifecycleStatus(ay),
                is_active: ay.is_active,
                ganjil_start_date: gStartDate,
                ganjil_end_date: gEndDate,
                genap_start_date: genStartDate,
                genap_end_date: genEndDate,
            });
        } else {
            setEditingId(null);
            setFormData({
                name: '',
                active_semester: 'Ganjil',
                status: localAcademicYears.length === 0 ? 'active' : 'setup',
                is_active: localAcademicYears.length === 0,
                ganjil_start_date: '',
                ganjil_end_date: '',
                genap_start_date: '',
                genap_end_date: '',
            });
        }
        setIsModalOpen(true);
    };

    // Transaksi Atomik Server-Side via rpc_upsert_academic_year (Tanpa Fallback Direct Update)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const { data: rpcResult, error: rpcError } = await (supabase as any).rpc('rpc_upsert_academic_year', {
                p_id: editingId ?? null,
                p_name: formData.name.trim(),
                p_active_semester: formData.active_semester,
                p_status: formData.status,
                p_ganjil_start: formData.ganjil_start_date || null,
                p_ganjil_end: formData.ganjil_end_date || null,
                p_genap_start: formData.genap_start_date || null,
                p_genap_end: formData.genap_end_date || null,
            });

            if (rpcError) {
                throw new Error(rpcError.message || 'Server menolak penyimpanan Tahun Ajaran.');
            }

            const newId = rpcResult?.id || rpcResult?.academic_year_id || editingId;
            if (newId) {
                const datesObject = {
                    Ganjil: { startDate: formData.ganjil_start_date, endDate: formData.ganjil_end_date },
                    Genap: { startDate: formData.genap_start_date, endDate: formData.genap_end_date },
                };
                await saveAppSetting(`SEMESTER_DATES_${newId}`, JSON.stringify(datesObject));
            }

            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            setIsModalOpen(false);
            NotificationStore.addNotification('Konfigurasi Tahun Ajaran & Semester berhasil disimpan secara atomik.', 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal menyimpan Tahun Ajaran.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        const targetYear = localAcademicYears.find((ay) => ay.id === id);
        if (targetYear?.is_active || targetYear?.status === 'closed') {
            NotificationStore.addNotification(
                'Tahun Ajaran yang sedang aktif atau sudah ditutup permanen tidak dapat dihapus.',
                'error'
            );
            return;
        }
        try {
            const orgId = await getOrgId();
            const { error } = await supabase
                .from('academic_years')
                .delete()
                .eq('id', id)
                .eq('organization_id', orgId);
            if (error) throw error;
            await fetchAcademicYears();
            await refreshAcademicYears();
            NotificationStore.addNotification('Tahun Ajaran berhasil dihapus.', 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal menghapus Tahun Ajaran.', 'error');
        }
    };

    const handleSetActive = async (id: number) => {
        try {
            const targetYear = localAcademicYears.find((y) => y.id === id);
            const activeSem = targetYear?.active_semester || 'Ganjil';
            const { error: rpcErr } = await (supabase as any).rpc('rpc_set_active_academic_year', {
                p_academic_year_id: id,
                p_semester: activeSem,
            });
            if (rpcErr) {
                throw new Error(rpcErr.message);
            }

            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            NotificationStore.addNotification('Tahun Ajaran aktif berhasil diperbarui secara atomik.', 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal mengaktifkan Tahun Ajaran.', 'error');
        }
    };

    // Transaksi Atomik Penggantian Semester via rpc_set_active_semester (Tanpa Fallback Direct Update)
    const handleToggleSemester = async (ay: AcademicYear & { status?: AcademicYearLifecycleStatus }) => {
        if (ay.status === 'closed') {
            NotificationStore.addNotification('Tahun Ajaran yang telah ditutup tidak dapat diubah semesternya.', 'error');
            return;
        }
        const newSemester = ay.active_semester === 'Ganjil' ? 'Genap' : 'Ganjil';
        try {
            const { error: rpcErr } = await (supabase as any).rpc('rpc_set_active_semester', {
                p_academic_year_id: ay.id,
                p_semester: newSemester,
            });
            if (rpcErr) throw new Error(rpcErr.message);

            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            NotificationStore.addNotification(`Semester aktif berhasil diubah ke ${newSemester} secara atomik.`, 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal mengubah semester.', 'error');
        }
    };

    const handleCloseSemester = async (ay: AcademicYear & { status?: AcademicYearLifecycleStatus }, semesterName: string) => {
        try {
            const { error: rpcErr } = await (supabase as any).rpc('rpc_close_semester', {
                p_academic_year_id: ay.id,
                p_semester: semesterName,
                p_reason: `Penutupan Semester ${semesterName} TA ${ay.name}`,
            });
            if (rpcErr) throw new Error(rpcErr.message);

            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            NotificationStore.addNotification(`Semester ${semesterName} pada TA ${ay.name} berhasil ditutup.`, 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal menutup semester.', 'error');
        }
    };

    const handleOpenClosingModal = async (ay: AcademicYear & { status?: AcademicYearLifecycleStatus }) => {
        setClosingTargetYear(ay);
        setClosingReason('');
        setClosingReadiness(null);
        setIsClosingModalOpen(true);
        setCheckingReadiness(true);
        try {
            const { data, error } = await (supabase as any).rpc('rpc_check_academic_year_closing_readiness', {
                p_academic_year_id: ay.id,
            });
            if (error) throw new Error(error.message);
            setClosingReadiness(data as ClosingReadinessReport);
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal memeriksa prasyarat penutupan Tahun Ajaran.', 'error');
        } finally {
            setCheckingReadiness(false);
        }
    };

    // Fase 8: buka kembali tahun ajaran yang sudah ditutup (Admin, wajib alasan, tercatat di audit)
    const [bukaKembali, setBukaKembali] = useState<AcademicYear | null>(null);
    const handleBukaKembali = async (alasan?: string) => {
        if (!bukaKembali) return;
        setIsSubmitting(true);
        try {
            const { error } = await (supabase as any).rpc('rpc_buka_kembali_tahun_ajaran', { p_tahun: bukaKembali.id, p_alasan: alasan || '' });
            if (error) throw error;
            NotificationStore.addNotification(`Tahun Ajaran ${bukaKembali.name} dibuka kembali. Data bisa dikoreksi; tutup lagi bila selesai.`, 'success');
            setBukaKembali(null);
            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
        } catch (e: any) {
            NotificationStore.addNotification(e?.message || 'Gagal membuka kembali tahun ajaran.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmCloseAcademicYear = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!closingTargetYear) return;
        if (closingReadiness && !closingReadiness.can_close) {
            NotificationStore.addNotification(
                'Penutupan Tahun Ajaran ditolak karena masih terdapat prasyarat operasional yang belum diselesaikan.',
                'error'
            );
            return;
        }
        setIsSubmitting(true);
        try {
            const { error: rpcError } = await (supabase as any).rpc('rpc_close_academic_year', {
                p_academic_year_id: closingTargetYear.id,
                p_reason: closingReason.trim() || null,
            });

            if (rpcError) {
                throw new Error(rpcError.message || 'Rekonsiliasi penutupan Tahun Ajaran ditolak oleh server.');
            }

            setIsClosingModalOpen(false);
            setClosingTargetYear(null);
            setClosingReason('');
            setClosingReadiness(null);
            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            NotificationStore.addNotification(
                `Tahun Ajaran ${closingTargetYear.name} resmi ditutup. Data tahun ini terkunci; Admin dapat membukanya kembali bila perlu koreksi.`,
                'success'
            );
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal menutup Tahun Ajaran.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getSemesterDateDisplay = (ay: AcademicYear) => {
        const settingKey = `SEMESTER_DATES_${ay.id}`;
        const setting = appSettings.find((s) => s.key === settingKey);
        let startDate = (ay as any).active_semester === 'Genap' ? (ay as any).genap_start_date : (ay as any).ganjil_start_date || (ay as any).start_date;
        let endDate = (ay as any).active_semester === 'Genap' ? (ay as any).genap_end_date : (ay as any).ganjil_end_date || (ay as any).end_date;

        if (setting?.value) {
            try {
                const parsed = JSON.parse(setting.value);
                const sem = ay.active_semester || 'Ganjil';
                if (parsed[sem]) {
                    startDate = parsed[sem].startDate || startDate;
                    endDate = parsed[sem].endDate || endDate;
                }
            } catch {}
        }

        if (startDate && endDate) {
            return `${startDate} s/d ${endDate}`;
        } else if (startDate) {
            return `Mulai: ${startDate}`;
        }
        return null;
    };

    // Handlers untuk Struktur Marhalah & Kelas
    const openMarhalahModal = (m: any | null) => {
        setEditingMarhalah(m);
        if (m) {
            setMarhalahForm({ nama: m.nama, urutan: m.urutan || 1 });
        } else {
            setMarhalahForm({ nama: '', urutan: (masterMarhalahs?.length || 0) + 1 });
        }
        setIsMarhalahModalOpen(true);
    };

    const handleSaveMarhalah = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!marhalahForm.nama.trim()) return;
        setIsSubmitting(true);
        try {
            const orgId = await getOrgId();
            if (!orgId) throw new Error('Organisasi tidak ditemukan.');
            if (editingMarhalah) {
                let { error } = await (supabase as any)
                    .from('master_marhalah')
                    .update({ nama: marhalahForm.nama.trim(), urutan: Number(marhalahForm.urutan) || 1 })
                    .eq('id', editingMarhalah.id)
                    .eq('organization_id', orgId);

                // Fallback jika kolom urutan belum ada di schema cache
                if (error && (error.message?.includes('urutan') || error.code === '42703')) {
                    const res = await (supabase as any)
                        .from('master_marhalah')
                        .update({ nama: marhalahForm.nama.trim() })
                        .eq('id', editingMarhalah.id)
                        .eq('organization_id', orgId);
                    error = res.error;
                }
                if (error) throw error;
                NotificationStore.addNotification('Data Marhalah berhasil diperbarui.', 'success');
            } else {
                let { error } = await (supabase as any)
                    .from('master_marhalah')
                    .insert({
                        organization_id: orgId,
                        nama: marhalahForm.nama.trim(),
                        urutan: Number(marhalahForm.urutan) || 1,
                    });

                // Fallback jika kolom urutan belum ada di schema cache
                if (error && (error.message?.includes('urutan') || error.code === '42703')) {
                    const res = await (supabase as any)
                        .from('master_marhalah')
                        .insert({
                            organization_id: orgId,
                            nama: marhalahForm.nama.trim(),
                        });
                    error = res.error;
                }
                if (error) throw error;
                NotificationStore.addNotification('Marhalah baru berhasil ditambahkan.', 'success');
            }
            setIsMarhalahModalOpen(false);
            if (fetchData) await fetchData();
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal menyimpan Marhalah.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteMarhalah = async (m: any) => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { error } = await (supabase as any)
                .from('master_marhalah')
                .delete()
                .eq('id', m.id)
                .eq('organization_id', orgId);
            if (error) throw error;
            NotificationStore.addNotification(`Marhalah ${m.nama} dihapus.`, 'info');
            if (fetchData) await fetchData();
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal menghapus Marhalah.', 'error');
        }
    };

    const openKelasModal = (k: any | null, defaultMarhalahId?: string | number) => {
        setEditingKelas(k);
        if (k) {
            setKelasForm({
                marhalah_id: k.marhalah_id,
                nama_kelas: k.nama_kelas || '',
                urutan: k.urutan || 1,
                wali_kelas_name: k.wali_kelas_name || '',
                wali_kelas_phone: k.wali_kelas_phone || '',
                musyrif_name: k.musyrif_name || '',
            });
        } else {
            const fallbackMId = defaultMarhalahId || masterMarhalahs?.[0]?.id || '';
            setKelasForm({
                marhalah_id: fallbackMId,
                nama_kelas: '',
                urutan: (masterKelasRelasi?.filter((x) => String(x.marhalah_id) === String(fallbackMId)).length || 0) + 1,
                wali_kelas_name: '',
                wali_kelas_phone: '',
                musyrif_name: '',
            });
        }
        setIsKelasModalOpen(true);
    };

    const handleSaveKelas = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!kelasForm.nama_kelas.trim() || !kelasForm.marhalah_id) return;
        setIsSubmitting(true);
        try {
            const orgId = await getOrgId();
            if (!orgId) throw new Error('Organisasi tidak ditemukan.');
            const marhalahObj = (masterMarhalahs || []).find((m) => String(m.id) === String(kelasForm.marhalah_id));
            const marhalahName = marhalahObj?.nama || 'Mutawassithah';
            const safeMarhalahId = kelasForm.marhalah_id ? String(kelasForm.marhalah_id) : null;

            const basePayload: any = {
                marhalah_id: safeMarhalahId,
                nama_kelas: kelasForm.nama_kelas.trim(),
                wali_kelas_name: kelasForm.wali_kelas_name.trim() || null,
                wali_kelas_phone: kelasForm.wali_kelas_phone.trim() || null,
                musyrif_name: kelasForm.musyrif_name.trim() || null,
            };

            let savedKelasId = editingKelas?.id;

            if (editingKelas) {
                let { error } = await (supabase as any)
                    .from('master_kelas_relasi')
                    .update({ ...basePayload, urutan: Number(kelasForm.urutan) || 1 })
                    .eq('id', editingKelas.id)
                    .eq('organization_id', orgId);

                // Fallback jika kolom urutan belum ada di schema cache database
                if (error && (error.message?.includes('urutan') || error.code === '42703')) {
                    const res = await (supabase as any)
                        .from('master_kelas_relasi')
                        .update(basePayload)
                        .eq('id', editingKelas.id)
                        .eq('organization_id', orgId);
                    error = res.error;
                }
                if (error) throw error;
            } else {
                let { data, error } = await (supabase as any)
                    .from('master_kelas_relasi')
                    .insert({ ...basePayload, urutan: Number(kelasForm.urutan) || 1, organization_id: orgId })
                    .select()
                    .single();

                // Fallback jika kolom urutan belum ada di schema cache database
                if (error && (error.message?.includes('urutan') || error.code === '42703')) {
                    const res = await (supabase as any)
                        .from('master_kelas_relasi')
                        .insert({ ...basePayload, organization_id: orgId })
                        .select()
                        .single();
                    data = res.data;
                    error = res.error;
                }
                if (error) throw error;
                savedKelasId = data?.id;
            }

            if (kelasForm.wali_kelas_name.trim() && selectedAcademicYear) {
                const { data: existingWali } = await (supabase as any)
                    .from('wali_kelas')
                    .select('id')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', selectedAcademicYear.id)
                    .eq('kelas', kelasForm.nama_kelas.trim())
                    .maybeSingle();

                if (existingWali) {
                    await (supabase as any)
                        .from('wali_kelas')
                        .update({
                            nama: kelasForm.wali_kelas_name.trim(),
                            no_hp: kelasForm.wali_kelas_phone.trim() || null,
                            marhalah_id: safeMarhalahId,
                            kelas_id: savedKelasId || null,
                        })
                        .eq('id', existingWali.id);
                } else {
                    await (supabase as any).from('wali_kelas').insert({
                        organization_id: orgId,
                        academic_year_id: selectedAcademicYear.id,
                        nama: kelasForm.wali_kelas_name.trim(),
                        no_hp: kelasForm.wali_kelas_phone.trim() || null,
                        marhalah: ['Mutawassithah', 'Aliyah', 'Jamiah'].includes(marhalahName) ? marhalahName : 'Mutawassithah',
                        kelas: kelasForm.nama_kelas.trim(),
                        marhalah_id: safeMarhalahId,
                        kelas_id: savedKelasId || null,
                    });
                }
            }

            setIsKelasModalOpen(false);
            if (fetchData) await fetchData();
            NotificationStore.addNotification('Struktur Kelas & Atribut Administratif berhasil disimpan.', 'success');
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal menyimpan kelas.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteKelas = async (k: any) => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { error } = await (supabase as any)
                .from('master_kelas_relasi')
                .delete()
                .eq('id', k.id)
                .eq('organization_id', orgId);
            if (error) throw error;
            NotificationStore.addNotification(`Kelas ${k.nama_kelas} dihapus.`, 'info');
            if (fetchData) await fetchData();
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal menghapus kelas.', 'error');
        }
    };
  return { location, searchParams, getOrgId, appSettings, saveAppSetting, fetchData, allSantri, santri, halaqah, masterMarhalahs, masterKelasRelasi, refreshAcademicYears, selectedAcademicYear, activeAcademicYear, isArchivedView, openArchivedYear, returnToActiveYear, isStructureRoute, activeSection, setActiveSection, localAcademicYears, setLocalAcademicYears, loading, setLoading, isModalOpen, setIsModalOpen, isClosingModalOpen, setIsClosingModalOpen, closingTargetYear, setClosingTargetYear, closingReason, setClosingReason, closingReadiness, setClosingReadiness, checkingReadiness, setCheckingReadiness, isSubmitting, setIsSubmitting, editingId, setEditingId, formData, setFormData, isMarhalahModalOpen, setIsMarhalahModalOpen, editingMarhalah, setEditingMarhalah, marhalahForm, setMarhalahForm, isKelasModalOpen, setIsKelasModalOpen, editingKelas, setEditingKelas, kelasForm, setKelasForm, fetchAcademicYears, enrollmentReadiness, getEffectiveLifecycleStatus, openModal, handleSubmit, handleDelete, handleSetActive, handleToggleSemester, handleCloseSemester, handleOpenClosingModal, bukaKembali, setBukaKembali, handleBukaKembali, handleConfirmCloseAcademicYear, getSemesterDateDisplay, openMarhalahModal, handleSaveMarhalah, handleDeleteMarhalah, openKelasModal, handleSaveKelas, handleDeleteKelas };
}

export type TahunAjaranPageLogika = ReturnType<typeof useTahunAjaranPageLogika>;
