import React, { useState, useEffect, useMemo } from 'react';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { supabase } from '../../lib/supabaseClient';
import { Marhalah, Santri } from '../../types';
import { ArrowRight, Check, Search, AlertCircle, XCircle, ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react';
import { PageHeader } from '../../components/ui/SaaSPrimitives';

type PromotionActionType = 'promoted' | 'graduated' | 'transferred' | 'withdrawn';

const KenaikanKelasPage: React.FC = () => {
    const { santri, fetchData, getOrgId, masterKelas, masterMarhalahs, masterKelasRelasi } = useSupabaseData();
    const { academicYears, selectedAcademicYear } = useAcademicYear();

    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m) => m.nama), [masterMarhalahs]);

    const [sourceYearId, setSourceYearId] = useState<number | ''>('');
    const [targetYearId, setTargetYearId] = useState<number | ''>('');
    const [actionType, setActionType] = useState<PromotionActionType>('promoted');
    const [actionNotes, setActionNotes] = useState('');

    const [sourceStudents, setSourceStudents] = useState<(Santri & { source_enrollment_status?: string; source_left_at?: string | null })[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
    const [targetYearClasses, setTargetYearClasses] = useState<{ santri_id: number; marhalah: string; kelas: string; status?: string }[]>([]);

    const [targetMarhalah, setTargetMarhalah] = useState<Marhalah>(Marhalah.Mutawassithah);
    const [targetKelas, setTargetKelas] = useState<string>('');
    const [isCustomTargetKelas, setIsCustomTargetKelas] = useState(false);
    const [customTargetKelas, setCustomTargetKelas] = useState('');

    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Filters & Pagination
    const [sourceMarhalah, setSourceMarhalah] = useState<string>('');
    const [sourceKelas, setSourceKelas] = useState<string>('');
    const [sourceStatus, setSourceStatus] = useState<string>('all'); // 'all', 'plotted', 'unplotted'
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 25;

    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    useEffect(() => {
        if (selectedAcademicYear) {
            setTargetYearId(selectedAcademicYear.id);
        }
    }, [selectedAcademicYear]);

    const fetchTargetEnrollments = async (tYearId: number | '') => {
        if (!tYearId) {
            setTargetYearClasses([]);
            return;
        }
        try {
            const orgId = await getOrgId();
            // Fase 2: hanya student_enrollments (tabel lama student_classes sudah diarsipkan)
            const { data: v2Enrollments, error: v2Err } = await (supabase.from('student_enrollments' as any) as any)
                .select('student_id, santri_id, marhalah, kelas, master_marhalah_id, master_kelas_id, status')
                .eq('organization_id', orgId)
                .eq('academic_year_id', tYearId);

            if (v2Err) throw v2Err;

            const mergedMap = new Map<number, { santri_id: number; marhalah: string; kelas: string; status?: string }>();
            (v2Enrollments || []).forEach((row) => {
                const sid = Number(row.student_id ?? row.santri_id);
                if (!sid) return;
                const mObj = (masterMarhalahs || []).find((m) => Number(m.id) === Number(row.master_marhalah_id));
                const kObj = (masterKelasRelasi || []).find((k) => Number(k.id) === Number(row.master_kelas_id));
                mergedMap.set(sid, {
                    santri_id: sid,
                    marhalah: row.marhalah || mObj?.nama || mergedMap.get(sid)?.marhalah || '',
                    kelas: row.kelas || kObj?.nama_kelas || mergedMap.get(sid)?.kelas || '',
                    status: row.status || 'active',
                });
            });

            setTargetYearClasses(Array.from(mergedMap.values()));
        } catch (e: any) {
            setNotification({ type: 'error', message: `Gagal memuat data enrollment tujuan: ${e.message}` });
        }
    };

    useEffect(() => {
        fetchTargetEnrollments(targetYearId);
    }, [targetYearId, masterMarhalahs, masterKelasRelasi]);

    const fetchSourceStudents = async (sYearId: number | '') => {
        if (!sYearId) {
            setSourceStudents([]);
            return;
        }
        setLoading(true);
        try {
            const orgId = await getOrgId();

            // Fase 2: hanya student_enrollments (tabel lama student_classes sudah diarsipkan)
            const [
                { data: v2Enrollments, error: v2Err },
                { data: santriData, error: santriError },
            ] = await Promise.all([
                (supabase.from('student_enrollments' as any) as any)
                    .select('student_id, santri_id, marhalah, kelas, master_marhalah_id, master_kelas_id, status, left_at')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', sYearId),
                supabase.from('santri').select('*').eq('organization_id', orgId),
            ]);

            if (v2Err) throw v2Err;
            if (santriError) throw santriError;

            const enrollmentMap = new Map<
                number,
                {
                    santri_id: number;
                    marhalah: string;
                    kelas: string;
                    marhalah_id: number | null;
                    kelas_id: number | null;
                    status: string;
                    left_at: string | null;
                }
            >();


            (v2Enrollments || []).forEach((e) => {
                const sid = Number(e.student_id ?? e.santri_id);
                if (!sid) return;
                const existing = enrollmentMap.get(sid);
                const mObj = (masterMarhalahs || []).find((m) => Number(m.id) === Number(e.master_marhalah_id));
                const kObj = (masterKelasRelasi || []).find((k) => Number(k.id) === Number(e.master_kelas_id));
                enrollmentMap.set(sid, {
                    santri_id: sid,
                    marhalah: e.marhalah || mObj?.nama || existing?.marhalah || 'Mutawassithah',
                    kelas: e.kelas || kObj?.nama_kelas || existing?.kelas || '-',
                    marhalah_id: e.master_marhalah_id || existing?.marhalah_id || null,
                    kelas_id: e.master_kelas_id || existing?.kelas_id || null,
                    status: e.status || 'active',
                    left_at: e.left_at || null,
                });
            });

            const merged: (Santri & { source_enrollment_status?: string; source_left_at?: string | null })[] = [];
            enrollmentMap.forEach((enr, sid) => {
                const s = (santriData || []).find((x) => Number(x.id) === sid);
                if (s) {
                    merged.push({
                        ...(s as any),
                        marhalah_id: enr.marhalah_id || (s as any).marhalah_id,
                        kelas_id: enr.kelas_id || (s as any).kelas_id,
                        marhalah: (enr.marhalah || (s as any).marhalah) as Marhalah,
                        kelas: enr.kelas || (s as any).kelas,
                        source_enrollment_status: enr.status,
                        source_left_at: enr.left_at,
                    });
                }
            });

            setSourceStudents(merged.sort((a, b) => (a.nama || '').localeCompare(b.nama || '')));
            setSelectedStudentIds([]);
            setCurrentPage(1);
        } catch (e: any) {
            setNotification({ type: 'error', message: `Gagal mengambil data enrollment tahun ajaran sumber: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSourceStudents(sourceYearId);
    }, [sourceYearId]);

    const filteredStudents = useMemo(() => {
        return sourceStudents.filter((s) => {
            const matchSearch =
                s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.kelas.toLowerCase().includes(searchQuery.toLowerCase());
            const matchMarhalah = sourceMarhalah ? s.marhalah === sourceMarhalah : true;
            const matchKelas = sourceKelas ? s.kelas === sourceKelas : true;

            let matchStatus = true;
            if (sourceStatus === 'plotted') {
                matchStatus = targetYearClasses.some((tc) => tc.santri_id === s.id);
            } else if (sourceStatus === 'unplotted') {
                matchStatus = !targetYearClasses.some((tc) => tc.santri_id === s.id);
            }

            return matchSearch && matchMarhalah && matchKelas && matchStatus;
        });
    }, [sourceStudents, searchQuery, sourceMarhalah, sourceKelas, sourceStatus, targetYearClasses]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, sourceMarhalah, sourceKelas, sourceStatus]);

    const totalPages = Math.max(1, Math.ceil(filteredStudents.length / itemsPerPage));
    const paginatedStudents = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredStudents.slice(start, start + itemsPerPage);
    }, [filteredStudents, currentPage]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedStudentIds(filteredStudents.map((s) => s.id));
        } else {
            setSelectedStudentIds([]);
        }
    };

    const handleSelectStudent = (id: number) => {
        setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handlePromoteClick = () => {
        if (selectedStudentIds.length === 0) {
            return setNotification({ type: 'error', message: 'Pilih minimal 1 santri!' });
        }
        setActionType('promoted');
        setActionNotes('');
        setIsCustomTargetKelas(false);
        setCustomTargetKelas('');
        setConfirmModalOpen(true);
    };

    // Eksekusi Promosi / Kelulusan / Mutasi / Berhenti via Server RPC Atomik rpc_promote_or_graduate_students
    const executePromote = async () => {
        const finalTargetKelas = isCustomTargetKelas ? customTargetKelas.trim() : targetKelas;
        if (actionType === 'promoted') {
            if (!targetYearId) return setNotification({ type: 'error', message: 'Pilih Tahun Ajaran Tujuan!' });
            if (!finalTargetKelas) return setNotification({ type: 'error', message: 'Pilih Kelas Tujuan!' });
            if (sourceYearId && Number(sourceYearId) === Number(targetYearId)) {
                return setNotification({ type: 'error', message: 'Tahun ajaran sumber dan tujuan tidak boleh sama untuk promosi kelas.' });
            }
        }

        setConfirmModalOpen(false);
        setLoading(true);
        try {
            const mId = masterMarhalahs?.find((m) => m.nama === targetMarhalah)?.id ?? null;
            const kId = masterKelasRelasi?.find((k) => k.nama_kelas === finalTargetKelas && k.marhalah_id === mId)?.id ?? null;

            const { data: rpcResult, error: rpcError } = await (supabase as any).rpc('rpc_promote_or_graduate_students', {
                p_source_academic_year_id: sourceYearId ? Number(sourceYearId) : null,
                p_target_academic_year_id: actionType === 'promoted' && targetYearId ? Number(targetYearId) : null,
                p_student_ids: selectedStudentIds,
                p_action: actionType,
                p_target_marhalah: actionType === 'promoted' ? targetMarhalah : null,
                p_target_kelas: actionType === 'promoted' ? finalTargetKelas : null,
                p_master_marhalah_id: actionType === 'promoted' && mId ? String(mId) : null,
                p_master_kelas_id: actionType === 'promoted' && kId ? String(kId) : null,
                p_notes: actionNotes.trim() || null,
            });

            if (rpcError) {
                throw new Error(rpcError.message || 'Server menolak transaksi promosi/kelulusan santri.');
            }

            const actionLabel =
                actionType === 'promoted'
                    ? `Berhasil mempromosikan ${rpcResult?.processed_count || selectedStudentIds.length} santri ke kelas ${finalTargetKelas} dengan mempertahankan histori tahun ajaran asal.`
                    : actionType === 'graduated'
                    ? `Berhasil meluluskan ${rpcResult?.processed_count || selectedStudentIds.length} santri dan mengunci histori tahun ajaran asal.`
                    : `Berhasil mencatat status ${actionType} untuk ${rpcResult?.processed_count || selectedStudentIds.length} santri.`;

            setNotification({ type: 'success', message: actionLabel });
            setSelectedStudentIds([]);

            await fetchSourceStudents(sourceYearId);
            await fetchTargetEnrollments(targetYearId);
            await fetchData();
        } catch (e: any) {
            setNotification({ type: 'error', message: `Gagal memproses santri: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    const availableSourceKelas = React.useMemo(() => {
        if (!sourceMarhalah) return [];
        const dynamicKelas = sourceStudents.filter((s) => s.marhalah === sourceMarhalah).map((s) => s.kelas);
        return Array.from(new Set(dynamicKelas)).sort();
    }, [sourceMarhalah, sourceStudents]);

    const availableTargetKelas = React.useMemo(() => {
        if (!targetMarhalah) return [];
        const staticKelas = masterKelas.filter((m) => m.marhalah === targetMarhalah).map((m) => m.nama_kelas);
        const dynamicKelas = santri
            .filter((s) => s.marhalah === targetMarhalah && s.kelas !== '-')
            .map((s) => s.kelas);
        return Array.from(new Set([...staticKelas, ...dynamicKelas])).sort();
    }, [targetMarhalah, santri, masterKelas]);

    const renderSourceEnrollmentStatusBadge = (status?: string) => {
        const st = status || 'active';
        if (st === 'promoted') {
            return <span className="badge badge-biru">Naik kelas</span>;
        }
        if (st === 'graduated') {
            return <span className="badge badge-netral">Lulus</span>;
        }
        if (st === 'transferred') {
            return <span className="badge badge-kuning">Pindah</span>;
        }
        if (st === 'withdrawn') {
            return <span className="badge badge-kuning">Berhenti</span>;
        }
        return <span className="badge badge-hijau">Aktif</span>;
    };

    return (
        <div className="space-y-5 pb-12 font-sans">
            {notification && (
                <div
                    className={`p-4 rounded-2xl flex items-start gap-3 shadow-xs ${
                        notification.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                >
                    {notification.type === 'success' ? (
                        <Check size={20} className="mt-0.5" />
                    ) : (
                        <AlertCircle size={20} className="mt-0.5" />
                    )}
                    <div className="flex-1">
                        <p className="font-medium text-sm">{notification.message}</p>
                    </div>
                    <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
                        <XCircle size={20} />
                    </button>
                </div>
            )}

            <PageHeader
                title="Kenaikan Kelas & Kelulusan"
                description="Naikkan kelas atau luluskan santri ke tahun ajaran berikutnya. Riwayat kelas tahun lalu tetap tersimpan."
            />

            <div className="panel-filter space-y-3">
                <div className="grid-filter sm:grid-cols-2 lg:grid-cols-2">
                    <label className="kontrol-label">
                        <span>TA Sumber</span>
                        <select
                            className="kontrol-dalam"
                            value={sourceYearId}
                            onChange={(e) => setSourceYearId(e.target.value ? Number(e.target.value) : '')}
                        >
                            <option value="">Pilih Tahun Ajaran Sumber…</option>
                            {academicYears.map((ay) => (
                                <option key={ay.id} value={ay.id}>
                                    {ay.name} - {ay.active_semester} {ay.is_active ? '(Aktif)' : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                    <input
                        type="text"
                        placeholder="Cari nama / kelas asal..."
                        className="kontrol kontrol-cari"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={!sourceYearId}
                    />
                </div>
                <div className="grid-filter sm:grid-cols-3 lg:grid-cols-3">
                    <select
                        className="kontrol"
                        value={sourceMarhalah}
                        onChange={(e) => {
                            setSourceMarhalah(e.target.value);
                            setSourceKelas('');
                        }}
                        disabled={!sourceYearId}
                    >
                        <option value="">Semua Marhalah</option>
                        {globalMarhalahs.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                    <select
                        className="kontrol"
                        value={sourceKelas}
                        onChange={(e) => setSourceKelas(e.target.value)}
                        disabled={!sourceYearId || !sourceMarhalah}
                    >
                        <option value="">Semua Kelas</option>
                        {sourceMarhalah &&
                            availableSourceKelas.map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                    </select>
                    <select
                        className="kontrol"
                        value={sourceStatus}
                        onChange={(e) => setSourceStatus(e.target.value)}
                        disabled={!sourceYearId || !targetYearId}
                    >
                        <option value="all">Semua Status Penempatan</option>
                        <option value="unplotted">Belum Ditempatkan di TA Tujuan</option>
                        <option value="plotted">Sudah Ditempatkan di TA Tujuan</option>
                    </select>
                </div>
            </div>

            <div className="wadah-tabel flex flex-col h-auto min-h-[420px]">
                <div className="flex-1 overflow-auto p-0 min-h-[300px]">
                    {!sourceYearId ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center min-h-[300px]">
                            <AlertCircle size={40} className="mb-3 opacity-30" />
                            <p className="text-sm font-medium">
                                Pilih Tahun Ajaran Sumber terlebih dahulu untuk melihat riwayat kelas santri.
                            </p>
                        </div>
                    ) : loading ? (
                        <div className="h-full flex items-center justify-center min-h-[300px]">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-400 min-h-[300px]">
                            <p className="text-sm font-medium">Tidak ada santri ditemukan pada filter ini.</p>
                        </div>
                    ) : (
                        <table className="tabel tabel-kartu">
                                <thead className="sticky top-0 z-10">
                                    <tr>
                                        <th className="w-12 text-center">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                checked={
                                                    selectedStudentIds.length === filteredStudents.length &&
                                                    filteredStudents.length > 0
                                                }
                                                onChange={handleSelectAll}
                                            />
                                        </th>
                                        <th>
                                            Nama Santri
                                        </th>
                                        <th>
                                            Kelas Asal & Status Histori
                                        </th>
                                        <th>
                                            Status kelas di TA tujuan
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedStudents.map((s) => (
                                        <tr
                                            key={s.id}
                                            className="cursor-pointer"
                                            onClick={() => handleSelectStudent(s.id)}
                                        >
                                            <td
                                                className="text-center"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                                    checked={selectedStudentIds.includes(s.id)}
                                                    onChange={() => handleSelectStudent(s.id)}
                                                />
                                            </td>
                                            <td>
                                                <div className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                                    {s.nama}
                                                </div>
                                                {s.nis && (
                                                    <div className="text-2xs font-mono text-slate-400">NIS: {s.nis}</div>
                                                )}
                                            </td>
                                            <td data-label="Kelas Asal">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="badge badge-netral">
                                                        <KelasLabel text={s.kelas} id={s.kelas_id} />{' '}
                                                        <span className="text-slate-400 font-medium">
                                                            (<MarhalahLabel text={s.marhalah} id={s.marhalah_id} />)
                                                        </span>
                                                    </span>
                                                    {renderSourceEnrollmentStatusBadge(s.source_enrollment_status)}
                                                    {s.source_left_at && (
                                                        <span className="text-2xs font-mono text-slate-400">
                                                            ({s.source_left_at})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td data-label="Status TA Tujuan">
                                                {targetYearClasses.some((tc) => tc.santri_id === s.id) ? (
                                                    <span className="badge badge-hijau">
                                                        Terdaftar ({targetYearClasses.find((tc) => tc.santri_id === s.id)?.kelas})
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-merah">
                                                        Belum Ditempatkan
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination & Action Footer */}
                    <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <span className="text-sm font-medium text-slate-600">
                                Terpilih: <span className="text-blue-600 font-bold tabular-nums">{selectedStudentIds.length}</span> dari{' '}
                                <span className="font-bold tabular-nums">{filteredStudents.length}</span> santri
                            </span>
                            {filteredStudents.length > itemsPerPage && (
                                <div className="inline-flex items-center gap-1.5 text-xs">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        className="btn-icon border border-slate-200 bg-white disabled:opacity-40"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span className="px-2 text-slate-600 tabular-nums">
                                        Hal {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        className="btn-icon border border-slate-200 bg-white disabled:opacity-40"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handlePromoteClick}
                            disabled={loading || selectedStudentIds.length === 0}
                            className="btn btn-primary w-full sm:w-auto justify-center"
                        >
                            <ArrowRight size={16} strokeWidth={2.5} />
                            Proses Kenaikan / Kelulusan
                        </button>
                    </div>
            </div>

            {/* Target Selection & Confirmation Modal */}
            <Modal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="Proses Transisi Akademik Santri">
                <div className="space-y-5">
                    <p className="text-slate-600 text-xs">
                        Anda akan memproses <span className="font-bold text-slate-900">{selectedStudentIds.length} santri</span> dari Tahun Ajaran sumber. Riwayat kelas pada tahun ajaran lama tetap tersimpan.
                    </p>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                        <div>
                            <label className="field-label">
                                Jenis Keputusan Akademik
                            </label>
                            <select
                                className="field font-medium"
                                value={actionType}
                                onChange={(e) => setActionType(e.target.value as PromotionActionType)}
                            >
                                <option value="promoted">Naik Kelas / Penempatan ke Tahun Ajaran Baru</option>
                                <option value="graduated">Lulus dari Lembaga</option>
                                <option value="transferred">Pindah Lembaga / Mutasi Keluar</option>
                                <option value="withdrawn">Berhenti / Mengundurkan Diri</option>
                            </select>
                        </div>

                        {actionType === 'promoted' ? (
                            <>
                                <div>
                                    <label className="field-label">
                                        Tahun Ajaran Tujuan
                                    </label>
                                    <select
                                        className="field font-medium"
                                        value={targetYearId}
                                        onChange={(e) => setTargetYearId(e.target.value ? Number(e.target.value) : '')}
                                    >
                                        <option value="">-- Pilih Tahun Ajaran Tujuan --</option>
                                        {academicYears.map((ay) => (
                                            <option key={ay.id} value={ay.id}>
                                                {ay.name} - {ay.active_semester} {ay.is_active ? '(Aktif)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-2">
                                        Marhalah Tujuan
                                    </label>
                                    <select
                                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white outline-none focus:border-blue-500 text-sm font-semibold text-slate-800 cursor-pointer"
                                        value={targetMarhalah}
                                        onChange={(e) => {
                                            setTargetMarhalah(e.target.value as Marhalah);
                                            setTargetKelas('');
                                        }}
                                    >
                                        {globalMarhalahs.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-2">
                                        Kelas Tujuan
                                    </label>
                                    <div className="flex flex-col gap-3">
                                        <select
                                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white outline-none focus:border-blue-500 text-sm font-semibold text-slate-800 cursor-pointer"
                                            value={isCustomTargetKelas ? 'NEW_CLASS' : targetKelas}
                                            onChange={(e) => {
                                                if (e.target.value === 'NEW_CLASS') {
                                                    setIsCustomTargetKelas(true);
                                                    setTargetKelas('');
                                                } else {
                                                    setIsCustomTargetKelas(false);
                                                    setTargetKelas(e.target.value);
                                                }
                                            }}
                                        >
                                            <option value="">-- Pilih Kelas --</option>
                                            {availableTargetKelas.map((k) => (
                                                <option key={k} value={k}>
                                                    {k}
                                                </option>
                                            ))}
                                            <option value="NEW_CLASS" className="font-extrabold text-blue-600">
                                                + Buat Kelas Baru
                                            </option>
                                        </select>
                                        {isCustomTargetKelas && (
                                            <input
                                                type="text"
                                                placeholder="Ketik nama kelas baru..."
                                                className="w-full border border-blue-300 rounded-xl px-4 py-2.5 bg-blue-50/50 outline-none focus:border-blue-500 text-sm font-semibold text-blue-900"
                                                value={customTargetKelas}
                                                onChange={(e) => setCustomTargetKelas(e.target.value)}
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>

                                {sourceYearId === targetYearId && sourceYearId !== '' && (
                                    <p className="text-xs font-bold text-red-500 mt-1">
                                        Tahun ajaran sumber dan tujuan tidak boleh sama.
                                    </p>
                                )}
                            </>
                        ) : (
                            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                                <GraduationCap size={16} className="text-amber-700 mt-0.5 shrink-0" />
                                <div>
                                    Enrollment santri terpilih pada Tahun Ajaran sumber akan ditandai sebagai{' '}
                                    <span className="font-bold uppercase">{actionType}</span> dengan tanggal selesai hari ini, dan santri tidak akan di-enroll otomatis ke Tahun Ajaran baru.
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                Catatan Transisi Akademik (Opsional)
                            </label>
                            <input
                                type="text"
                                placeholder="Contoh: Kenaikan kelas reguler akhir tahun ajaran..."
                                value={actionNotes}
                                onChange={(e) => setActionNotes(e.target.value)}
                                className="w-full border border-slate-200/80 rounded-xl px-4 py-2 bg-white text-xs text-slate-800 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80">
                        <button
                            onClick={() => setConfirmModalOpen(false)}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            Batal
                        </button>
                        <button
                            onClick={executePromote}
                            disabled={
                                loading ||
                                (actionType === 'promoted' &&
                                    (!targetYearId ||
                                        (!targetKelas && !isCustomTargetKelas) ||
                                        (isCustomTargetKelas && !customTargetKelas.trim()) ||
                                        sourceYearId === targetYearId))
                            }
                            className="btn btn-primary justify-center min-w-[140px]"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>{' '}
                                    Memproses...
                                </>
                            ) : (
                                <>
                                    <Check size={16} strokeWidth={2.5} /> Konfirmasi Eksekusi
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default KenaikanKelasPage;
