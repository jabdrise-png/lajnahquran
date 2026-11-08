import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { AcademicYear } from '../../types';
import { Plus, Edit, Trash, RefreshCw, Archive, CheckCircle2, AlertTriangle, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { PageShell, PageHeader, StatCard, StatusBadge } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';

type AcademicYearLifecycleStatus = 'draft' | 'setup' | 'active' | 'closing' | 'closed';

interface ClosingPrerequisite {
    key: string;
    label: string;
    count: number;
    passed: boolean;
}

interface ClosingReadinessReport {
    academic_year_id: number;
    academic_year_name: string;
    status: string;
    can_close: boolean;
    total_blockers: number;
    prerequisites: ClosingPrerequisite[];
}

interface ReconciliationFinding {
    code: string;
    label: string;
    count: number;
    status: 'OK' | 'MISMATCH';
}

interface ReconciliationReport {
    organization_id: string;
    academic_year_id: number | null;
    is_reconciled: boolean;
    total_discrepancies: number;
    findings: ReconciliationFinding[];
    checked_at: string;
}

const LIFECYCLE_LABELS: Record<AcademicYearLifecycleStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'primary' | 'danger' }> = {
    draft: { label: 'DRAFT', tone: 'neutral' },
    setup: { label: 'SETUP PERSIAPAN', tone: 'warning' },
    active: { label: 'AKTIF BERJALAN', tone: 'success' },
    closing: { label: 'REKONSILIASI PENUTUPAN', tone: 'primary' },
    closed: { label: 'DITUTUP (TERKUNCI)', tone: 'danger' },
};

const TahunAjaranPage: React.FC = () => {
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

    const [activeSection, setActiveSection] = useState<'years' | 'structure' | 'reconciliation'>(
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

    // State untuk Rekonsiliasi V2 vs Legacy (Fase 4 Section 6)
    const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
    const [loadingReconciliation, setLoadingReconciliation] = useState(false);
    const [runningReconcile, setRunningReconcile] = useState(false);

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

    const fetchReconciliationReport = async (ayId?: number) => {
        setLoadingReconciliation(true);
        try {
            const targetAyId = ayId ?? selectedAcademicYear?.id ?? null;
            const { data, error } = await (supabase as any).rpc('rpc_get_academic_reconciliation_report', {
                p_academic_year_id: targetAyId,
            });
            if (error) throw new Error(error.message);
            setReconciliationReport(data as ReconciliationReport);
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal memuat laporan rekonsiliasi V2.', 'error');
        } finally {
            setLoadingReconciliation(false);
        }
    };

    const handleRunReconciliation = async () => {
        setRunningReconcile(true);
        try {
            const targetAyId = selectedAcademicYear?.id ?? null;
            const { data, error } = await (supabase as any).rpc('rpc_reconcile_academic_v2_data', {
                p_academic_year_id: targetAyId,
            });
            if (error) throw new Error(error.message);
            if (data?.report) {
                setReconciliationReport(data.report as ReconciliationReport);
            } else {
                await fetchReconciliationReport(targetAyId ?? undefined);
            }
            if (fetchData) await fetchData();
            NotificationStore.addNotification(
                `Rekonsiliasi V2 berhasil dijalankan (Enrollments: ${data?.synced?.enrollments_synced ?? 0}, Memberships: ${data?.synced?.memberships_synced ?? 0}, Assignments: ${data?.synced?.assignments_synced ?? 0}).`,
                'success'
            );
        } catch (err: any) {
            NotificationStore.addNotification(err.message || 'Gagal menjalankan rekonsiliasi V2.', 'error');
        } finally {
            setRunningReconcile(false);
        }
    };

    useEffect(() => {
        fetchAcademicYears();
    }, []);

    useEffect(() => {
        if (activeSection === 'reconciliation') {
            fetchReconciliationReport(selectedAcademicYear?.id);
        }
    }, [activeSection, selectedAcademicYear?.id]);

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
            let existingSetting = appSettings.find((s: any) => s.key === settingKey);

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
                `Tahun Ajaran ${closingTargetYear.name} resmi ditutup dan dikunci permanen.`,
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
        const setting = appSettings.find((s: any) => s.key === settingKey);
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
                urutan: (masterKelasRelasi?.filter((x: any) => String(x.marhalah_id) === String(fallbackMId)).length || 0) + 1,
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
            const marhalahObj = (masterMarhalahs || []).find((m: any) => String(m.id) === String(kelasForm.marhalah_id));
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

    if (loading) {
        return <div className="p-6 text-sm text-slate-500">Memuat siklus tahun ajaran...</div>;
    }

    return (
        <PageShell>
            <PageHeader
                kicker="FONDASI AKADEMIK & DATA KANONIKAL V2 (FASE 4)"
                title="Tahun Ajaran, Semester, Struktur Kelas & Rekonsiliasi V2"
                description="Kelola siklus hidup tahun ajaran secara atomik, pemeriksaan 6 prasyarat penutupan tahun ajaran, pembukaan arsip historis, struktur Marhalah/Kelas, dan rekonsiliasi data legacy vs V2."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {activeSection === 'years' && (
                            <button
                                type="button"
                                onClick={() => openModal(null)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                            >
                                <Plus size={15} /> Tambah Tahun Ajaran
                            </button>
                        )}
                        {activeSection === 'structure' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => openMarhalahModal(null)}
                                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                                >
                                    <Plus size={14} /> Tambah Marhalah
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openKelasModal(null)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                                >
                                    <Plus size={15} /> Tambah Kelas & Wali
                                </button>
                            </>
                        )}
                        {activeSection === 'reconciliation' && (
                            <button
                                type="button"
                                disabled={runningReconcile}
                                onClick={handleRunReconciliation}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={runningReconcile ? 'animate-spin' : ''} />
                                {runningReconcile ? 'Menyelaraskan Data V2...' : 'Jalankan Sinkronisasi Legacy → V2'}
                            </button>
                        )}
                    </div>
                }
            />

            {/* Banner Mode Arsip Tahun Ajaran Lama */}
            {isArchivedView && selectedAcademicYear && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <Archive size={18} className="text-indigo-700 mt-0.5 shrink-0" />
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                                Mode Arsip Tahun Ajaran: {selectedAcademicYear.name} ({selectedAcademicYear.active_semester})
                            </div>
                            <p className="text-xs text-indigo-700 mt-0.5">
                                Anda sedang meninjau data historis tahun ajaran arsip. Tahun ajaran operasional yang sedang aktif adalah{' '}
                                <span className="font-bold">{activeAcademicYear?.name || '-'}</span>.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={returnToActiveYear}
                        className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
                    >
                        Kembali ke Tahun Ajaran Aktif
                    </button>
                </div>
            )}

            {/* Segmented Tab Switch */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2">
                <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                        type="button"
                        onClick={() => setActiveSection('years')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            activeSection === 'years'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        1. Siklus Tahun Ajaran & Semester ({localAcademicYears.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSection('structure')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            activeSection === 'structure'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        2. Struktur Marhalah & Kelas ({masterMarhalahs?.length || 0} Marhalah • {masterKelasRelasi?.length || 0} Kelas)
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSection('reconciliation')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            activeSection === 'reconciliation'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        3. Rekonsiliasi Data Kanonikal V2 vs Legacy
                    </button>
                </div>
                <div className="text-[11px] text-slate-500 px-2">
                    Sesuai Arsitektur 3-Role: <span className="font-semibold text-slate-700">Wali Kelas & Musyrif</span> dikelola sebagai atribut administratif kelas/santri.
                </div>
            </div>

            {activeSection === 'reconciliation' ? (
                <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <ShieldCheck size={16} className="text-blue-600" />
                                    Laporan Rekonsiliasi Data Kanonikal V2 vs Legacy ({selectedAcademicYear?.name || 'Semua Tahun'})
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Mendeteksi ketidaksinkronan antara tabel legacy (<span className="font-mono">student_classes, halaqah_santri, halaqah.musammi_id</span>) dan tabel kanonikal V2 (<span className="font-mono">student_enrollments, halaqah_student_memberships, halaqah_musammi_assignments, semesters</span>).
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => fetchReconciliationReport(selectedAcademicYear?.id)}
                                disabled={loadingReconciliation}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                            >
                                <RefreshCw size={13} className={loadingReconciliation ? 'animate-spin' : ''} /> Muat Ulang Audit
                            </button>
                        </div>

                        {loadingReconciliation ? (
                            <div className="py-8 text-center text-xs text-slate-500">Memeriksa konsistensi tabel V2 vs Legacy...</div>
                        ) : reconciliationReport ? (
                            <div className="space-y-4">
                                <div className={`p-4 rounded-xl border flex items-center justify-between ${
                                    reconciliationReport.is_reconciled
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                        : 'bg-amber-50 border-amber-200 text-amber-900'
                                }`}>
                                    <div className="flex items-center gap-3">
                                        {reconciliationReport.is_reconciled ? (
                                            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                                        ) : (
                                            <AlertTriangle size={20} className="text-amber-600 shrink-0" />
                                        )}
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-wider">
                                                {reconciliationReport.is_reconciled
                                                    ? 'DATA KANONIKAL V2 & LEGACY TERSINKRONISASI PENUH'
                                                    : `DITEMUKAN ${reconciliationReport.total_discrepancies} DISKREPANSI DATA LEGACY VS V2`}
                                            </div>
                                            <p className="text-xs mt-0.5 opacity-90">
                                                Tabel legacy tetap dipertahankan hingga rekonsiliasi bernilai 0 diskrepansi dan disetujui pemilik produk.
                                            </p>
                                        </div>
                                    </div>
                                    <StatusBadge
                                        label={reconciliationReport.is_reconciled ? 'RECONCILED' : 'NEEDS SYNC'}
                                        tone={reconciliationReport.is_reconciled ? 'success' : 'warning'}
                                    />
                                </div>

                                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                                            <tr>
                                                <th className="px-4 py-3">Kode Pemeriksaan</th>
                                                <th className="px-4 py-3">Deskripsi Pemeriksaan Integritas</th>
                                                <th className="px-4 py-3 text-right">Jumlah Temuan</th>
                                                <th className="px-4 py-3 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {(reconciliationReport.findings || []).map((item) => (
                                                <tr key={item.code} className="hover:bg-slate-50/70">
                                                    <td className="px-4 py-3 font-mono font-semibold text-slate-700">{item.code}</td>
                                                    <td className="px-4 py-3 text-slate-800">{item.label}</td>
                                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{item.count}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <StatusBadge
                                                            label={item.status}
                                                            tone={item.status === 'OK' ? 'success' : 'warning'}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="py-8 text-center text-xs text-slate-400">Belum ada data laporan rekonsiliasi.</div>
                        )}
                    </div>
                </div>
            ) : activeSection === 'structure' ? (
                <div className="space-y-4">
                    {(masterMarhalahs || []).length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                            <p className="text-sm font-semibold text-slate-800">Belum Ada Struktur Marhalah</p>
                            <p className="text-xs text-slate-500 mt-1 mb-4">
                                Tambahkan jenjang Marhalah terlebih dahulu (mis. Mutawassithah, Aliyah, Jamiah) sebelum membuat daftar kelas.
                            </p>
                            <button
                                type="button"
                                onClick={() => openMarhalahModal(null)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                            >
                                <Plus size={14} /> Buat Marhalah Pertama
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {(masterMarhalahs || []).map((m: any) => {
                                const classesForM = (masterKelasRelasi || []).filter((k: any) => k.marhalah_id === m.id);
                                return (
                                    <div key={m.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 text-white text-xs font-bold">
                                                    {m.urutan || 1}
                                                </span>
                                                <div>
                                                    <h3 className="text-sm font-bold text-slate-900">{m.nama}</h3>
                                                    <p className="text-[11px] text-slate-500">
                                                        {classesForM.length} rombongan belajar terdaftar
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openKelasModal(null, m.id)}
                                                    className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors"
                                                >
                                                    + Tambah Kelas di {m.nama}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openMarhalahModal(m)}
                                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                                                    title="Edit Marhalah"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMarhalah(m)}
                                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-red-600"
                                                    title="Hapus Marhalah"
                                                >
                                                    <Trash size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                                        <th className="px-5 py-2.5 w-16">Urutan</th>
                                                        <th className="px-5 py-2.5">Nama Kelas</th>
                                                        <th className="px-5 py-2.5">Wali Kelas (Atribut Administratif)</th>
                                                        <th className="px-5 py-2.5">Kontak Wali Kelas</th>
                                                        <th className="px-5 py-2.5">Musyrif Pembina</th>
                                                        <th className="px-5 py-2.5 text-right">Aksi</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200 text-xs">
                                                    {classesForM.map((k: any) => (
                                                        <tr key={k.id} className="hover:bg-slate-50/80">
                                                            <td className="px-5 py-3 font-mono text-slate-500">#{k.urutan || 1}</td>
                                                            <td className="px-5 py-3">
                                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                                                                    Kelas {k.nama_kelas}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3 font-medium text-slate-800">
                                                                {k.wali_kelas_name || (
                                                                    <span className="text-slate-400 italic">Belum diatur</span>
                                                                )}
                                                            </td>
                                                            <td className="px-5 py-3 text-slate-600 font-mono">
                                                                {k.wali_kelas_phone || '-'}
                                                            </td>
                                                            <td className="px-5 py-3 text-slate-700">
                                                                {k.musyrif_name || (
                                                                    <span className="text-slate-400 italic">-</span>
                                                                )}
                                                            </td>
                                                            <td className="px-5 py-3 text-right">
                                                                <div className="inline-flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openKelasModal(k)}
                                                                        className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold"
                                                                    >
                                                                        Atur Wali / Edit
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteKelas(k)}
                                                                        className="p-1 rounded-md border border-slate-200 hover:bg-red-50 text-red-600"
                                                                    >
                                                                        <Trash size={13} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {classesForM.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">
                                                                Belum ada kelas pada marhalah {m.nama}.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {/* Ringkasan Kesiapan Tahun Ajaran Terpilih */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            label="Total Tahun Ajaran"
                            value={localAcademicYears.length}
                            meta="Maks. 1 Tahun Ajaran Aktif"
                            tone="neutral"
                        />
                        <StatCard
                            label="Santri Ter-Enroll (TA Terpilih)"
                            value={enrollmentReadiness.enrolledSantri}
                            meta={`Dari ${enrollmentReadiness.totalMasterSantri} biodata induk santri aktif`}
                            tone="success"
                        />
                        <StatCard
                            label="Belum Memiliki Enrollment"
                            value={enrollmentReadiness.unassignedCount}
                            meta={
                                enrollmentReadiness.unassignedCount === 0
                                    ? 'Seluruh santri telah memiliki kelas'
                                    : 'Tidak masuk daftar operasional kelas'
                            }
                            tone={enrollmentReadiness.unassignedCount === 0 ? 'success' : 'warning'}
                        />
                        <StatCard
                            label="Kelompok Halaqah Aktif"
                            value={enrollmentReadiness.activeHalaqahCount}
                            meta="Pada tahun ajaran terpilih"
                            tone="primary"
                        />
                    </div>

                    {enrollmentReadiness.unassignedCount > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
                                    Peringatan Kesiapan Enrollment Tahun Ajaran ({selectedAcademicYear?.name})
                                </div>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    Terdapat <span className="font-mono font-bold">{enrollmentReadiness.unassignedCount}</span> santri aktif yang belum memiliki enrollment pada tahun ajaran ini. Sesuai keputusan arsitektur Fase 4, santri tanpa enrollment aktif tidak dimasukkan secara otomatis ke daftar operasional kelas/halaqah.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                                    <tr>
                                        <th className="px-6 py-3.5">Tahun Ajaran</th>
                                        <th className="px-6 py-3.5">Semester Berjalan & Rentang Tanggal</th>
                                        <th className="px-6 py-3.5">Tahap Siklus (Lifecycle)</th>
                                        <th className="px-6 py-3.5 text-right">Tindakan Tata Kelola</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {localAcademicYears.map((ay) => {
                                        const lifecycle = getEffectiveLifecycleStatus(ay);
                                        const badgeMeta = LIFECYCLE_LABELS[lifecycle] || LIFECYCLE_LABELS.setup;
                                        const isClosed = lifecycle === 'closed';
                                        const isCurrentlyViewed = selectedAcademicYear?.id === ay.id;
                                        return (
                                            <tr key={ay.id} className={`hover:bg-slate-50/70 transition-colors ${isCurrentlyViewed ? 'bg-blue-50/20' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900 font-mono tabular-nums">
                                                            {ay.name}
                                                        </span>
                                                        {isCurrentlyViewed && (
                                                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold uppercase">
                                                                Sedang Ditinjau
                                                            </span>
                                                        )}
                                                    </div>
                                                    {ay.closed_at && (
                                                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                                                            Ditutup: {new Date(ay.closed_at).toLocaleDateString('id-ID')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <div>
                                                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                                Semester {ay.active_semester}
                                                            </span>
                                                            {getSemesterDateDisplay(ay) ? (
                                                                <div className="text-xs font-mono text-slate-600 mt-0.5 tabular-nums">
                                                                    {getSemesterDateDisplay(ay)}
                                                                </div>
                                                            ) : (
                                                                <div className="text-xs text-slate-400 mt-0.5">
                                                                    Rentang tanggal semester belum diatur
                                                                </div>
                                                            )}
                                                        </div>
                                                        {!isClosed && (
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleSemester(ay)}
                                                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors"
                                                                >
                                                                    <RefreshCw size={12} /> Aktifkan {ay.active_semester === 'Ganjil' ? 'Genap' : 'Ganjil'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCloseSemester(ay, ay.active_semester)}
                                                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 inline-flex items-center gap-1 transition-colors"
                                                                    title={`Tutup Semester ${ay.active_semester}`}
                                                                >
                                                                    <Lock size={12} /> Tutup Sem.
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <StatusBadge label={badgeMeta.label} tone={badgeMeta.tone} />
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        {!ay.is_active && !isCurrentlyViewed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openArchivedYear(ay.id)}
                                                                className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                                                            >
                                                                <Archive size={13} /> Buka Arsip
                                                            </button>
                                                        )}
                                                        {!ay.is_active && !isClosed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSetActive(ay.id)}
                                                                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors"
                                                            >
                                                                Aktifkan Tahun
                                                            </button>
                                                        )}
                                                        {!isClosed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenClosingModal(ay)}
                                                                className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition-colors"
                                                            >
                                                                Tutup & Kunci Tahun
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => openModal(ay)}
                                                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                                                            title="Edit Konfigurasi Tahun Ajaran"
                                                        >
                                                            <Edit size={14} />
                                                        </button>
                                                        {!ay.is_active && !isClosed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(ay.id)}
                                                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                                title="Hapus Tahun Ajaran"
                                                            >
                                                                <Trash size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {localAcademicYears.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-xs text-slate-500">
                                                Belum ada data tahun ajaran pada lembaga ini.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Modal Tambah / Edit Tahun Ajaran */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? 'Edit Tahun Ajaran & Semester' : 'Tambah Tahun Ajaran Baru'}
            >
                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Nama Tahun Ajaran <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Contoh: 2026/2027"
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Status Siklus (Lifecycle)
                            </label>
                            <select
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                                value={formData.status}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        status: e.target.value as AcademicYearLifecycleStatus,
                                    })
                                }
                            >
                                <option value="draft">Draft (Perencanaan)</option>
                                <option value="setup">Setup (Persiapan Enrollment & Halaqah)</option>
                                <option value="active">Active (Berjalan)</option>
                                <option value="closing">Closing (Rekonsiliasi Akhir Tahun)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Semester Aktif <span className="text-red-600">*</span>
                        </label>
                        <select
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                            value={formData.active_semester}
                            onChange={(e) => setFormData({ ...formData, active_semester: e.target.value })}
                        >
                            <option value="Ganjil">Semester Ganjil</option>
                            <option value="Genap">Semester Genap</option>
                        </select>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-800">Periode Semester Ganjil</h4>
                            {formData.active_semester === 'Ganjil' && (
                                <StatusBadge label="SEMESTER AKTIF" tone="primary" />
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Tanggal Mulai
                                </label>
                                <input
                                    type="date"
                                    value={formData.ganjil_start_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, ganjil_start_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs font-mono text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Tanggal Berakhir
                                </label>
                                <input
                                    type="date"
                                    value={formData.ganjil_end_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, ganjil_end_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs font-mono text-slate-800"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-800">Periode Semester Genap</h4>
                            {formData.active_semester === 'Genap' && (
                                <StatusBadge label="SEMESTER AKTIF" tone="primary" />
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Tanggal Mulai
                                </label>
                                <input
                                    type="date"
                                    value={formData.genap_start_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, genap_start_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs font-mono text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Tanggal Berakhir
                                </label>
                                <input
                                    type="date"
                                    value={formData.genap_end_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, genap_end_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs font-mono text-slate-800"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Wizard Pemeriksaan Prasyarat & Penutupan Tahun Ajaran (rpc_close_academic_year) */}
            <Modal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                title={`Verifikasi Prasyarat & Penutupan Tahun Ajaran ${closingTargetYear?.name || ''}`}
            >
                <form onSubmit={handleConfirmCloseAcademicYear} className="space-y-4">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">
                                Daftar 6 Prasyarat Penutupan Tahun Ajaran (Server-Side Gate)
                            </span>
                            {closingTargetYear && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenClosingModal(closingTargetYear)}
                                    disabled={checkingReadiness}
                                    className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                                >
                                    <RefreshCw size={11} className={checkingReadiness ? 'animate-spin' : ''} /> Periksa Ulang
                                </button>
                            )}
                        </div>

                        {checkingReadiness ? (
                            <div className="py-4 text-center text-xs text-slate-500">
                                Memeriksa 6 prasyarat penutupan pada server...
                            </div>
                        ) : closingReadiness ? (
                            <div className="space-y-2">
                                {(closingReadiness.prerequisites || []).map((item) => (
                                    <div
                                        key={item.key}
                                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                                            item.passed
                                                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                                : 'bg-red-50 border-red-200 text-red-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {item.passed ? (
                                                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                            ) : (
                                                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                                            )}
                                            <span className="font-medium">{item.label}</span>
                                        </div>
                                        <span className="font-mono font-bold">
                                            {item.passed ? '0 (Tuntas)' : `${item.count} Belum Selesai`}
                                        </span>
                                    </div>
                                ))}

                                {!closingReadiness.can_close && (
                                    <div className="p-2.5 rounded-lg bg-red-100/80 border border-red-300 text-[11px] text-red-900 font-medium">
                                        Penutupan Tahun Ajaran dikunci oleh server hingga seluruh prasyarat di atas bernilai 0.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-3 text-xs text-red-600">
                                Tidak dapat memverifikasi prasyarat penutupan tahun ajaran.
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Catatan Berita Acara Penutupan Tahun Ajaran <span className="text-red-600">*</span>
                        </label>
                        <textarea
                            required
                            rows={3}
                            value={closingReason}
                            onChange={(e) => setClosingReason(e.target.value)}
                            placeholder="Contoh: Seluruh sesi, ujian, remedial, publikasi raport, dan rekonsiliasi enrollment TA telah tuntas."
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsClosingModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={
                                isSubmitting ||
                                checkingReadiness ||
                                !closingReason.trim() ||
                                (closingReadiness !== null && !closingReadiness.can_close)
                            }
                            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                            {isSubmitting ? 'Memproses Penutupan...' : 'Kunci & Tutup Tahun Ajaran'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal Tambah/Edit Marhalah */}
            <Modal
                isOpen={isMarhalahModalOpen}
                onClose={() => setIsMarhalahModalOpen(false)}
                title={editingMarhalah ? 'Edit Jenjang Marhalah' : 'Tambah Jenjang Marhalah'}
            >
                <form onSubmit={handleSaveMarhalah} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Nama Marhalah <span className="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="Contoh: Mutawassithah / Aliyah / Jamiah"
                            value={marhalahForm.nama}
                            onChange={(e) => setMarhalahForm({ ...marhalahForm, nama: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Urutan Jenjang
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={marhalahForm.urutan}
                            onChange={(e) => setMarhalahForm({ ...marhalahForm, urutan: Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsMarhalahModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Marhalah'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal Tambah/Edit Kelas & Atribut Administratif Wali Kelas/Musyrif */}
            <Modal
                isOpen={isKelasModalOpen}
                onClose={() => setIsKelasModalOpen(false)}
                title={editingKelas ? 'Edit Kelas & Atribut Wali Kelas/Musyrif' : 'Tambah Kelas & Atribut Administratif'}
            >
                <form onSubmit={handleSaveKelas} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Marhalah <span className="text-red-600">*</span>
                            </label>
                            <select
                                required
                                value={kelasForm.marhalah_id}
                                onChange={(e) => setKelasForm({ ...kelasForm, marhalah_id: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                            >
                                <option value="">-- Pilih Marhalah --</option>
                                {(masterMarhalahs || []).map((m: any) => (
                                    <option key={m.id} value={m.id}>
                                        {m.nama}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Nama Kelas <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Contoh: 1A / 10-IPA"
                                value={kelasForm.nama_kelas}
                                onChange={(e) => setKelasForm({ ...kelasForm, nama_kelas: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                            />
                        </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                                Atribut Administratif Kelas (Non-Login)
                            </span>
                            <StatusBadge label="ARSITEKTUR 3-ROLE" tone="primary" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Nama Wali Kelas (Tercetak di Raport)
                            </label>
                            <input
                                type="text"
                                placeholder="Contoh: Ustadz Ahmad Fauzi, Lc."
                                value={kelasForm.wali_kelas_name}
                                onChange={(e) => setKelasForm({ ...kelasForm, wali_kelas_name: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    No. WhatsApp Wali Kelas
                                </label>
                                <input
                                    type="text"
                                    placeholder="0812xxxxxxxx"
                                    value={kelasForm.wali_kelas_phone}
                                    onChange={(e) => setKelasForm({ ...kelasForm, wali_kelas_phone: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nama Musyrif Pembina
                                </label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Ustadz Zaid"
                                    value={kelasForm.musyrif_name}
                                    onChange={(e) => setKelasForm({ ...kelasForm, musyrif_name: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsKelasModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Kelas & Atribut'}
                        </button>
                    </div>
                </form>
            </Modal>
        </PageShell>
    );
};

export default TahunAjaranPage;
