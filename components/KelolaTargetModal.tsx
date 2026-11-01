import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Trash2, Copy, CheckCircle2 } from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { createPortal } from 'react-dom';
import { MurojaahRule, TargetMurojaahConfig, ClassTarget } from '../types';

interface KelolaTargetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const isUUID = (str: any): boolean => {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
};

type TargetGrid = Record<string, Record<string, { hafalan: number, murojaah: number, ziyadah: number, marhalah_id?: string, kelas_id?: string }>>;

const KelolaTargetModal: React.FC<KelolaTargetModalProps> = ({ isOpen, onClose }) => {
    const { 
        appSettings, fetchData, saveAppSetting, 
        globalMarhalahs, masterKelas, classTargets, saveClassTargetBatch, masterMarhalahs, masterKelasRelasi,
        selectedAcademicYear
    } = useSupabaseData();
    
    const [activeTab, setActiveTab] = useState<'hafalan' | 'murojaah_rules'>('hafalan');
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [copyNotice, setCopyNotice] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Class Targets State per semester
    const [targets, setTargets] = useState<Record<'Ganjil' | 'Genap', TargetGrid>>({
        Ganjil: {},
        Genap: {}
    });
    
    // Murojaah State: { marhalahName: MurojaahRule[] }
    const [murojaahRules, setMurojaahRules] = useState<TargetMurojaahConfig>({});

    // Active Marhalahs from master system with fallback
    const activeMarhalahs = useMemo(() => {
        if (masterMarhalahs && masterMarhalahs.length > 0) {
            return [...masterMarhalahs].sort((a: any, b: any) => (a.urutan ?? 99) - (b.urutan ?? 99) || a.nama.localeCompare(b.nama));
        }
        return (globalMarhalahs || ['Mutawassithah', 'Aliyah', 'Jamiah']).map((m, idx) => ({
            id: undefined,
            nama: m,
            urutan: idx + 1
        }));
    }, [masterMarhalahs, globalMarhalahs]);

    // Helper to get classes for a given Marhalah
    const getKelasListForMarhalah = (mObj: { id?: string, nama: string }) => {
        const foundM = masterMarhalahs?.find((mm: any) => mm.nama === mObj.nama || (mObj.id && mm.id === mObj.id));
        const effectiveMId = isUUID(mObj.id) ? mObj.id : (foundM && isUUID(foundM.id) ? foundM.id : undefined);

        // 1. Check in masterKelasRelasi by marhalah_id
        if (effectiveMId && masterKelasRelasi && masterKelasRelasi.length > 0) {
            const linked = masterKelasRelasi
                .filter((k: any) => k.marhalah_id === effectiveMId)
                .map((k: any) => ({ id: isUUID(k.id) ? k.id : undefined, nama_kelas: k.nama_kelas }));
            if (linked.length > 0) {
                return linked.sort((a: any, b: any) => a.nama_kelas.localeCompare(b.nama_kelas));
            }
        }
        // 2. Check in masterKelas by marhalah name
        if (masterKelas && masterKelas.length > 0) {
            const linked = masterKelas
                .filter((k: any) => k.marhalah === mObj.nama)
                .map((k: any) => {
                    const relObj = masterKelasRelasi?.find((r: any) => r.nama_kelas === k.nama_kelas && (!effectiveMId || r.marhalah_id === effectiveMId));
                    return {
                        id: relObj && isUUID(relObj.id) ? relObj.id : undefined,
                        nama_kelas: k.nama_kelas
                    };
                });
            if (linked.length > 0) {
                return linked.sort((a: any, b: any) => a.nama_kelas.localeCompare(b.nama_kelas));
            }
        }
        // 3. Fallback: match masterMarhalah by name and look up in masterKelasRelasi
        if (foundM && isUUID(foundM.id) && masterKelasRelasi) {
            const linked = masterKelasRelasi
                .filter((k: any) => k.marhalah_id === foundM.id)
                .map((k: any) => ({ id: isUUID(k.id) ? k.id : undefined, nama_kelas: k.nama_kelas }));
            if (linked.length > 0) {
                return linked.sort((a: any, b: any) => a.nama_kelas.localeCompare(b.nama_kelas));
            }
        }
        return [];
    };

    useEffect(() => {
        if (isOpen) {
            const defaultSem = (selectedAcademicYear?.active_semester === 'Genap') ? 'Genap' : 'Ganjil';
            setSelectedSemester(defaultSem);

            const makeInitialGrid = (): TargetGrid => {
                const grid: TargetGrid = {};
                activeMarhalahs.forEach(m => {
                    const mUuid = isUUID(m.id) ? m.id : undefined;
                    grid[m.nama] = {};
                    const kList = getKelasListForMarhalah(m);
                    kList.forEach(k => {
                        grid[m.nama][k.nama_kelas] = {
                            hafalan: 0,
                            murojaah: 0,
                            ziyadah: 0,
                            marhalah_id: mUuid,
                            kelas_id: isUUID(k.id) ? k.id : undefined
                        };
                    });
                });
                return grid;
            };

            const initialTargets: Record<'Ganjil' | 'Genap', TargetGrid> = {
                Ganjil: makeInitialGrid(),
                Genap: makeInitialGrid()
            };

            let hasGenapData = false;

            // Populate with stored targets from database
            (classTargets || []).forEach(ct => {
                let mName = ct.marhalah;
                let kName = ct.kelas;
                
                if (ct.marhalah_id && isUUID(ct.marhalah_id)) {
                    const foundM = masterMarhalahs?.find((mm: any) => mm.id === ct.marhalah_id);
                    if (foundM) mName = foundM.nama;
                }
                if (ct.kelas_id && isUUID(ct.kelas_id)) {
                    const foundK = masterKelasRelasi?.find((mk: any) => mk.id === ct.kelas_id);
                    if (foundK) kName = foundK.nama_kelas;
                }

                if (mName && kName) {
                    const sem: 'Ganjil' | 'Genap' = ct.semester === 'Genap' ? 'Genap' : 'Ganjil';
                    if (sem === 'Genap') hasGenapData = true;

                    if (!initialTargets[sem][mName]) {
                        initialTargets[sem][mName] = {};
                    }
                    initialTargets[sem][mName][kName] = {
                        hafalan: ct.target_hafalan || 0,
                        murojaah: ct.target_murojaah || 0,
                        ziyadah: ct.target_ziyadah || 0,
                        marhalah_id: isUUID(ct.marhalah_id) ? ct.marhalah_id : undefined,
                        kelas_id: isUUID(ct.kelas_id) ? ct.kelas_id : undefined
                    };
                }
            });

            // If Genap has no existing configured data, clone Ganjil data as initial baseline
            if (!hasGenapData) {
                initialTargets.Genap = JSON.parse(JSON.stringify(initialTargets.Ganjil));
            }

            setTargets(initialTargets);

            // Load Murojaah Rules
            const setting = appSettings.find((s: any) => s.key === 'TARGET_MUROJAAH_GLOBAL');
            let initialMurojaah: TargetMurojaahConfig = {};
            if (setting && setting.value) {
                try {
                    const parsed = JSON.parse(setting.value);
                    if (parsed.threshold_juz !== undefined) {
                        // Migration from old schema
                        activeMarhalahs.forEach(m => {
                            initialMurojaah[m.nama] = [
                                { min_capaian: parsed.threshold_juz, target: parsed.target_above_juz },
                                { min_capaian: 0, target: parsed.target_below_juz }
                            ];
                        });
                    } else {
                        // Ensure all are arrays
                        Object.keys(parsed).forEach(k => {
                            if (Array.isArray(parsed[k])) {
                                initialMurojaah[k] = parsed[k];
                            }
                        });
                    }
                } catch (e) {}
            }
            setMurojaahRules(initialMurojaah);
        }
    }, [isOpen, appSettings, activeMarhalahs, classTargets, masterMarhalahs, masterKelasRelasi, masterKelas, selectedAcademicYear]);

    if (!isOpen) return null;

    const handleCopyFromOtherSemester = () => {
        const sourceSemester = selectedSemester === 'Ganjil' ? 'Genap' : 'Ganjil';
        setTargets(prev => {
            const sourceData = prev[sourceSemester];
            const updated = JSON.parse(JSON.stringify(sourceData));
            return {
                ...prev,
                [selectedSemester]: updated
            };
        });
        setCopyNotice(`Target berhasil disalin dari Semester ${sourceSemester}!`);
        setTimeout(() => setCopyNotice(null), 3500);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (activeTab === 'murojaah_rules') {
                // Ensure sorted by min_capaian descending
                const rulesToSave: TargetMurojaahConfig = {};
                Object.keys(murojaahRules).forEach(m => {
                    if (Array.isArray(murojaahRules[m])) {
                        rulesToSave[m] = [...murojaahRules[m]].sort((a, b) => b.min_capaian - a.min_capaian);
                    } else {
                        rulesToSave[m] = [];
                    }
                });
                await saveAppSetting('TARGET_MUROJAAH_GLOBAL', JSON.stringify(rulesToSave));
            } else {
                const batch: Omit<ClassTarget, 'id'>[] = [];
                const sem = selectedSemester;
                const currentGrid = targets[sem] || {};
                Object.keys(currentGrid).forEach(marhalahName => {
                    const mObj = masterMarhalahs?.find((m: any) => m.nama === marhalahName);
                    const mId = isUUID(mObj?.id) ? mObj.id : undefined;

                    Object.keys(currentGrid[marhalahName]).forEach(kelasName => {
                        const targetItem = currentGrid[marhalahName][kelasName];
                        const kObj = masterKelasRelasi?.find((k: any) => k.nama_kelas === kelasName && (!mId || k.marhalah_id === mId)) ||
                                     masterKelasRelasi?.find((k: any) => k.nama_kelas === kelasName);
                        const kId = isUUID(kObj?.id) ? kObj.id : (isUUID(targetItem.kelas_id) ? targetItem.kelas_id : undefined);

                        const hasCustomValue = (targetItem.ziyadah || 0) > 0 || (targetItem.murojaah || 0) > 0 || (targetItem.hafalan || 0) > 0;
                        const hasExistingDbTarget = (classTargets || []).some(ct => 
                            (ct.semester === sem || (!ct.semester && sem === 'Ganjil')) &&
                            (ct.marhalah === marhalahName || (mId && ct.marhalah_id === mId)) && 
                            (ct.kelas === kelasName || (kId && ct.kelas_id === kId))
                        );

                        // Only include specific classes if they have custom values or exist in DB
                        if (hasCustomValue || hasExistingDbTarget) {
                            batch.push({
                                marhalah: marhalahName as any,
                                kelas: kelasName,
                                semester: sem,
                                marhalah_id: mId || undefined,
                                kelas_id: kId || undefined,
                                target_ziyadah: targetItem.ziyadah || 0,
                                target_murojaah: targetItem.murojaah || 0,
                                target_hafalan: targetItem.hafalan || 0
                            });
                        }
                    });
                });
                await saveClassTargetBatch(batch);
            }
            await fetchData();
            onClose();
        } catch (error: any) {
            console.error('Error saving targets:', error);
            alert(`Gagal menyimpan target: ${error?.message || JSON.stringify(error)}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTargetChange = (marhalah: string, kelas: string, type: 'hafalan' | 'murojaah' | 'ziyadah', value: number) => {
        setTargets(prev => ({
            ...prev,
            [selectedSemester]: {
                ...(prev[selectedSemester] || {}),
                [marhalah]: {
                    ...(prev[selectedSemester]?.[marhalah] || {}),
                    [kelas]: {
                        ...(prev[selectedSemester]?.[marhalah]?.[kelas] || { hafalan: 0, murojaah: 0, ziyadah: 0 }),
                        [type]: value
                    }
                }
            }
        }));
    };

    const addMurojaahRule = (marhalah: string) => {
        setMurojaahRules(prev => ({
            ...prev,
            [marhalah]: [...(prev[marhalah] || []), { min_capaian: 0, target: 0 }]
        }));
    };

    const updateMurojaahRule = (marhalah: string, index: number, field: keyof MurojaahRule, value: number) => {
        setMurojaahRules(prev => {
            const rules = [...(prev[marhalah] || [])];
            rules[index] = { ...rules[index], [field]: value };
            return { ...prev, [marhalah]: rules };
        });
    };

    const deleteMurojaahRule = (marhalah: string, index: number) => {
        setMurojaahRules(prev => {
            const rules = [...(prev[marhalah] || [])];
            rules.splice(index, 1);
            return { ...prev, [marhalah]: rules };
        });
    };

    const renderTargetList = (type: 'hafalan' | 'murojaah' | 'ziyadah') => {
        const currentGrid = targets[selectedSemester] || {};

        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mr-1">Semester:</span>
                        {(['Ganjil', 'Genap'] as const).map(sem => (
                            <button
                                key={sem}
                                type="button"
                                onClick={() => setSelectedSemester(sem)}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    selectedSemester === sem
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                Semester {sem}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={handleCopyFromOtherSemester}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                        <Copy size={14} className="text-blue-600" />
                        Salin Target dari Semester {selectedSemester === 'Ganjil' ? 'Genap' : 'Ganjil'}
                    </button>
                </div>

                {copyNotice && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3.5 py-2.5 rounded-xl font-medium animate-fadeIn">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>{copyNotice}</span>
                    </div>
                )}

                {activeMarhalahs.map(m => {
                    const kelasForMarhalah = getKelasListForMarhalah(m);
                    return (
                        <div key={m.id || m.nama} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="bg-slate-100/70 px-4 py-3 font-bold text-sm text-slate-700 border-b border-slate-200 flex items-center justify-between">
                                <span>Marhalah {m.nama}</span>
                                <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                                    {kelasForMarhalah.length} Kelas
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {kelasForMarhalah.map(k => (
                                    <div key={k.id || k.nama_kelas} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors pl-8 border-l-4 border-l-blue-500/40">
                                        <div className="text-[13px] font-medium text-slate-700">Kelas: <span className="font-bold text-slate-800">{k.nama_kelas}</span></div>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" step="0.5" 
                                                value={currentGrid[m.nama]?.[k.nama_kelas]?.[type] ?? ''}
                                                onChange={(e) => handleTargetChange(m.nama, k.nama_kelas, type, parseFloat(e.target.value) || 0)}
                                                className="w-24 text-center text-[13px] font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                placeholder="0"
                                            />
                                            <span className="text-[12px] font-bold text-slate-400">JUZ</span>
                                        </div>
                                    </div>
                                ))}
                                {kelasForMarhalah.length === 0 && (
                                    <div className="p-4 text-center text-slate-400 text-[12px] italic">
                                        Belum ada kelas yang terdaftar pada marhalah ini. Anda dapat menambahkannya melalui menu Pengaturan &gt; Master Marhalah &amp; Kelas.
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Kelola Target Santri</h2>
                        <p className="text-[13px] text-slate-500 mt-1">Atur target capaian hafalan dan murojaah per marhalah, kelas, dan semester.</p>
                    </div>
                    
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>
                
                <div className="flex items-center px-2 bg-slate-50 border-b border-slate-100 shrink-0">
                    <button 
                        className={`px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'hafalan' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        onClick={() => setActiveTab('hafalan')}
                    >
                        Target Hafalan
                    </button>
                    
                    <button 
                        className={`px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'murojaah_rules' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                        onClick={() => setActiveTab('murojaah_rules')}
                    >
                        Target Murojaah
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5">
                    {activeTab === 'hafalan' && renderTargetList('hafalan')}
                    
                    {activeTab === 'murojaah_rules' && (
                        <div className="space-y-6">
                            <p className="text-[13px] text-slate-500 font-medium">Tentukan target hafalan Murojaah bulanan berdasarkan ambang batas capaian hafalan santri (Juz) untuk masing-masing Marhalah.</p>
                            {activeMarhalahs.map(m => (
                                <div key={m.id || m.nama} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-100/70 px-4 py-3 font-bold text-sm text-slate-700 border-b border-slate-200 flex justify-between items-center">
                                        <span>Marhalah {m.nama}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => addMurojaahRule(m.nama)}
                                            className="text-[11px] flex items-center gap-1 font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors border border-blue-200"
                                        >
                                            <Plus size={12} /> Tambah Ambang Batas
                                        </button>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        {(!murojaahRules[m.nama] || murojaahRules[m.nama].length === 0) ? (
                                            <div className="text-center py-4 text-slate-400 text-[13px] font-medium border-2 border-dashed border-slate-100 rounded-xl">
                                                Belum ada aturan ambang batas untuk Marhalah {m.nama}.
                                            </div>
                                        ) : (
                                            murojaahRules[m.nama].map((rule, idx) => (
                                                <div key={idx} className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                                                    <div className="flex-1">
                                                        <label className="block text-[10px] font-bold text-slate-400 mb-1">JIKA CAPAIAN HAFALAN &ge;</label>
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="number" step="0.5" 
                                                                value={rule.min_capaian}
                                                                onChange={(e) => updateMurojaahRule(m.nama, idx, 'min_capaian', parseFloat(e.target.value) || 0)}
                                                                className="w-20 text-center text-[13px] font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                            />
                                                            <span className="text-[12px] font-bold text-slate-400">JUZ</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-300 mt-4">&rarr;</div>
                                                    <div className="flex-1">
                                                        <label className="block text-[10px] font-bold text-emerald-600 mb-1">TARGET MUROJAAH (BLN)</label>
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="number" step="0.5" 
                                                                value={rule.target}
                                                                onChange={(e) => updateMurojaahRule(m.nama, idx, 'target', parseFloat(e.target.value) || 0)}
                                                                className="w-20 text-center text-[13px] font-bold text-emerald-700 bg-white border border-emerald-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                                            />
                                                            <span className="text-[12px] font-bold text-emerald-500">JUZ</span>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => deleteMurojaahRule(m.nama, idx)}
                                                        className="mt-4 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="Hapus ambang batas"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-white shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                        Batal
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 hover:shadow-md transition-all flex items-center disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_2px_10px_rgba(37,99,235,0.2)]">
                        {isSaving ? 'Menyimpan...' : (
                            <>
                                <Save size={16} className="mr-2" />
                                Simpan Target
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default KelolaTargetModal;
