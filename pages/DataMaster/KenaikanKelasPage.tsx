import React, { useState, useEffect, useMemo } from 'react';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { supabase } from '../../lib/supabaseClient';
import { Marhalah, Santri } from '../../types';
import { ArrowRight, Check, Search, AlertCircle, XCircle, ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react';

type PromotionActionType = 'promoted' | 'graduated' | 'transferred' | 'withdrawn';

const KenaikanKelasPage: React.FC = () => {
    const { santri, fetchData, getOrgId, masterKelas, masterMarhalahs, masterKelasRelasi } = useSupabaseData();
    const { academicYears, selectedAcademicYear } = useAcademicYear();

    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m: any) => m.nama), [masterMarhalahs]);

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
            const [{ data: v2Enrollments, error: v2Err }, { data: legacyClasses, error: legacyErr }] = await Promise.all([
                (supabase.from('student_enrollments' as any) as any)
                    .select('student_id, santri_id, marhalah, kelas, master_marhalah_id, master_kelas_id, status')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', tYearId),
                (supabase.from('student_classes' as any) as any)
                    .select('santri_id, marhalah, kelas')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', tYearId),
            ]);

            if (v2Err) throw v2Err;
            if (legacyErr) throw legacyErr;

            const mergedMap = new Map<number, { santri_id: number; marhalah: string; kelas: string; status?: string }>();
            (legacyClasses || []).forEach((row: any) => {
                mergedMap.set(Number(row.santri_id), {
                    santri_id: Number(row.santri_id),
                    marhalah: row.marhalah || '',
                    kelas: row.kelas || '',
                    status: 'active',
                });
            });
            (v2Enrollments || []).forEach((row: any) => {
                const sid = Number(row.student_id ?? row.santri_id);
                if (!sid) return;
                const mObj = (masterMarhalahs || []).find((m: any) => Number(m.id) === Number(row.master_marhalah_id));
                const kObj = (masterKelasRelasi || []).find((k: any) => Number(k.id) === Number(row.master_kelas_id));
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

            const [
                { data: v2Enrollments, error: v2Err },
                { data: classData, error: classError },
                { data: santriData, error: santriError },
            ] = await Promise.all([
                (supabase.from('student_enrollments' as any) as any)
                    .select('student_id, santri_id, marhalah, kelas, master_marhalah_id, master_kelas_id, status, left_at')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', sYearId),
                (supabase.from('student_classes' as any) as any)
                    .select('santri_id, marhalah, kelas, marhalah_id, kelas_id')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', sYearId),
                supabase.from('santri').select('*').eq('organization_id', orgId),
            ]);

            if (v2Err) throw v2Err;
            if (classError) throw classError;
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

            (classData || []).forEach((c: any) => {
                const sid = Number(c.santri_id);
                enrollmentMap.set(sid, {
                    santri_id: sid,
                    marhalah: c.marhalah || '',
                    kelas: c.kelas || '',
                    marhalah_id: c.marhalah_id || null,
                    kelas_id: c.kelas_id || null,
                    status: 'active',
                    left_at: null,
                });
            });

            (v2Enrollments || []).forEach((e: any) => {
                const sid = Number(e.student_id ?? e.santri_id);
                if (!sid) return;
                const existing = enrollmentMap.get(sid);
                const mObj = (masterMarhalahs || []).find((m: any) => Number(m.id) === Number(e.master_marhalah_id));
                const kObj = (masterKelasRelasi || []).find((k: any) => Number(k.id) === Number(e.master_kelas_id));
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
                const s = (santriData || []).find((x: any) => Number(x.id) === sid);
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
                p_master_marhalah_id: actionType === 'promoted' && mId ? Number(mId) : null,
                p_master_kelas_id: actionType === 'promoted' && kId ? Number(kId) : null,
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
            return <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold uppercase">Promoted</span>;
        }
        if (st === 'graduated') {
            return <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold uppercase">Graduated</span>;
        }
        if (st === 'transferred' || st === 'withdrawn') {
            return <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase">{st}</span>;
        }
        return <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">Active</span>;
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            {notification && (
                <div
                    className={`p-4 rounded-xl flex items-start gap-3 shadow-sm ${
                        notification.type === 'success'
                            ? 'bg-green-50 text-green-800 border border-green-200'
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

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4 mt-2">
                <div>
                    <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
                        Kenaikan Kelas, Kelulusan & Plotting Enrollment V2
                    </h1>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Promosikan atau luluskan santri antar tahun ajaran secara atomik tanpa menimpa histori kelas tahun ajaran lama (<span className="font-mono">student_enrollments</span>).
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-auto min-h-[500px]">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex flex-col gap-5">
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="w-full sm:w-1/2">
                                <label className="block text-[12px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                                    Tahun Ajaran Sumber (Lama)
                                </label>
                                <select
                                    className="w-full h-10 px-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] font-medium transition-all"
                                    value={sourceYearId}
                                    onChange={(e) => setSourceYearId(e.target.value ? Number(e.target.value) : '')}
                                >
                                    <option value="">-- Pilih Tahun Ajaran Sumber --</option>
                                    {academicYears.map((ay) => (
                                        <option key={ay.id} value={ay.id}>
                                            {ay.name} - {ay.active_semester} {ay.is_active ? '(Aktif)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-full sm:w-1/2 relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Cari nama / kelas asal..."
                                    className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] transition-all placeholder:text-slate-400"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    disabled={!sourceYearId}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="w-full sm:w-1/3">
                                <select
                                    className="w-full h-9 px-3 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-50 focus:border-blue-500 outline-none text-[12px] font-medium text-slate-700 transition-colors cursor-pointer"
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
                            </div>
                            <div className="w-full sm:w-1/3">
                                <select
                                    className="w-full h-9 px-3 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-50 focus:border-blue-500 outline-none text-[12px] font-medium text-slate-700 transition-colors cursor-pointer"
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
                            </div>
                            <div className="w-full sm:w-1/3">
                                <select
                                    className="w-full h-9 px-3 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-50 focus:border-blue-500 outline-none text-[12px] font-medium text-slate-700 transition-colors cursor-pointer"
                                    value={sourceStatus}
                                    onChange={(e) => setSourceStatus(e.target.value)}
                                    disabled={!sourceYearId || !targetYearId}
                                >
                                    <option value="all">Semua Status Plotting</option>
                                    <option value="unplotted">Belum Diplot di TA Tujuan</option>
                                    <option value="plotted">Sudah Diplot di TA Tujuan</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-0 min-h-[300px]">
                        {!sourceYearId ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center min-h-[300px]">
                                <AlertCircle size={48} className="mb-4 opacity-20" />
                                <p className="text-[13px] font-medium">
                                    Pilih Tahun Ajaran Sumber terlebih dahulu untuk melihat histori enrollment santri.
                                </p>
                            </div>
                        ) : loading ? (
                            <div className="h-full flex items-center justify-center min-h-[300px]">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-400 min-h-[300px]">
                                <p className="text-[13px] font-medium">Tidak ada santri ditemukan pada filter ini.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 z-10">
                                    <tr className="border-b border-slate-200/60 bg-slate-50/50">
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 w-12 text-center border-r border-slate-100/80">
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
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">
                                            Nama Santri
                                        </th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">
                                            Kelas Asal & Status Histori
                                        </th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">
                                            Status Enrollment di TA Tujuan
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80">
                                    {paginatedStudents.map((s) => (
                                        <tr
                                            key={s.id}
                                            className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                            onClick={() => handleSelectStudent(s.id)}
                                        >
                                            <td
                                                className="px-6 py-3.5 border-r border-slate-100/80 text-center"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                                    checked={selectedStudentIds.includes(s.id)}
                                                    onChange={() => handleSelectStudent(s.id)}
                                                />
                                            </td>
                                            <td className="px-6 py-3.5 border-l border-slate-100/80">
                                                <div className="text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                                    {s.nama}
                                                </div>
                                                {s.nis && (
                                                    <div className="text-[11px] font-mono text-slate-400">NIS: {s.nis}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-3.5 border-l border-slate-100/80">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 tracking-widest uppercase border border-slate-200">
                                                        <KelasLabel text={s.kelas} id={s.kelas_id} />{' '}
                                                        <span className="text-slate-400 ml-1 font-semibold">
                                                            (<MarhalahLabel text={s.marhalah} id={s.marhalah_id} />)
                                                        </span>
                                                    </span>
                                                    {renderSourceEnrollmentStatusBadge(s.source_enrollment_status)}
                                                    {s.source_left_at && (
                                                        <span className="text-[10px] font-mono text-slate-400">
                                                            ({s.source_left_at})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 border-l border-slate-100/80">
                                                {targetYearClasses.some((tc) => tc.santri_id === s.id) ? (
                                                    <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 tracking-widest border border-emerald-200/60 uppercase">
                                                        Ter-Enroll ({targetYearClasses.find((tc) => tc.santri_id === s.id)?.kelas})
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700 tracking-widest border border-rose-200/60 uppercase">
                                                        Belum Ter-Enroll
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
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <span className="text-[13px] font-medium text-slate-600">
                                Terpilih: <span className="text-blue-600 font-extrabold">{selectedStudentIds.length}</span> dari{' '}
                                <span className="font-bold">{filteredStudents.length}</span> santri
                            </span>
                            {filteredStudents.length > itemsPerPage && (
                                <div className="inline-flex items-center gap-1.5 text-xs">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span className="px-2 font-mono text-slate-600">
                                        Hal {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handlePromoteClick}
                            disabled={loading || selectedStudentIds.length === 0}
                            className="w-full sm:w-auto px-6 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ArrowRight size={16} strokeWidth={2.5} className="mr-2" />
                            Proses Kenaikan / Kelulusan
                        </button>
                    </div>
                </div>
            </div>

            {/* Target Selection & Confirmation Modal */}
            <Modal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="Proses Transisi Akademik Santri (V2)">
                <div className="space-y-5">
                    <p className="text-slate-600 text-xs">
                        Anda akan memproses <span className="font-bold text-slate-900">{selectedStudentIds.length} santri</span> dari Tahun Ajaran sumber. Histori kelas pada tahun ajaran lama akan tetap tersimpan utuh di <span className="font-mono">student_enrollments</span>.
                    </p>

                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Jenis Keputusan Akademik
                            </label>
                            <select
                                className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white outline-none focus:border-blue-500 text-[13px] font-semibold text-slate-800 cursor-pointer"
                                value={actionType}
                                onChange={(e) => setActionType(e.target.value as PromotionActionType)}
                            >
                                <option value="promoted">Naik Kelas / Plotting ke Tahun Ajaran Baru (Promoted)</option>
                                <option value="graduated">Lulus dari Lembaga (Graduated)</option>
                                <option value="transferred">Pindah Lembaga / Mutasi Keluar (Transferred)</option>
                                <option value="withdrawn">Berhenti / Mengundurkan Diri (Withdrawn)</option>
                            </select>
                        </div>

                        {actionType === 'promoted' ? (
                            <>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Tahun Ajaran Tujuan
                                    </label>
                                    <select
                                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white outline-none focus:border-blue-500 text-[13px] font-semibold text-slate-800 cursor-pointer"
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
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Marhalah Tujuan
                                    </label>
                                    <select
                                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white outline-none focus:border-blue-500 text-[13px] font-semibold text-slate-800 cursor-pointer"
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
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Kelas Tujuan
                                    </label>
                                    <div className="flex flex-col gap-3">
                                        <select
                                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white outline-none focus:border-blue-500 text-[13px] font-semibold text-slate-800 cursor-pointer"
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
                                                className="w-full border border-blue-300 rounded-xl px-4 py-2.5 bg-blue-50/50 outline-none focus:border-blue-500 text-[13px] font-semibold text-blue-900"
                                                value={customTargetKelas}
                                                onChange={(e) => setCustomTargetKelas(e.target.value)}
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>

                                {sourceYearId === targetYearId && sourceYearId !== '' && (
                                    <p className="text-[12px] font-bold text-red-500 mt-1">
                                        Tahun ajaran sumber dan tujuan tidak boleh sama.
                                    </p>
                                )}
                            </>
                        ) : (
                            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                                <GraduationCap size={16} className="text-amber-700 mt-0.5 shrink-0" />
                                <div>
                                    Enrollment santri terpilih pada Tahun Ajaran sumber akan ditandai sebagai{' '}
                                    <span className="font-mono font-bold uppercase">{actionType}</span> dengan tanggal selesai hari ini, dan santri tidak akan di-enroll otomatis ke Tahun Ajaran baru.
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
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
                            className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
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
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
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
