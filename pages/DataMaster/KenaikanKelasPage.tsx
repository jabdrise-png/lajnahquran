import React, { useState, useEffect, useMemo } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { supabase } from '../../lib/supabaseClient';
import { Marhalah, Santri } from '../../types';
import { ArrowRight, Check, Search, AlertCircle, XCircle, ChevronRight } from 'lucide-react';

const KenaikanKelasPage: React.FC = () => {
    const { santri, fetchData, getOrgId, masterKelas , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    const { academicYears, selectedAcademicYear } = useAcademicYear();

    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m: any) => m.nama), [masterMarhalahs]);

    const [sourceYearId, setSourceYearId] = useState<number | ''>('');
    const [targetYearId, setTargetYearId] = useState<number | ''>('');
    
    const [sourceStudents, setSourceStudents] = useState<Santri[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
    const [targetYearClasses, setTargetYearClasses] = useState<{santri_id: number, marhalah: string, kelas: string}[]>([]);
    
    const [targetMarhalah, setTargetMarhalah] = useState<Marhalah>(Marhalah.Mutawassithah);
    const [targetKelas, setTargetKelas] = useState<string>('');
    const [isCustomTargetKelas, setIsCustomTargetKelas] = useState(false);
    const [customTargetKelas, setCustomTargetKelas] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Filters
    const [sourceMarhalah, setSourceMarhalah] = useState<string>('');
    const [sourceKelas, setSourceKelas] = useState<string>('');
    const [sourceStatus, setSourceStatus] = useState<string>('all'); // 'all', 'plotted', 'unplotted'

    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

    // Auto-hide notification
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Set default target year to current active year
    useEffect(() => {
        if (selectedAcademicYear) {
            setTargetYearId(selectedAcademicYear.id);
        }
    }, [selectedAcademicYear]);

    // Fetch target year classes to know who is already plotted
    useEffect(() => {
        const fetchTargetClasses = async () => {
            if (!targetYearId) {
                setTargetYearClasses([]);
                return;
            }
            try {
                const orgId = await getOrgId();
                const { data, error } = await (supabase.from('student_classes' as any) as any)
                    .select('santri_id, marhalah, kelas')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', targetYearId);
                
                if (error) throw error;
                setTargetYearClasses(data || []);
            } catch (e) {
                console.error("Error fetching target classes:", e);
            }
        };
        fetchTargetClasses();
    }, [targetYearId]);

    // Fetch students from source year
    useEffect(() => {
        const fetchSourceStudents = async () => {
            if (!sourceYearId) {
                setSourceStudents([]);
                return;
            }
            setLoading(true);
            try {
                const orgId = await getOrgId();
                
                // Fetch student_classes for source year
                const { data: classData, error: classError } = await (supabase.from('student_classes' as any) as any)
                    .select('santri_id, marhalah, kelas, marhalah_id, kelas_id')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', sourceYearId);
                
                if (classError) throw classError;

                // Fetch all santri
                const { data: santriData, error: santriError } = await supabase
                    .from('santri')
                    .select('*')
                    .eq('organization_id', orgId);
                
                if (santriError) throw santriError;

                // Merge
                const merged: Santri[] = [];
                if (classData && santriData) {
                    classData.forEach((c: any) => {
                        const s = santriData.find(x => x.id === c.santri_id);
                        if (s) {
                            merged.push({
                                ...(s as any),
                                marhalah_id: c.marhalah_id || (s as any).marhalah_id,
                                kelas_id: c.kelas_id || (s as any).kelas_id,
                                marhalah: c.marhalah as Marhalah,
                                kelas: c.kelas
                            });
                        }
                    });
                }
                
                setSourceStudents(merged.sort((a, b) => (a.nama || '').localeCompare(b.nama || '')));
                setSelectedStudentIds([]); // Reset selection
            } catch (e: any) {
                console.error("Error fetching source students:", e);
                setNotification({ type: 'error', message: "Gagal mengambil data santri dari tahun ajaran sumber." });
            } finally {
                setLoading(false);
            }
        };

        fetchSourceStudents();
    }, [sourceYearId]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedStudentIds(filteredStudents.map(s => s.id));
        } else {
            setSelectedStudentIds([]);
        }
    };

    const handleSelectStudent = (id: number) => {
        setSelectedStudentIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handlePromoteClick = () => {
        if (selectedStudentIds.length === 0) return setNotification({ type: 'error', message: "Pilih minimal 1 santri!" });
        setIsCustomTargetKelas(false);
        setCustomTargetKelas('');
        setConfirmModalOpen(true);
    };

    const executePromote = async () => {
        const finalTargetKelas = isCustomTargetKelas ? customTargetKelas : targetKelas;
        if (!finalTargetKelas) return setNotification({ type: 'error', message: "Pilih Kelas Tujuan!" });

        setConfirmModalOpen(false);
        setLoading(true);
        try {
            const orgId = await getOrgId();
            
            // Prepare data
            const mId = masterMarhalahs?.find(m => m.nama === targetMarhalah)?.id;
            const kId = masterKelasRelasi?.find(k => k.nama_kelas === finalTargetKelas && k.marhalah_id === mId)?.id;

            const payload = selectedStudentIds.map(id => ({
                organization_id: orgId,
                academic_year_id: targetYearId,
                santri_id: id,
                marhalah_id: mId || null,
                kelas_id: kId || null,
                marhalah: targetMarhalah,
                kelas: finalTargetKelas
            }));

            // Upsert (Insert or Update if exists)
            const { error } = await (supabase.from('student_classes' as any) as any)
                .upsert(payload, { onConflict: 'academic_year_id, santri_id' });

            if (error) throw error;

            // Dual-write ke tabel kanonikal V2 student_enrollments (Fase 3 & Fase 6 Blueprint)
            try {
                if (sourceYearId && Number(sourceYearId) !== Number(targetYearId)) {
                    await (supabase.from('student_enrollments' as any) as any)
                        .update({ status: 'promoted', left_at: new Date().toISOString().split('T')[0] })
                        .eq('organization_id', orgId)
                        .eq('academic_year_id', sourceYearId)
                        .in('student_id', selectedStudentIds);
                }
                const enrollmentRows = selectedStudentIds.map(id => ({
                    organization_id: orgId,
                    student_id: id,
                    academic_year_id: Number(targetYearId),
                    marhalah_id: mId || null,
                    kelas_id: kId || null,
                    status: 'active',
                    enrolled_at: new Date().toISOString().split('T')[0],
                }));
                await (supabase.from('student_enrollments' as any) as any)
                    .upsert(enrollmentRows, { onConflict: 'organization_id,student_id,academic_year_id' });
            } catch {}

            // Sinkronkan juga kolom marhalah & kelas di tabel santri jika target tahun ajaran adalah tahun ajaran aktif
            const targetAy = academicYears.find(ay => ay.id === Number(targetYearId));
            if (targetAy?.is_active || Number(targetYearId) === Number(selectedAcademicYear?.id)) {
                const santriUpdatePayload: any = {
                    marhalah_id: mId || null,
                    kelas_id: kId || null,
                    marhalah: targetMarhalah,
                    kelas: finalTargetKelas
                };
                let { error: syncErr } = await supabase
                    .from('santri')
                    .update(santriUpdatePayload)
                    .eq('organization_id', orgId)
                    .in('id', selectedStudentIds);
                if (syncErr && (syncErr.message?.toLowerCase().includes('enum') || syncErr.code === '22P02')) {
                    const validEnums = ['Mutawassithah', 'Aliyah', 'Jamiah'];
                    santriUpdatePayload.marhalah = validEnums.includes(targetMarhalah) ? targetMarhalah : 'Mutawassithah';
                    await supabase
                        .from('santri')
                        .update(santriUpdatePayload)
                        .eq('organization_id', orgId)
                        .in('id', selectedStudentIds);
                }
            }

            setNotification({ type: 'success', message: "Berhasil memindahkan santri!" });
            setSelectedStudentIds([]);
            
            // Refresh target classes to update plotted status
            const { data: newTargetClasses } = await (supabase.from('student_classes' as any) as any)
                .select('santri_id, marhalah, kelas')
                .eq('organization_id', orgId)
                .eq('academic_year_id', targetYearId);
            if (newTargetClasses) setTargetYearClasses(newTargetClasses);

            await fetchData(); // Refresh global data
        } catch (e: any) {
            console.error("Error promoting students:", e);
            setNotification({ type: 'error', message: `Gagal memindahkan santri: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = sourceStudents.filter(s => {
        const matchSearch = s.nama.toLowerCase().includes(searchQuery.toLowerCase()) || s.kelas.toLowerCase().includes(searchQuery.toLowerCase());
        const matchMarhalah = sourceMarhalah ? s.marhalah === sourceMarhalah : true;
        const matchKelas = sourceKelas ? s.kelas === sourceKelas : true;
        
        let matchStatus = true;
        if (sourceStatus === 'plotted') {
            matchStatus = targetYearClasses.some(tc => tc.santri_id === s.id);
        } else if (sourceStatus === 'unplotted') {
            matchStatus = !targetYearClasses.some(tc => tc.santri_id === s.id);
        }

        return matchSearch && matchMarhalah && matchKelas && matchStatus;
    });

    const availableSourceKelas = React.useMemo(() => {
        if (!sourceMarhalah) return [];
        const dynamicKelas = sourceStudents.filter(s => s.marhalah === sourceMarhalah).map(s => s.kelas);
        return Array.from(new Set(dynamicKelas)).sort();
    }, [sourceMarhalah, sourceStudents]);

    const availableTargetKelas = React.useMemo(() => {
        if (!targetMarhalah) return [];
        const staticKelas = masterKelas.filter(m => m.marhalah === targetMarhalah).map(m => m.nama_kelas);
        const dynamicKelas = santri.filter(s => s.marhalah === targetMarhalah && s.kelas !== '-').map(s => s.kelas);
        return Array.from(new Set([...staticKelas, ...dynamicKelas])).sort();
    }, [targetMarhalah, santri, masterKelas]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            {notification && (
                <div className={`p-4 rounded-xl flex items-start gap-3 shadow-sm ${notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {notification.type === 'success' ? <Check size={20} className="mt-0.5" /> : <AlertCircle size={20} className="mt-0.5" />}
                    <div className="flex-1">
                        <p className="font-medium">{notification.message}</p>
                    </div>
                    <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
                        <XCircle size={20} />
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
                <div>
                    <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
                        Kenaikan / Plotting Kelas
                    </h1>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Pindahkan santri dari tahun ajaran lama ke tahun ajaran baru secara massal.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-6">
                {/* Main Panel: Source Selection & Student List */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-auto min-h-[500px]">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex flex-col gap-5">
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="w-full sm:w-1/2">
                                <label className="block text-[12px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Tahun Ajaran Sumber (Lama)</label>
                                <select 
                                    className="w-full h-10 px-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                                    value={sourceYearId}
                                    onChange={(e) => setSourceYearId(e.target.value ? Number(e.target.value) : '')}
                                >
                                    <option value="">-- Pilih Tahun Ajaran --</option>
                                    {academicYears.map(ay => (
                                        <option key={ay.id} value={ay.id}>{ay.name} - {ay.active_semester}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-full sm:w-1/2 relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input 
                                    type="text"
                                    placeholder="Cari nama / kelas..."
                                    className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-slate-400"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    disabled={!sourceYearId}
                                />
                            </div>
                        </div>
                        
                        {/* Additional Filters */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="w-full sm:w-1/3">
                                <select 
                                    className="w-full h-9 px-3 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-50 focus:border-blue-500 outline-none text-[12px] font-medium text-slate-700 transition-colors cursor-pointer"
                                    value={sourceMarhalah}
                                    onChange={(e) => {
                                        setSourceMarhalah(e.target.value);
                                        setSourceKelas(''); // Reset kelas when marhalah changes
                                    }}
                                    disabled={!sourceYearId}
                                >
                                    <option value="">Semua Marhalah</option>
                                    {globalMarhalahs.map(m => (
                                        <option key={m} value={m}>{m}</option>
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
                                    {sourceMarhalah && availableSourceKelas.map(k => (
                                        <option key={k} value={k}>{k}</option>
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
                                <p className="text-[13px] font-medium">Pilih Tahun Ajaran Sumber terlebih dahulu untuk melihat daftar santri.</p>
                            </div>
                        ) : loading ? (
                            <div className="h-full flex items-center justify-center min-h-[300px]">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-400 min-h-[300px]">
                                <p className="text-[13px] font-medium">Tidak ada santri ditemukan.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 z-10">
                                    <tr className="border-b border-slate-200/60 bg-slate-50/50">
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 w-12 text-center border-r border-slate-100/80">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                checked={selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0}
                                                onChange={handleSelectAll}
                                            />
                                        </th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Nama Santri</th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Kelas Asal</th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Status Tujuan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80">
                                    {filteredStudents.map(s => (
                                        <tr key={s.id} className="hover:bg-blue-50/30 transition-colors group cursor-pointer" onClick={() => handleSelectStudent(s.id)}>
                                            <td className="px-6 py-4 border-r border-slate-100/80 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                                    checked={selectedStudentIds.includes(s.id)}
                                                    onChange={() => handleSelectStudent(s.id)}
                                                />
                                            </td>
                                            <td className="px-6 py-4 border-l border-slate-100/80 text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{s.nama}</td>
                                            <td className="px-6 py-4 border-l border-slate-100/80">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 tracking-widest uppercase border border-slate-200">
                                                    <KelasLabel text={s.kelas} id={s.kelas_id} /> <span className="text-slate-400 ml-1 font-semibold">(<MarhalahLabel text={s.marhalah} id={s.marhalah_id} />)</span>
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 border-l border-slate-100/80">
                                                {targetYearClasses.some(tc => tc.santri_id === s.id) ? (
                                                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 tracking-widest border border-emerald-200/60 shadow-sm uppercase">
                                                        Sudah ({targetYearClasses.find(tc => tc.santri_id === s.id)?.kelas})
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700 tracking-widest border border-rose-200/60 shadow-sm uppercase">
                                                        Belum
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <span className="text-[13px] font-medium text-slate-600">
                            Terpilih: <span className="text-blue-600 font-extrabold">{selectedStudentIds.length}</span> santri
                        </span>
                        <button
                            onClick={handlePromoteClick}
                            disabled={loading || selectedStudentIds.length === 0}
                            className="w-full sm:w-auto px-6 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 transition-all shadow-[0_2px_12px_rgba(37,99,235,0.25)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                        >
                            <ArrowRight size={16} strokeWidth={2.5} className="mr-2" />
                            Pilih Tujuan Kenaikan
                        </button>
                    </div>
                </div>
            </div>

            {/* Target Selection & Confirmation Modal */}
            <Modal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="Pilih Tujuan Kenaikan Kelas">
                <div className="space-y-5">
                    <p className="text-slate-600 text-sm">
                        Anda akan memindahkan <span className="font-bold text-slate-900">{selectedStudentIds.length} santri</span>. Silakan pilih tujuan kelas di bawah ini:
                    </p>
                    
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 space-y-5">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tahun Ajaran Tujuan</label>
                            <select 
                                className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white hover:bg-slate-50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-[13px] font-semibold text-slate-800 cursor-pointer"
                                value={targetYearId}
                                onChange={(e) => setTargetYearId(e.target.value ? Number(e.target.value) : '')}
                            >
                                <option value="">-- Pilih Tahun Ajaran --</option>
                                {academicYears.map(ay => (
                                    <option key={ay.id} value={ay.id}>{ay.name} - {ay.active_semester} {ay.is_active ? '(Aktif)' : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Marhalah Tujuan</label>
                            <select 
                                className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white hover:bg-slate-50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-[13px] font-semibold text-slate-800 cursor-pointer"
                                value={targetMarhalah}
                                onChange={(e) => {
                                    setTargetMarhalah(e.target.value as Marhalah);
                                    setTargetKelas(''); // Reset kelas
                                }}
                            >
                                {globalMarhalahs.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Kelas Tujuan</label>
                            <div className="flex flex-col gap-3">
                                <select 
                                    className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-white hover:bg-slate-50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-[13px] font-semibold text-slate-800 cursor-pointer"
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
                                    {availableTargetKelas.map(k => (
                                        <option key={k} value={k}>{k}</option>
                                    ))}
                                    <option value="NEW_CLASS" className="font-extrabold text-blue-600">+ Buat Kelas Baru</option>
                                </select>
                                {isCustomTargetKelas && (
                                    <input 
                                        type="text" 
                                        placeholder="Ketik nama kelas baru..." 
                                        className="w-full border border-blue-300 rounded-xl px-4 py-2.5 bg-blue-50/50 outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[13px] font-semibold text-blue-900 placeholder:text-blue-400" 
                                        value={customTargetKelas} 
                                        onChange={e => setCustomTargetKelas(e.target.value)} 
                                        autoFocus
                                    />
                                )}
                            </div>
                        </div>
                        
                        {sourceYearId === targetYearId && sourceYearId !== '' && (
                            <p className="text-[12px] font-bold text-red-500 mt-2">Tahun ajaran sumber dan tujuan tidak boleh sama.</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/80">
                        <button 
                            onClick={() => setConfirmModalOpen(false)}
                            className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            Batal
                        </button>
                        <button 
                            onClick={executePromote}
                            disabled={loading || !targetYearId || (!targetKelas && !isCustomTargetKelas) || (isCustomTargetKelas && !customTargetKelas) || sourceYearId === targetYearId}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-all text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_12px_rgba(37,99,235,0.25)] focus:ring-4 focus:ring-blue-500/20 w-full sm:w-auto min-w-[140px]"
                        >
                            {loading ? (
                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Memproses...</>
                            ) : (
                                <><Check size={16} strokeWidth={2.5}/> Ya, Pindahkan</>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default KenaikanKelasPage;
