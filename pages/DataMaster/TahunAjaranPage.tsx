import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { AcademicYear } from '../../types';
import { Plus, Edit, Trash, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { PageShell, PageHeader, StatCard, StatusBadge } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';

type AcademicYearLifecycleStatus = 'draft' | 'setup' | 'active' | 'closing' | 'closed';

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
    const { refreshAcademicYears, selectedAcademicYear } = useAcademicYear();

    const isStructureRoute =
        location.pathname.includes('/structure/marhalah') ||
        location.pathname.includes('/structure/classes') ||
        searchParams.get('tab') === 'structure';

    const [activeSection, setActiveSection] = useState<'years' | 'structure'>(isStructureRoute ? 'structure' : 'years');

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
            const { data } = await supabase
                .from('academic_years')
                .select('*')
                .eq('organization_id', orgId)
                .order('id', { ascending: false });

            if (data) {
                setLocalAcademicYears(data as any);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAcademicYears();
    }, []);

    // Indikator Kesiapan Enrollment Tahun Ajaran Aktif (Fase 3 Blueprint)
    const enrollmentReadiness = useMemo(() => {
        const totalMasterSantri = (allSantri || []).length;
        const enrolledSantri = (santri || []).filter((s) => s.kelas && s.kelas !== '-').length;
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

    const syncSemestersTable = async (orgId: string, academicYearId: number) => {
        try {
            await (supabase as any).from('semesters').upsert(
                [
                    {
                        organization_id: orgId,
                        academic_year_id: academicYearId,
                        name: 'Ganjil',
                        code: 'GANJIL',
                        start_date: formData.ganjil_start_date || null,
                        end_date: formData.ganjil_end_date || null,
                        status: formData.active_semester === 'Ganjil' ? 'active' : 'closed',
                        is_active: formData.active_semester === 'Ganjil',
                    },
                    {
                        organization_id: orgId,
                        academic_year_id: academicYearId,
                        name: 'Genap',
                        code: 'GENAP',
                        start_date: formData.genap_start_date || null,
                        end_date: formData.genap_end_date || null,
                        status: formData.active_semester === 'Genap' ? 'active' : 'draft',
                        is_active: formData.active_semester === 'Genap',
                    },
                ],
                { onConflict: 'organization_id,academic_year_id,code' }
            );
        } catch {
            // Abaikan bila tabel semesters V2 belum dimigrasikan
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const orgId = await getOrgId();
            let newId = editingId;

            if (editingId) {
                const updatePayload: any = {
                    name: formData.name,
                    active_semester: formData.active_semester,
                };

                const { error } = await supabase
                    .from('academic_years')
                    .update(updatePayload)
                    .eq('id', editingId)
                    .eq('organization_id', orgId);
                if (error) throw error;

                // Update kolom V2 (status & tanggal semester) secara aman
                try {
                    await (supabase as any)
                        .from('academic_years')
                        .update({
                            status: formData.status,
                            ganjil_start_date: formData.ganjil_start_date || null,
                            ganjil_end_date: formData.ganjil_end_date || null,
                            genap_start_date: formData.genap_start_date || null,
                            genap_end_date: formData.genap_end_date || null,
                        })
                        .eq('id', editingId)
                        .eq('organization_id', orgId);
                } catch {}
            } else {
                const isFirstYear = localAcademicYears.length === 0;
                const insertPayload: any = {
                    organization_id: orgId,
                    name: formData.name,
                    active_semester: formData.active_semester,
                    is_active: isFirstYear,
                };

                const { data, error } = await supabase
                    .from('academic_years')
                    .insert(insertPayload)
                    .select();
                if (error) throw error;
                if (data && data.length > 0) {
                    newId = data[0].id;
                    try {
                        await (supabase as any)
                            .from('academic_years')
                            .update({
                                status: isFirstYear ? 'active' : formData.status,
                                ganjil_start_date: formData.ganjil_start_date || null,
                                ganjil_end_date: formData.ganjil_end_date || null,
                                genap_start_date: formData.genap_start_date || null,
                                genap_end_date: formData.genap_end_date || null,
                            })
                            .eq('id', newId)
                            .eq('organization_id', orgId);
                    } catch {}
                }
            }

            if (newId && orgId) {
                const datesObject = {
                    Ganjil: { startDate: formData.ganjil_start_date, endDate: formData.ganjil_end_date },
                    Genap: { startDate: formData.genap_start_date, endDate: formData.genap_end_date },
                };
                await saveAppSetting(`SEMESTER_DATES_${newId}`, JSON.stringify(datesObject));
                await syncSemestersTable(orgId, newId);
            }

            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            setIsModalOpen(false);
            NotificationStore.addNotification('Konfigurasi Tahun Ajaran & Semester berhasil disimpan.', 'success');
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
            NotificationStore.addNotification('Tahun Ajaran berhasil dihapus.', 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal menghapus Tahun Ajaran.', 'error');
        }
    };

    const handleSetActive = async (id: number) => {
        try {
            const orgId = await getOrgId();
            await supabase.from('academic_years').update({ is_active: false }).eq('organization_id', orgId);
            try {
                await (supabase as any)
                    .from('academic_years')
                    .update({ status: 'setup' })
                    .eq('organization_id', orgId)
                    .eq('status', 'active');
            } catch {}

            await supabase.from('academic_years').update({ is_active: true }).eq('id', id).eq('organization_id', orgId);
            try {
                await (supabase as any)
                    .from('academic_years')
                    .update({ status: 'active' })
                    .eq('id', id)
                    .eq('organization_id', orgId);
            } catch {}

            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            NotificationStore.addNotification('Tahun Ajaran aktif berhasil diperbarui.', 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal mengaktifkan Tahun Ajaran.', 'error');
        }
    };

    const handleToggleSemester = async (ay: AcademicYear & { status?: AcademicYearLifecycleStatus }) => {
        if (ay.status === 'closed') {
            NotificationStore.addNotification('Tahun Ajaran yang telah ditutup tidak dapat diubah semesternya.', 'error');
            return;
        }
        const newSemester = ay.active_semester === 'Ganjil' ? 'Genap' : 'Ganjil';
        try {
            const orgId = await getOrgId();
            const { error } = await supabase
                .from('academic_years')
                .update({ active_semester: newSemester })
                .eq('id', ay.id)
                .eq('organization_id', orgId);
            if (error) throw error;

            try {
                await (supabase as any)
                    .from('semesters')
                    .update({ is_active: false, status: 'closed' })
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', ay.id);
                await (supabase as any)
                    .from('semesters')
                    .update({ is_active: true, status: 'active' })
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', ay.id)
                    .eq('name', newSemester);
            } catch {}

            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            NotificationStore.addNotification(`Semester aktif berhasil diubah ke ${newSemester}.`, 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal mengubah semester.', 'error');
        }
    };

    const handleConfirmCloseAcademicYear = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!closingTargetYear) return;
        setIsSubmitting(true);
        try {
            const orgId = await getOrgId();
            // Panggil RPC rekonsiliasi penutupan tahun ajaran (Fase 3 Blueprint)
            const { error: rpcError } = await (supabase as any).rpc('rpc_close_academic_year', {
                p_academic_year_id: closingTargetYear.id,
            });

            if (rpcError) {
                // Fallback jika RPC belum dieksekusi di DB
                await (supabase as any)
                    .from('academic_years')
                    .update({
                        status: 'closed',
                        is_active: false,
                        closed_at: new Date().toISOString(),
                    })
                    .eq('id', closingTargetYear.id)
                    .eq('organization_id', orgId);
            }

            setIsClosingModalOpen(false);
            setClosingTargetYear(null);
            setClosingReason('');
            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            NotificationStore.addNotification(
                `Tahun Ajaran ${closingTargetYear.name} resmi ditutup dan seluruh sesi terbuka telah dikunci.`,
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
        let startDate = (ay as any).start_date;
        let endDate = (ay as any).end_date;

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
                const { error } = await (supabase as any)
                    .from('master_marhalah')
                    .update({ nama: marhalahForm.nama.trim(), urutan: Number(marhalahForm.urutan) || 1 })
                    .eq('id', editingMarhalah.id)
                    .eq('organization_id', orgId);
                if (error) throw error;
                NotificationStore.addNotification('Data Marhalah berhasil diperbarui.', 'success');
            } else {
                const { error } = await (supabase as any)
                    .from('master_marhalah')
                    .insert({
                        organization_id: orgId,
                        nama: marhalahForm.nama.trim(),
                        urutan: Number(marhalahForm.urutan) || 1,
                    });
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

    const openKelasModal = (k: any | null, defaultMarhalahId?: number) => {
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
                urutan: (masterKelasRelasi?.filter((x: any) => x.marhalah_id === fallbackMId).length || 0) + 1,
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

            const basePayload: any = {
                marhalah_id: Number(kelasForm.marhalah_id),
                nama_kelas: kelasForm.nama_kelas.trim(),
                urutan: Number(kelasForm.urutan) || 1,
                wali_kelas_name: kelasForm.wali_kelas_name.trim() || null,
                wali_kelas_phone: kelasForm.wali_kelas_phone.trim() || null,
                musyrif_name: kelasForm.musyrif_name.trim() || null,
            };

            let savedKelasId = editingKelas?.id;

            if (editingKelas) {
                let { error } = await (supabase as any)
                    .from('master_kelas_relasi')
                    .update(basePayload)
                    .eq('id', editingKelas.id)
                    .eq('organization_id', orgId);

                if (error && error.message?.includes('column')) {
                    // Fallback jika kolom V2 belum dimigrasi
                    const { error: fallbackErr } = await (supabase as any)
                        .from('master_kelas_relasi')
                        .update({
                            marhalah_id: Number(kelasForm.marhalah_id),
                            nama_kelas: kelasForm.nama_kelas.trim(),
                            urutan: Number(kelasForm.urutan) || 1,
                        })
                        .eq('id', editingKelas.id)
                        .eq('organization_id', orgId);
                    error = fallbackErr;
                }
                if (error) throw error;
            } else {
                let { data, error } = await (supabase as any)
                    .from('master_kelas_relasi')
                    .insert({ ...basePayload, organization_id: orgId })
                    .select()
                    .single();

                if (error && error.message?.includes('column')) {
                    const res = await (supabase as any)
                        .from('master_kelas_relasi')
                        .insert({
                            organization_id: orgId,
                            marhalah_id: Number(kelasForm.marhalah_id),
                            nama_kelas: kelasForm.nama_kelas.trim(),
                            urutan: Number(kelasForm.urutan) || 1,
                        })
                        .select()
                        .single();
                    data = res.data;
                    error = res.error;
                }
                if (error) throw error;
                savedKelasId = data?.id;
            }

            // Sinkronisasi atribut administratif Wali Kelas ke tabel wali_kelas (untuk kompatibilitas raport)
            if (kelasForm.wali_kelas_name.trim() && selectedAcademicYear) {
                try {
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
                                marhalah_id: Number(kelasForm.marhalah_id),
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
                            marhalah_id: Number(kelasForm.marhalah_id),
                            kelas_id: savedKelasId || null,
                        });
                    }
                } catch {}
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
                kicker="FONDASI AKADEMIK & STRUKTUR LEMBAGA (FASE 6)"
                title="Tahun Ajaran, Semester & Struktur Marhalah/Kelas"
                description="Kelola siklus hidup tahun ajaran (Draft → Setup → Aktif → Rekonsiliasi → Ditutup), struktur berjenjang Marhalah & Kelas, serta atribut administratif Wali Kelas dan Musyrif."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {activeSection === 'years' ? (
                            <button
                                type="button"
                                onClick={() => openModal(null)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                            >
                                <Plus size={15} /> Tambah Tahun Ajaran
                            </button>
                        ) : (
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
                    </div>
                }
            />

            {/* Segmented Tab Switch: Siklus Tahun Ajaran vs Struktur Marhalah & Kelas */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2">
                <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
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
                </div>
                <div className="text-[11px] text-slate-500 px-2">
                    Sesuai Arsitektur 3-Role: <span className="font-semibold text-slate-700">Wali Kelas & Musyrif</span> dikelola sebagai atribut administratif kelas/santri.
                </div>
            </div>

            {activeSection === 'structure' ? (
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
                    {/* Ringkasan Kesiapan Tahun Ajaran Aktif */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Tahun Ajaran"
                    value={localAcademicYears.length}
                    meta="Terdaftar pada lembaga ini"
                    tone="neutral"
                />
                <StatCard
                    label="Santri Ter-Enroll (Aktif)"
                    value={enrollmentReadiness.enrolledSantri}
                    meta={`Dari ${enrollmentReadiness.totalMasterSantri} biodata induk santri`}
                    tone="success"
                />
                <StatCard
                    label="Belum Memiliki Enrollment"
                    value={enrollmentReadiness.unassignedCount}
                    meta={
                        enrollmentReadiness.unassignedCount === 0
                            ? 'Seluruh santri telah memiliki kelas'
                            : 'Tidak otomatis masuk roster sesi'
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
                            Peringatan Kesiapan Enrollment Tahun Ajaran
                        </div>
                        <p className="text-xs text-amber-700 mt-0.5">
                            Terdapat <span className="font-mono font-bold">{enrollmentReadiness.unassignedCount}</span> santri yang belum memiliki penempatan kelas (enrollment) aktif pada tahun ajaran ini. Sesuai standar integritas akademik, santri tanpa enrollment aktif tidak akan dimasukkan secara otomatis ke dalam roster sesi halaqah.
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
                                return (
                                    <tr key={ay.id} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 font-mono tabular-nums">
                                                {ay.name}
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
                                                {ay.is_active && !isClosed && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleSemester(ay)}
                                                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <RefreshCw size={13} /> Ganti ke {ay.active_semester === 'Ganjil' ? 'Genap' : 'Ganjil'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge label={badgeMeta.label} tone={badgeMeta.tone} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="inline-flex items-center justify-end gap-2">
                                                {!ay.is_active && !isClosed && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetActive(ay.id)}
                                                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors"
                                                    >
                                                        Aktifkan
                                                    </button>
                                                )}
                                                {!isClosed && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setClosingTargetYear(ay);
                                                            setClosingReason('');
                                                            setIsClosingModalOpen(true);
                                                        }}
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

            {/* Wizard Rekonsiliasi & Penutupan Tahun Ajaran (rpc_close_academic_year) */}
            <Modal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                title={`Rekonsiliasi & Penutupan Tahun Ajaran ${closingTargetYear?.name || ''}`}
            >
                <form onSubmit={handleConfirmCloseAcademicYear} className="space-y-4">
                    <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                        <div className="font-bold">Tindakan Rekonsiliasi Otomatis saat Tahun Ajaran Ditutup:</div>
                        <ul className="list-disc pl-4 space-y-1 text-amber-800">
                            <li>Mengunci seluruh sesi halaqah yang masih terbuka pada tahun ajaran ini.</li>
                            <li>Menutup masa berlaku keanggotaan halaqah (<span className="font-mono">valid_to</span>) dan enrollment tahunan.</li>
                            <li>Mencatat jejak penutupan ke <span className="font-mono">audit_logs</span> lembaga.</li>
                        </ul>
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
                            placeholder="Contoh: Seluruh ujian semester genap dan penerbitan raport TA 2025/2026 telah selesai."
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
                            disabled={isSubmitting || !closingReason.trim()}
                            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                            {isSubmitting ? 'Memproses Rekonsiliasi...' : 'Kunci & Tutup Tahun Ajaran'}
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
