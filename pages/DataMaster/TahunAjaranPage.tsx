import React, { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { AcademicYear } from '../../types';
import { Plus, Edit, Trash, CheckCircle, XCircle, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAcademicYear } from '../../lib/AcademicYearContext';

const TahunAjaranPage: React.FC = () => {
    const { getOrgId, appSettings, saveAppSetting, fetchData } = useSupabaseData();
    const { academicYears, setSelectedAcademicYear, refreshAcademicYears } = useAcademicYear();
    
    const [localAcademicYears, setLocalAcademicYears] = useState<AcademicYear[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        active_semester: 'Ganjil',
        is_active: false,
        ganjil_start_date: '',
        ganjil_end_date: '',
        genap_start_date: '',
        genap_end_date: '',
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
            
            if (data) {
                setLocalAcademicYears(data);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAcademicYears();
    }, []);

    const openModal = async (ay: AcademicYear | null) => {
        if (ay) {
            setEditingId(ay.id);
            
            let gStartDate = (ay as any).start_date || '', gEndDate = (ay as any).end_date || '', genStartDate = '', genEndDate = '';
            const settingKey = `SEMESTER_DATES_${ay.id}`;
            let existingSetting = appSettings.find((s: any) => s.key === settingKey);
            
            if (!existingSetting) {
                const orgId = await getOrgId();
                const { data } = await (supabase as any).from('app_settings').select('*').eq('organization_id', orgId).eq('key', settingKey).maybeSingle();
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
                } catch(e) {}
            }
            
            setFormData({
                name: ay.name,
                active_semester: ay.active_semester,
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
                is_active: false,
                ganjil_start_date: '',
                ganjil_end_date: '',
                genap_start_date: '',
                genap_end_date: '',
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const orgId = await getOrgId();
            let newId = editingId;
            const activeStart = formData.active_semester === 'Ganjil' ? formData.ganjil_start_date : formData.genap_start_date;
            const activeEnd = formData.active_semester === 'Ganjil' ? formData.ganjil_end_date : formData.genap_end_date;

            if (editingId) {
                const updatePayload: any = {
                    name: formData.name,
                    active_semester: formData.active_semester
                };

                const { error } = await supabase
                    .from('academic_years')
                    .update(updatePayload)
                    .eq('id', editingId)
                    .eq('organization_id', orgId);
                if (error) throw error;
            } else {
                const insertPayload: any = {
                    organization_id: orgId,
                    name: formData.name,
                    active_semester: formData.active_semester,
                    is_active: localAcademicYears.length === 0
                };

                const { data, error } = await supabase
                    .from('academic_years')
                    .insert(insertPayload).select();
                if (error) throw error;
                if (data && data.length > 0) {
                   newId = data[0].id;
                }
            }
            
            if (newId) {
                const datesObject = {
                    Ganjil: { startDate: formData.ganjil_start_date, endDate: formData.ganjil_end_date },
                    Genap: { startDate: formData.genap_start_date, endDate: formData.genap_end_date }
                };
                await saveAppSetting(`SEMESTER_DATES_${newId}`, JSON.stringify(datesObject));
            }
            
            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            setIsModalOpen(false);
            
            if (localAcademicYears.length === 0) {
                window.location.reload();
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        const targetYear = localAcademicYears.find(ay => ay.id === id);
        if (targetYear?.is_active) {
            alert('Tahun Ajaran yang sedang aktif tidak dapat dihapus. Silakan aktifkan Tahun Ajaran lain terlebih dahulu.');
            return;
        }
        if (confirm('Hapus Tahun Ajaran ini? Data yang terkait mungkin akan terpengaruh.')) {
            try {
                const orgId = await getOrgId();
                const { error } = await supabase.from('academic_years').delete().eq('id', id).eq('organization_id', orgId);
                if (error) throw error;
                fetchAcademicYears();
            } catch (error: any) {
                alert(error.message);
            }
        }
    };

    const handleSetActive = async (id: number) => {
        try {
            const orgId = await getOrgId();
            await supabase.from('academic_years').update({ is_active: false }).eq('organization_id', orgId);
            await supabase.from('academic_years').update({ is_active: true }).eq('id', id).eq('organization_id', orgId);
            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            window.location.reload();
        } catch (error: any) {
            alert(error.message);
        }
    };

    const handleToggleSemester = async (ay: AcademicYear) => {
        const newSemester = ay.active_semester === 'Ganjil' ? 'Genap' : 'Ganjil';
        if (!confirm(`Ubah semester aktif menjadi ${newSemester} untuk tahun ajaran ${ay.name}?`)) return;
        try {
            const orgId = await getOrgId();
            const settingKey = `SEMESTER_DATES_${ay.id}`;
            let semSetting = appSettings.find((s: any) => s.key === settingKey);
            if (!semSetting) {
                const { data } = await (supabase as any).from('app_settings').select('*').eq('organization_id', orgId).eq('key', settingKey).maybeSingle();
                if (data) semSetting = data;
            }

            const updatePayload: any = { active_semester: newSemester };

            const { error } = await supabase
                .from('academic_years')
                .update(updatePayload)
                .eq('id', ay.id)
                .eq('organization_id', orgId);
            if (error) throw error;
            await fetchAcademicYears();
            await refreshAcademicYears();
            if (fetchData) await fetchData();
            window.location.reload();
        } catch (error: any) {
            alert(error.message);
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
            } catch(e) {}
        }

        if (startDate && endDate) {
            return `${startDate} s/d ${endDate}`;
        } else if (startDate) {
            return `Mulai: ${startDate}`;
        }
        return null;
    };

    if (loading) return <p>Loading...</p>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
                <div>
                    <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
                        Tahun Ajaran
                    </h1>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Kelola tahun ajaran dan semester aktif
                    </p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end -mt-20 z-10 relative pointer-events-none">
                <div className="pointer-events-auto flex flex-col sm:flex-row gap-3">
                    <button 
                        onClick={() => openModal(null)} 
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-5 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all hover:bg-blue-700 hover:-translate-y-0.5 gap-2"
                    >
                        <Plus size={16} strokeWidth={2.5}/> Tambah Baru
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200/60">
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400">Tahun Ajaran</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100">Semester</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100">Status</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/80">
                            {localAcademicYears.map((ay) => (
                                <tr key={ay.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4 text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{ay.name}</td>
                                    <td className="px-6 py-4 border-l border-slate-100/80">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <span className="text-[13px] font-bold text-slate-700 uppercase tracking-wider">{ay.active_semester}</span>
                                                {getSemesterDateDisplay(ay) ? (
                                                    <div className="text-[11px] font-semibold text-blue-600 mt-0.5 bg-blue-50/80 px-2 py-0.5 rounded-md inline-block border border-blue-100">
                                                        {getSemesterDateDisplay(ay)}
                                                    </div>
                                                ) : (
                                                    <div className="text-[11px] font-normal text-slate-400 mt-0.5 italic">
                                                        Tanggal belum diatur
                                                    </div>
                                                )}
                                            </div>
                                            {ay.is_active && (
                                                <button 
                                                    onClick={() => handleToggleSemester(ay)}
                                                    className="h-8 px-3 rounded-lg bg-orange-50 text-orange-600 text-[11px] font-bold hover:bg-orange-100 transition-colors inline-flex items-center gap-1.5 shadow-sm shrink-0"
                                                    title={`Ganti ke Semester ${ay.active_semester === 'Ganjil' ? 'Genap' : 'Ganjil'}`}
                                                >
                                                    <RefreshCw size={14} strokeWidth={2.5}/> Ganti Semester
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80">
                                        {ay.is_active ? (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-green-100/80 text-green-700 uppercase tracking-widest border border-green-200">
                                                <CheckCircle size={14} className="mr-1.5" strokeWidth={2.5} /> Aktif
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-500 uppercase tracking-widest border border-slate-200">
                                                <XCircle size={14} className="mr-1.5" strokeWidth={2.5} /> Tidak Aktif
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!ay.is_active && (
                                                <button 
                                                    onClick={() => handleSetActive(ay.id)}
                                                    className="h-9 px-4 rounded-xl bg-blue-50 text-blue-600 text-[12px] font-bold hover:bg-blue-100 transition-colors shadow-sm"
                                                >
                                                    Set Aktif
                                                </button>
                                            )}
                                            <button onClick={() => openModal(ay)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm">
                                                <Edit size={14} strokeWidth={2.5} />
                                            </button>
                                            <button onClick={() => handleDelete(ay.id)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                                                <Trash size={14} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {localAcademicYears.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-16 text-center text-[13px] font-medium text-slate-500">
                                        Belum ada data tahun ajaran.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Edit Tahun Ajaran" : "Tambah Tahun Ajaran"}>
                <form onSubmit={handleSubmit} className="space-y-5 mt-2">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tahun Ajaran <span className="text-red-500">*</span></label>
                        <input 
                            type="text" 
                            required 
                            placeholder="Contoh: 2023/2024"
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Semester Aktif <span className="text-red-500">*</span></label>
                        <select 
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer"
                            value={formData.active_semester}
                            onChange={e => setFormData({...formData, active_semester: e.target.value})}
                        >
                            <option value="Ganjil">Ganjil</option>
                            <option value="Genap">Genap</option>
                        </select>
                    </div>
                    
                    <div className="text-[12px] text-slate-500 bg-blue-50/50 p-3 rounded-xl border border-blue-100/80">
                        Rentang tanggal di bawah ini akan otomatis menyesuaikan filter data absensi, ujian, dan rekap hafalan sesuai semester yang aktif.
                    </div>
                    
                    <div className={`border rounded-xl p-4 transition-all ${formData.active_semester === 'Ganjil' ? 'border-blue-300 bg-blue-50/20 ring-2 ring-blue-500/10' : 'border-slate-200/80 bg-slate-50/50'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[12px] font-bold text-slate-700">Periode Semester Ganjil</h4>
                            {formData.active_semester === 'Ganjil' && (
                                <span className="px-2 py-0.5 text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full">
                                    Semester Aktif
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 tracking-wider mb-1">Mulai (Start Date)</label>
                                <input type="date" value={formData.ganjil_start_date} onChange={e => setFormData({...formData, ganjil_start_date: e.target.value})} className="w-full border border-slate-200/80 rounded-xl px-3 py-2 bg-white text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 tracking-wider mb-1">Berakhir (End Date)</label>
                                <input type="date" value={formData.ganjil_end_date} onChange={e => setFormData({...formData, ganjil_end_date: e.target.value})} className="w-full border border-slate-200/80 rounded-xl px-3 py-2 bg-white text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </div>
                        </div>
                    </div>
                    
                    <div className={`border rounded-xl p-4 transition-all ${formData.active_semester === 'Genap' ? 'border-blue-300 bg-blue-50/20 ring-2 ring-blue-500/10' : 'border-slate-200/80 bg-slate-50/50'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[12px] font-bold text-slate-700">Periode Semester Genap</h4>
                            {formData.active_semester === 'Genap' && (
                                <span className="px-2 py-0.5 text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full">
                                    Semester Aktif
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 tracking-wider mb-1">Mulai (Start Date)</label>
                                <input type="date" value={formData.genap_start_date} onChange={e => setFormData({...formData, genap_start_date: e.target.value})} className="w-full border border-slate-200/80 rounded-xl px-3 py-2 bg-white text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 tracking-wider mb-1">Berakhir (End Date)</label>
                                <input type="date" value={formData.genap_end_date} onChange={e => setFormData({...formData, genap_end_date: e.target.value})} className="w-full border border-slate-200/80 rounded-xl px-3 py-2 bg-white text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/80">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                            Batal
                        </button>
                        <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-all shadow-[0_2px_12px_rgba(37,99,235,0.25)] focus:ring-4 focus:ring-blue-500/20 flex items-center justify-center min-w-[120px]">
                            {isSubmitting ? (
                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div> Menyimpan...</>
                            ) : 'Simpan Data'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default TahunAjaranPage;
