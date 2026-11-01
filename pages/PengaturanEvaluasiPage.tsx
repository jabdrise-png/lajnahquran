import React, { useState, useEffect, useMemo } from 'react';
import { 
    Plus, Trash2, Edit2, Save, X, CheckSquare, GripVertical, 
    ChevronRight, LayoutList, ChevronUp, ChevronDown,
    RefreshCw, Sliders, CheckCircle2, Info, BookOpen, Layers, Check, Sparkles
} from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { getEvaluationPeriods } from '../lib/utils';
import { 
    MasterEvaluationPeriod, MurojaahRule, TargetMurojaahConfig,
    AutoSyncSetoranConfig, DEFAULT_AUTO_SYNC_SETORAN_CONFIG
} from '../types';
import { format } from 'date-fns';

const isUUID = (str: any): boolean => {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
};

type TargetGrid = Record<string, Record<string, { hafalan: number, murojaah: number, ziyadah: number, marhalah_id?: string, kelas_id?: string }>>;

// ColorPicker component for evaluation options
const ColorPicker = ({ initialColor, onChangeComplete }: { initialColor: string, onChangeComplete: (c: string) => void }) => {
    const [color, setColor] = useState(initialColor);
    
    useEffect(() => {
        setColor(initialColor);
    }, [initialColor]);

    return (
        <div className="relative w-4 h-4 rounded-full mr-3 shrink-0 shadow-2xs border border-slate-300 cursor-pointer" style={{ backgroundColor: color }}>
            <input 
                type="color" 
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                value={color}
                onChange={e => {
                    setColor(e.target.value);
                    onChangeComplete(e.target.value);
                }}
            />
        </div>
    );
};

interface MultiSelectDropdownProps {
    label?: string;
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ 
    label, 
    options, 
    selected, 
    onChange, 
    placeholder = "Pilih skema..." 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (opt: string) => {
        if (selected.includes(opt)) {
            onChange(selected.filter(s => s !== opt));
        } else {
            onChange([...selected, opt]);
        }
    };

    const displayText = useMemo(() => {
        if (selected.length === 0) return placeholder;
        return selected.join(', ');
    }, [selected, placeholder]);

    return (
        <div className="relative w-full" ref={dropdownRef}>
            {label && <label className="block text-xs font-bold text-slate-700 mb-1.5">{label}</label>}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/60 outline-none focus:bg-white focus:border-slate-400 transition-all flex items-center justify-between cursor-pointer"
            >
                <span className={`truncate ${selected.length === 0 ? 'text-slate-400 font-normal' : 'text-slate-800'}`}>
                    {displayText}
                </span>
                <ChevronDown size={15} className={`text-slate-400 shrink-0 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-30 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
                        {options.map(opt => {
                            const isChecked = selected.includes(opt);
                            return (
                                <div
                                    key={opt}
                                    onClick={() => toggleOption(opt)}
                                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${isChecked ? 'bg-slate-100 text-slate-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {}}
                                        className="rounded border-slate-300 text-slate-800 focus:ring-0 h-3.5 w-3.5 pointer-events-none"
                                    />
                                    <span className="truncate">{opt}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const PengaturanEvaluasiPage: React.FC = () => {
    const { 
        appSettings, saveAppSetting, saveMultipleAppSettings,
        evaluationSettings, updateEvaluationSettingsBatch, saveEvaluationSetting,
        deleteEvaluationCategory, updateEvaluationCategory,
        halaqahEvalQuestions, saveHalaqahEvalQuestion, deleteHalaqahEvalQuestion,
        globalMarhalahs, masterKelas, classTargets, saveClassTargetBatch, masterMarhalahs, masterKelasRelasi,
        globalWaktuHalaqah, selectedAcademicYear
    } = useSupabaseData();

    // =========================================================================
    // SECTION 1: KELOLA PERIODE EVALUASI
    // =========================================================================
    const masterPeriods = useMemo(() => getEvaluationPeriods(appSettings), [appSettings]);
    const [editingPeriod, setEditingPeriod] = useState<(MasterEvaluationPeriod & { isNew?: boolean }) | null>(null);

    // Auto-select first period if available
    useEffect(() => {
        if (!editingPeriod && masterPeriods.length > 0) {
            setEditingPeriod(masterPeriods[0]);
        }
    }, [masterPeriods, editingPeriod]);

    const handleSavePeriod = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPeriod) return;

        const start = new Date(editingPeriod.startDate);
        const end = new Date(editingPeriod.endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            alert('Tanggal mulai dan tanggal selesai harus diisi dengan format yang benar.');
            return;
        }

        if (start > end) {
            alert('Tanggal mulai tidak boleh lebih besar dari tanggal selesai.');
            return;
        }

        const { isNew, ...rawPeriod } = editingPeriod;
        const periodToSave: MasterEvaluationPeriod = {
            ...rawPeriod,
            academic_year_id: rawPeriod.academic_year_id ?? selectedAcademicYear?.id ?? null
        };
        let updated: MasterEvaluationPeriod[];
        if (masterPeriods.find(p => p.id === periodToSave.id)) {
            updated = masterPeriods.map(p => p.id === periodToSave.id ? periodToSave : p);
        } else {
            updated = [...masterPeriods, periodToSave];
        }

        try {
            await saveAppSetting('EVALUATION_PERIODS', JSON.stringify(updated));
            setEditingPeriod(periodToSave);
            alert('Periode evaluasi berhasil disimpan.');
        } catch (error: any) {
            console.error('Error saving period:', error);
            alert('Gagal menyimpan periode: ' + error.message);
        }
    };

    const handleDeletePeriod = async (id: string) => {
        if (confirm('Hapus periode ini? Data evaluasi yang menggunakan periode ini mungkin tidak akan tampil dengan benar.')) {
            const updated = masterPeriods.filter(p => p.id !== id);
            await saveAppSetting('EVALUATION_PERIODS', JSON.stringify(updated));
            if (editingPeriod?.id === id) {
                setEditingPeriod(updated[0] || null);
            }
        }
    };

    // =========================================================================
    // SECTION 2: KELOLA TARGET SETORAN
    // =========================================================================
    const [targetActiveTab, setTargetActiveTab] = useState<'hafalan' | 'murojaah'>('hafalan');
    const [isSavingTargets, setIsSavingTargets] = useState(false);

    // Active semester adjusted automatically from system active semester
    const activeSemester: 'Ganjil' | 'Genap' = (selectedAcademicYear?.active_semester === 'Genap') ? 'Genap' : 'Ganjil';

    const [targets, setTargets] = useState<Record<'Ganjil' | 'Genap', TargetGrid>>({
        Ganjil: {},
        Genap: {}
    });

    const [murojaahRules, setMurojaahRules] = useState<TargetMurojaahConfig>({});

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

    const getKelasListForMarhalah = (mObj: { id?: string, nama: string }) => {
        const foundM = masterMarhalahs?.find((mm: any) => mm.nama === mObj.nama || (mObj.id && mm.id === mObj.id));
        const effectiveMId = isUUID(mObj.id) ? mObj.id : (foundM && isUUID(foundM.id) ? foundM.id : undefined);

        if (effectiveMId && masterKelasRelasi && masterKelasRelasi.length > 0) {
            const linked = masterKelasRelasi
                .filter((k: any) => k.marhalah_id === effectiveMId)
                .map((k: any) => ({ id: isUUID(k.id) ? k.id : undefined, nama_kelas: k.nama_kelas }));
            if (linked.length > 0) {
                return linked.sort((a: any, b: any) => a.nama_kelas.localeCompare(b.nama_kelas));
            }
        }
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
        return [
            { id: undefined, nama_kelas: '1' },
            { id: undefined, nama_kelas: '2' },
            { id: undefined, nama_kelas: '3' }
        ];
    };

    useEffect(() => {
        const initialGrid: Record<'Ganjil' | 'Genap', TargetGrid> = { Ganjil: {}, Genap: {} };

        (['Ganjil', 'Genap'] as const).forEach(sem => {
            activeMarhalahs.forEach(m => {
                initialGrid[sem][m.nama] = {};
                const kelasList = getKelasListForMarhalah(m);
                kelasList.forEach(k => {
                    const foundTarget = classTargets?.find((t: any) => {
                        const mMatch = (t.marhalah_id && isUUID(t.marhalah_id) && m.id && isUUID(m.id))
                            ? t.marhalah_id === m.id
                            : (t.marhalah || '').toLowerCase() === m.nama.toLowerCase();
                        const kMatch = (t.kelas_id && isUUID(t.kelas_id) && k.id && isUUID(k.id))
                            ? t.kelas_id === k.id
                            : (t.kelas || '').toLowerCase() === k.nama_kelas.toLowerCase();
                        const semMatch = t.semester ? t.semester === sem : (sem === 'Ganjil');
                        return mMatch && kMatch && semMatch;
                    });

                    initialGrid[sem][m.nama][k.nama_kelas] = {
                        hafalan: foundTarget?.target_hafalan || 0,
                        murojaah: foundTarget?.target_murojaah || 0,
                        ziyadah: foundTarget?.target_ziyadah || 0,
                        marhalah_id: isUUID(m.id) ? m.id : undefined,
                        kelas_id: isUUID(k.id) ? k.id : undefined
                    };
                });
            });
        });
        setTargets(initialGrid);

        const murojaahSetting = appSettings.find((s: any) => s.key === 'TARGET_MUROJAAH_GLOBAL');
        if (murojaahSetting && murojaahSetting.value) {
            try {
                const parsed = JSON.parse(murojaahSetting.value);
                if (parsed.threshold_juz !== undefined) {
                    const initialM: TargetMurojaahConfig = {};
                    activeMarhalahs.forEach(m => {
                        initialM[m.nama] = [
                            { min_capaian: parsed.threshold_juz, target: parsed.target_above_juz },
                            { min_capaian: 0, target: parsed.target_below_juz }
                        ];
                    });
                    setMurojaahRules(initialM);
                } else {
                    setMurojaahRules(parsed);
                }
            } catch (e) {
                console.error('Error parsing TARGET_MUROJAAH_GLOBAL', e);
            }
        }
    }, [activeMarhalahs, classTargets, appSettings]);

    const handleTargetChange = (sem: 'Ganjil' | 'Genap', marhalah: string, kelas: string, field: 'hafalan' | 'murojaah' | 'ziyadah', value: number) => {
        setTargets(prev => ({
            ...prev,
            [sem]: {
                ...prev[sem],
                [marhalah]: {
                    ...prev[sem]?.[marhalah],
                    [kelas]: {
                        ...prev[sem]?.[marhalah]?.[kelas],
                        [field]: value
                    }
                }
            }
        }));
    };

    const handleSaveTargets = async () => {
        setIsSavingTargets(true);
        try {
            const batchToSave: any[] = [];
            const currentGrid = targets[activeSemester] || {};

            Object.entries(currentGrid).forEach(([marhalahName, classes]) => {
                const mObj = masterMarhalahs?.find((m: any) => m.nama === marhalahName);
                const mId = isUUID(mObj?.id) ? mObj.id : undefined;

                Object.entries(classes).forEach(([kelasName, vals]) => {
                    const kObj = masterKelasRelasi?.find((k: any) => k.nama_kelas === kelasName && (!mId || k.marhalah_id === mId)) ||
                                 masterKelasRelasi?.find((k: any) => k.nama_kelas === kelasName);
                    const kId = isUUID(kObj?.id) ? kObj.id : (isUUID(vals.kelas_id) ? vals.kelas_id : undefined);

                    batchToSave.push({
                        marhalah: marhalahName,
                        kelas: kelasName,
                        target_hafalan: vals.hafalan || 0,
                        target_murojaah: vals.murojaah || 0,
                        target_ziyadah: vals.ziyadah || 0,
                        semester: activeSemester,
                        marhalah_id: mId || vals.marhalah_id,
                        kelas_id: kId || vals.kelas_id
                    });
                });
            });

            await saveClassTargetBatch(batchToSave);
            await saveAppSetting('TARGET_MUROJAAH_GLOBAL', JSON.stringify(murojaahRules));
            alert(`Target untuk Semester ${activeSemester} berhasil disimpan.`);
        } catch (error) {
            console.error('Error saving targets:', error);
            alert('Gagal menyimpan target.');
        } finally {
            setIsSavingTargets(false);
        }
    };

    const handleAddMurojaahRule = (marhalah: string) => {
        const currentRules = murojaahRules[marhalah] || [];
        const newRule: MurojaahRule = { min_capaian: 0, target: 0 };
        setMurojaahRules({
            ...murojaahRules,
            [marhalah]: [...currentRules, newRule]
        });
    };

    const handleRemoveMurojaahRule = (marhalah: string, index: number) => {
        const currentRules = [...(murojaahRules[marhalah] || [])];
        currentRules.splice(index, 1);
        setMurojaahRules({
            ...murojaahRules,
            [marhalah]: currentRules
        });
    };

    const handleMurojaahRuleChange = (marhalah: string, index: number, field: keyof MurojaahRule, value: number) => {
        const currentRules = [...(murojaahRules[marhalah] || [])];
        currentRules[index] = {
            ...currentRules[index],
            [field]: value
        };
        setMurojaahRules({
            ...murojaahRules,
            [marhalah]: currentRules
        });
    };

    // =========================================================================
    // SECTION 3: POIN EVALUASI (SANTRI & HALAQAH)
    // =========================================================================
    const [activeEvalTab, setActiveEvalTab] = useState<'santri' | 'halaqah'>('santri');
    const [evalColors, setEvalColors] = useState<Record<string, string>>({});
    const [localEvalColors, setLocalEvalColors] = useState<Record<string, string>>({});
    const [localCategorySettings, setLocalCategorySettings] = useState<any[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

    const allCategories = useMemo(() => {
        const fromSettings = Array.from(new Set(evaluationSettings.map(s => s.category)));
        const defaultCats = ['Hafalan', 'Bacaan', 'Sikap'];
        return Array.from(new Set([...defaultCats, ...fromSettings])).filter(Boolean);
    }, [evaluationSettings]);

    const [newCategory, setNewCategory] = useState<string>(allCategories[0] || 'Hafalan');
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newOption, setNewOption] = useState('');
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [editCategoryName, setEditCategoryName] = useState('');

    // Evaluasi Halaqah states
    const [selectedHalaqahQuestionId, setSelectedHalaqahQuestionId] = useState<any>(null);
    const [editingHalaqahQuestion, setEditingHalaqahQuestion] = useState<any>(null);
    const [isAddingHalaqahQuestion, setIsAddingHalaqahQuestion] = useState(false);

    useEffect(() => {
        const savedColors = appSettings.find(s => s.key === 'EVALUATION_COLORS')?.value;
        if (savedColors) {
            try { setEvalColors(JSON.parse(savedColors)); } catch (e) {}
        }
    }, [appSettings]);

    useEffect(() => {
        if (!newCategory && allCategories.length > 0) {
            setNewCategory(allCategories[0]);
        }
    }, [allCategories, newCategory]);

    useEffect(() => {
        if (newCategory) {
            const settings = evaluationSettings.filter(s => s.category === newCategory);
            setLocalCategorySettings(settings);
            setLocalEvalColors(evalColors);
            setHasUnsavedChanges(false);
        }
    }, [newCategory, evaluationSettings, evalColors]);

    // Auto-select first halaqah question when entering halaqah tab
    useEffect(() => {
        if (activeEvalTab === 'halaqah' && halaqahEvalQuestions.length > 0 && !selectedHalaqahQuestionId && !isAddingHalaqahQuestion) {
            setSelectedHalaqahQuestionId(halaqahEvalQuestions[0].id);
            setEditingHalaqahQuestion(halaqahEvalQuestions[0]);
        }
    }, [activeEvalTab, halaqahEvalQuestions, selectedHalaqahQuestionId, isAddingHalaqahQuestion]);

    const handleDragStart = (e: React.DragEvent, idx: number) => {
        setDraggedIdx(idx);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", (e.target as any).innerHTML);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedIdx === null || draggedIdx === idx) return;

        const items = [...localCategorySettings];
        const draggedItem = items[draggedIdx];
        items.splice(draggedIdx, 1);
        items.splice(idx, 0, draggedItem);

        setLocalCategorySettings(items);
        setDraggedIdx(idx);
        setHasUnsavedChanges(true);
    };

    const handleDragEnd = () => {
        setDraggedIdx(null);
    };

    const handleAddLocalOption = () => {
        if (!newOption.trim()) return;
        let cat = newCategory || (allCategories[0] || 'Kategori 1');
        const newItem = { id: Date.now() * -1, category: cat, label: newOption.trim(), score: 0 };
        const newSettings = [...localCategorySettings, newItem];
        setLocalCategorySettings(newSettings);
        setNewOption('');
        setHasUnsavedChanges(true);
    };

    const handleDeleteLocalOption = (id: number) => {
        if (confirm('Hapus opsi ini?')) {
            const newSettings = localCategorySettings.filter(s => s.id !== id);
            setLocalCategorySettings(newSettings);
            setHasUnsavedChanges(true);
        }
    };

    const handleUpdateLocalColor = (label: string, color: string) => {
        setLocalEvalColors(prev => ({ ...prev, [label]: color }));
        setHasUnsavedChanges(true);
    };

    const handleSaveChanges = async () => {
        try {
            const originalSettings = evaluationSettings.filter(s => s.category === newCategory);
            const localIds = localCategorySettings.filter(s => s.id > 0).map(s => s.id);

            const toDelete = [];
            for (const orig of originalSettings) {
                if (!localIds.includes(orig.id)) {
                    toDelete.push(orig.id);
                }
            }

            const toUpdate = [];
            const toInsert = [];
            for (const item of localCategorySettings) {
                if (item.id < 0) {
                    toInsert.push({ category: item.category, label: item.label, score: item.score });
                } else {
                    const orig = originalSettings.find(s => s.id === item.id);
                    if (orig && (orig.label !== item.label || orig.score !== item.score)) {
                        toUpdate.push({ id: item.id, category: item.category, label: item.label, score: item.score });
                    }
                }
            }

            await updateEvaluationSettingsBatch(toInsert, toUpdate, toDelete);
            await saveAppSetting('EVALUATION_COLORS', JSON.stringify({ ...evalColors, ...localEvalColors }));
            setHasUnsavedChanges(false);
            alert('Perubahan opsi berhasil disimpan.');
        } catch (error) {
            console.error('Error saving evaluation settings:', error);
            alert('Gagal menyimpan perubahan opsi.');
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return alert('Masukkan nama kategori.');
        const cat = newCategoryName.trim();
        const firstOpt = newOption.trim() || 'Baik';
        try {
            await saveEvaluationSetting({ category: cat, label: firstOpt, score: 100 });
            setNewCategory(cat);
            setIsAddingCategory(false);
            setNewCategoryName('');
            setNewOption('');
            alert('Kategori berhasil ditambahkan.');
        } catch (err: any) {
            alert('Gagal menambahkan kategori: ' + err.message);
        }
    };

    const handleUpdateCategory = async () => {
        if (!editCategoryName.trim()) return;
        try {
            await updateEvaluationCategory(newCategory, editCategoryName.trim());
            setNewCategory(editCategoryName.trim());
            setIsEditingCategory(false);
            alert('Nama kategori berhasil diubah.');
        } catch (err: any) {
            alert('Gagal mengubah nama kategori: ' + err.message);
        }
    };

    const handleDeleteCategory = async () => {
        if (window.confirm(`Hapus kategori "${newCategory}" beserta SEMUA opsi dan data nilai terkait? Tindakan ini tidak dapat dibatalkan!`)) {
            try {
                await deleteEvaluationCategory(newCategory);
                const remaining = allCategories.filter(c => c !== newCategory);
                setNewCategory(remaining[0] || '');
                alert('Kategori berhasil dihapus.');
            } catch (err: any) {
                alert('Gagal menghapus kategori: ' + err.message);
            }
        }
    };

    // Halaqah Question Handlers
    const moveHalaqahOptionUp = (idx: number) => {
        if (idx <= 0 || !editingHalaqahQuestion?.options) return;
        const opts = [...editingHalaqahQuestion.options];
        [opts[idx - 1], opts[idx]] = [opts[idx], opts[idx - 1]];
        setEditingHalaqahQuestion({ ...editingHalaqahQuestion, options: opts });
    };

    const moveHalaqahOptionDown = (idx: number) => {
        if (!editingHalaqahQuestion?.options || idx >= editingHalaqahQuestion.options.length - 1) return;
        const opts = [...editingHalaqahQuestion.options];
        [opts[idx + 1], opts[idx]] = [opts[idx], opts[idx + 1]];
        setEditingHalaqahQuestion({ ...editingHalaqahQuestion, options: opts });
    };

    const updateHalaqahOptionColor = (idx: number, color: string) => {
        const opts = [...(editingHalaqahQuestion?.options || [])];
        opts[idx] = { ...opts[idx], color };
        setEditingHalaqahQuestion({ ...editingHalaqahQuestion, options: opts });
    };

    const updateHalaqahOptionLabel = (idx: number, label: string) => {
        const opts = [...(editingHalaqahQuestion?.options || [])];
        opts[idx] = { ...opts[idx], label };
        setEditingHalaqahQuestion({ ...editingHalaqahQuestion, options: opts });
    };

    const removeHalaqahOption = (idx: number) => {
        const opts = [...(editingHalaqahQuestion?.options || [])];
        opts.splice(idx, 1);
        setEditingHalaqahQuestion({ ...editingHalaqahQuestion, options: opts });
    };

    const addHalaqahOption = () => {
        const opts = [...(editingHalaqahQuestion?.options || [])];
        opts.push({ label: `Opsi ${opts.length + 1}`, color: '#cbd5e1' });
        setEditingHalaqahQuestion({ ...editingHalaqahQuestion, options: opts });
    };

    const handleSaveHalaqahQuestion = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!editingHalaqahQuestion?.question?.trim()) {
            alert('Pertanyaan harus diisi.');
            return;
        }
        try {
            const payload: any = {
                question: editingHalaqahQuestion.question.trim(),
                description: editingHalaqahQuestion.description?.trim() || null,
                type: editingHalaqahQuestion.type || 'text',
                options: editingHalaqahQuestion.type === 'dropdown' ? (editingHalaqahQuestion.options || []) : []
            };
            if (editingHalaqahQuestion.id && !isAddingHalaqahQuestion) {
                payload.id = editingHalaqahQuestion.id;
            }
            await saveHalaqahEvalQuestion(payload);
            setIsAddingHalaqahQuestion(false);
            if (payload.id) {
                setSelectedHalaqahQuestionId(payload.id);
            }
            alert('Pertanyaan evaluasi halaqah berhasil disimpan.');
        } catch (error: any) {
            console.error('Error saving halaqah question:', error);
            alert('Gagal menyimpan pertanyaan: ' + error.message);
        }
    };

    const handleDeleteHalaqahQuestion = async (id: number | string) => {
        if (window.confirm('Hapus pertanyaan ini? Data evaluasi halaqah terkait mungkin terpengaruh.')) {
            try {
                await deleteHalaqahEvalQuestion(id);
                setSelectedHalaqahQuestionId(null);
                setEditingHalaqahQuestion(null);
                setIsAddingHalaqahQuestion(false);
                alert('Pertanyaan berhasil dihapus.');
            } catch (err: any) {
                alert('Gagal menghapus pertanyaan: ' + err.message);
            }
        }
    };

    // =========================================================================
    // SECTION 4: PENGATURAN SETORAN HARIAN
    // =========================================================================
    const [skemaOptions, setSkemaOptions] = useState<string>('Ziyadah,Murojaah,Sabqi,Manzil,Lainnya');
    const [waktuMap, setWaktuMap] = useState<Record<string, string>>({});
    const [telegramEnable, setTelegramEnable] = useState<boolean>(false);
    const [telegramTemplate, setTelegramTemplate] = useState<string>(
        'Laporan Setoran Tahfidz\nSantri: {nama_santri}\nHalaqah: {halaqah}\nTanggal: {tanggal} ({waktu})\nSkema: {skema}\nSurat: {surat} Ayat: {ayat}\nNilai: {nilai}\nKhoto: {khoto_kabir} Kabir, {khoto_shoghir} Shoghir\nKeterangan: {keterangan}'
    );
    const [autoEnable, setAutoEnable] = useState<boolean>(false);
    const [autoBase, setAutoBase] = useState<number>(100);
    const [autoKabir, setAutoKabir] = useState<number>(20);
    const [autoShoghir, setAutoShoghir] = useState<number>(10);
    const [nilaiRanges, setNilaiRanges] = useState<any[]>([
        { label: 'Mumtaz', min: 90 },
        { label: 'Jayyid Jiddan', min: 80 },
        { label: 'Jayyid', min: 70 },
        { label: 'Maqbul', min: 60 },
        { label: 'Dhaif', min: 0 }
    ]);
    const [isSavingSetoran, setIsSavingSetoran] = useState(false);

    useEffect(() => {
        const skemaSetting = appSettings.find(s => s.key === 'SETORAN_SKEMA_OPTIONS');
        if (skemaSetting) setSkemaOptions(skemaSetting.value);

        const waktuSetting = appSettings.find(s => s.key === 'SETORAN_WAKTU_SKEMA_MAP');
        if (waktuSetting) {
            try { setWaktuMap(JSON.parse(waktuSetting.value)); } catch { setWaktuMap({}); }
        }

        const telEnableSetting = appSettings.find(s => s.key === 'SETORAN_TELEGRAM_NOTIF_ENABLE');
        if (telEnableSetting) setTelegramEnable(telEnableSetting.value === 'true');

        const telTemplateSetting = appSettings.find(s => s.key === 'SETORAN_TELEGRAM_NOTIF_TEMPLATE');
        if (telTemplateSetting) setTelegramTemplate(telTemplateSetting.value);

        const enableSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_ENABLE');
        if (enableSetting) setAutoEnable(enableSetting.value === 'true');

        const baseSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_BASE');
        if (baseSetting) setAutoBase(Number(baseSetting.value) || 100);

        const kabirSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_KABIR');
        if (kabirSetting) setAutoKabir(Number(kabirSetting.value) || 20);

        const shoghirSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_SHOGHIR');
        if (shoghirSetting) setAutoShoghir(Number(shoghirSetting.value) || 10);

        const rangesSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_RANGES');
        if (rangesSetting) {
            try {
                const parsed = JSON.parse(rangesSetting.value);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setNilaiRanges(parsed.map(item => ({
                        label: String(item?.label || ''),
                        min: Number(item?.min ?? 0)
                    })));
                }
            } catch (e) {
                console.error('Failed to parse rangesSetting', e);
            }
        }
    }, [appSettings]);

    const handleSaveSetoranSettings = async () => {
        setIsSavingSetoran(true);
        try {
            await saveMultipleAppSettings([
                { key: 'SETORAN_SKEMA_OPTIONS', value: skemaOptions },
                { key: 'SETORAN_WAKTU_SKEMA_MAP', value: JSON.stringify(waktuMap) },
                { key: 'SETORAN_TELEGRAM_NOTIF_ENABLE', value: telegramEnable ? 'true' : 'false' },
                { key: 'SETORAN_TELEGRAM_NOTIF_TEMPLATE', value: telegramTemplate },
                { key: 'SETORAN_AUTO_ENABLE', value: autoEnable ? 'true' : 'false' },
                { key: 'SETORAN_AUTO_BASE', value: autoBase.toString() },
                { key: 'SETORAN_AUTO_KABIR', value: autoKabir.toString() },
                { key: 'SETORAN_AUTO_SHOGHIR', value: autoShoghir.toString() },
                { key: 'SETORAN_AUTO_RANGES', value: JSON.stringify(nilaiRanges) },
                { key: 'SETORAN_NILAI_OPTIONS', value: nilaiRanges.map(r => r.label).join(',') }
            ]);
            alert('Pengaturan Setoran berhasil disimpan.');
        } catch (error) {
            console.error('Error saving setoran settings:', error);
            alert('Gagal menyimpan pengaturan setoran.');
        } finally {
            setIsSavingSetoran(false);
        }
    };

    // =========================================================================
    // SECTION 5: SINKRONISASI OTOMATIS SETORAN HARIAN KE EVALUASI PERIODIK
    // =========================================================================
    const [autoSyncConfig, setAutoSyncConfig] = useState<AutoSyncSetoranConfig>(DEFAULT_AUTO_SYNC_SETORAN_CONFIG);
    const [isSavingAutoSync, setIsSavingAutoSync] = useState(false);
    const [, setHasAutoSyncChanges] = useState(false);

    useEffect(() => {
        const syncSetting = appSettings.find(s => s.key === 'AUTO_SYNC_SETORAN_CONFIG');
        if (syncSetting && syncSetting.value) {
            try {
                const parsed = JSON.parse(syncSetting.value);
                setAutoSyncConfig({
                    enabled: parsed.enabled ?? DEFAULT_AUTO_SYNC_SETORAN_CONFIG.enabled,
                    ziyadah: {
                        enabled: parsed.ziyadah?.enabled ?? DEFAULT_AUTO_SYNC_SETORAN_CONFIG.ziyadah.enabled,
                        selected_schemes: Array.isArray(parsed.ziyadah?.selected_schemes) 
                            ? parsed.ziyadah.selected_schemes 
                            : DEFAULT_AUTO_SYNC_SETORAN_CONFIG.ziyadah.selected_schemes,
                        min_nilai: parsed.ziyadah?.min_nilai || DEFAULT_AUTO_SYNC_SETORAN_CONFIG.ziyadah.min_nilai,
                    },
                    murojaah: {
                        enabled: parsed.murojaah?.enabled ?? DEFAULT_AUTO_SYNC_SETORAN_CONFIG.murojaah.enabled,
                        selected_schemes: Array.isArray(parsed.murojaah?.selected_schemes)
                            ? parsed.murojaah.selected_schemes
                            : DEFAULT_AUTO_SYNC_SETORAN_CONFIG.murojaah.selected_schemes,
                    },
                    hafalan: {
                        enabled: parsed.hafalan?.enabled ?? DEFAULT_AUTO_SYNC_SETORAN_CONFIG.hafalan.enabled,
                        method: parsed.hafalan?.method || 'history_and_juz',
                    },
                    kelancaran: {
                        enabled: parsed.kelancaran?.enabled ?? DEFAULT_AUTO_SYNC_SETORAN_CONFIG.kelancaran.enabled,
                        target_category_id: parsed.kelancaran?.target_category_id || (allCategories[0] || 'Hafalan'),
                        thresholds: {
                            lancar: Number(parsed.kelancaran?.thresholds?.lancar ?? 2.5),
                            sedang: Number(parsed.kelancaran?.thresholds?.sedang ?? 1.6),
                        },
                        rules: Array.isArray(parsed.kelancaran?.rules) ? parsed.kelancaran.rules : [],
                        fallback_option: parsed.kelancaran?.fallback_option || undefined
                    }
                });
                setHasAutoSyncChanges(false);
            } catch (e) {
                console.error('Error parsing AUTO_SYNC_SETORAN_CONFIG', e);
            }
        }
    }, [appSettings, allCategories]);

    const dynamicSchemeOptions = useMemo(() => {
        const list = (typeof skemaOptions === 'string' ? skemaOptions : '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (list.length > 0) return list;
        return ['Ziyadah', 'Murojaah', 'Sabqi', 'Manzil'];
    }, [skemaOptions]);

    const dynamicNilaiOptions = useMemo(() => {
        const fromRanges = (Array.isArray(nilaiRanges) ? nilaiRanges : []).map(r => r?.label?.trim()).filter(Boolean);
        if (fromRanges.length > 0) return fromRanges;
        const fromSetting = appSettings.find(s => s.key === 'SETORAN_NILAI_OPTIONS')?.value;
        if (fromSetting) {
            return fromSetting.split(',').map(s => s.trim()).filter(Boolean);
        }
        return ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Dhaif'];
    }, [nilaiRanges, appSettings]);

    // Opsi dinamis kategori kuesioner yang dipilih untuk kelancaran
    const targetKelancaranCategory = autoSyncConfig.kelancaran?.target_category_id || (allCategories[0] || 'Hafalan');

    const categoryAvailableSettings = useMemo(() => {
        const fromSettings = evaluationSettings.filter(s => s.category.toLowerCase().trim() === targetKelancaranCategory.toLowerCase().trim());
        return [...fromSettings].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.order_index ?? 0) - (b.order_index ?? 0));
    }, [targetKelancaranCategory, evaluationSettings]);

    const categoryAvailableOptions = useMemo(() => {
        if (categoryAvailableSettings.length > 0) {
            return categoryAvailableSettings.map(s => s.label);
        }
        return [];
    }, [categoryAvailableSettings]);

    // Default kosong, tidak ada prefilled tingkat 1 atau fallback
    const activeKelancaranRules = useMemo(() => {
        return autoSyncConfig.kelancaran?.rules || [];
    }, [autoSyncConfig.kelancaran?.rules]);

    const activeFallbackOption = autoSyncConfig.kelancaran?.fallback_option || '';

    const handleUpdateKelancaranRule = (index: number, field: 'option_label' | 'min_score', value: any) => {
        const currentRules = [...activeKelancaranRules];
        if (!currentRules[index]) return;
        currentRules[index] = {
            ...currentRules[index],
            [field]: field === 'min_score' ? (value === '' ? '' : (parseFloat(value) || 0)) : value
        };
        setAutoSyncConfig(prev => ({
            ...prev,
            kelancaran: {
                ...prev.kelancaran,
                rules: currentRules
            }
        }));
        setHasAutoSyncChanges(true);
    };

    const handleAddKelancaranRule = () => {
        const nextSetting = categoryAvailableSettings.find(s => !activeKelancaranRules.some(r => r.option_label === s.label)) || categoryAvailableSettings[0];
        const nextOption = nextSetting?.label || (categoryAvailableOptions[0] || 'Opsi');
        const defaultScore = nextSetting?.score !== undefined 
            ? nextSetting.score 
            : (activeKelancaranRules.length > 0 ? Math.max(1.0, Math.round((activeKelancaranRules[activeKelancaranRules.length - 1].min_score - 0.5) * 10) / 10) : 2.5);

        const updated = [...activeKelancaranRules, { option_label: nextOption, min_score: defaultScore }];
        setAutoSyncConfig(prev => ({
            ...prev,
            kelancaran: {
                ...prev.kelancaran,
                rules: updated
            }
        }));
        setHasAutoSyncChanges(true);
    };

    const handleRemoveKelancaranRule = (index: number) => {
        const updated = activeKelancaranRules.filter((_, i) => i !== index);
        setAutoSyncConfig(prev => ({
            ...prev,
            kelancaran: {
                ...prev.kelancaran,
                rules: updated,
                fallback_option: updated.length === 0 ? undefined : prev.kelancaran?.fallback_option
            }
        }));
        setHasAutoSyncChanges(true);
    };

    const handleFallbackOptionChange = (opt: string) => {
        setAutoSyncConfig(prev => ({
            ...prev,
            kelancaran: {
                ...prev.kelancaran,
                fallback_option: opt || undefined
            }
        }));
        setHasAutoSyncChanges(true);
    };

    const handleTargetCategoryChange = (newCat: string) => {
        setAutoSyncConfig(prev => ({
            ...prev,
            kelancaran: {
                ...prev.kelancaran,
                target_category_id: newCat,
                rules: [],
                fallback_option: undefined
            }
        }));
        setHasAutoSyncChanges(true);
    };

    const handleToggleZiyadahScheme = (scheme: string) => {
        setAutoSyncConfig(prev => {
            const current = prev.ziyadah?.selected_schemes || [];
            const updated = current.includes(scheme)
                ? current.filter(s => s !== scheme)
                : [...current, scheme];
            return {
                ...prev,
                ziyadah: {
                    ...prev.ziyadah,
                    selected_schemes: updated
                }
            };
        });
        setHasAutoSyncChanges(true);
    };

    const handleToggleMurojaahScheme = (scheme: string) => {
        setAutoSyncConfig(prev => {
            const current = prev.murojaah?.selected_schemes || [];
            const updated = current.includes(scheme)
                ? current.filter(s => s !== scheme)
                : [...current, scheme];
            return {
                ...prev,
                murojaah: {
                    ...prev.murojaah,
                    selected_schemes: updated
                }
            };
        });
        setHasAutoSyncChanges(true);
    };

    const handleSaveAutoSyncConfig = async () => {
        setIsSavingAutoSync(true);
        try {
            const configToSave = {
                ...autoSyncConfig,
                kelancaran: {
                    ...autoSyncConfig.kelancaran,
                    rules: (autoSyncConfig.kelancaran?.rules || []).map(r => ({
                        option_label: r.option_label,
                        min_score: Number(r.min_score) || 0
                    }))
                }
            };
            await saveAppSetting('AUTO_SYNC_SETORAN_CONFIG', JSON.stringify(configToSave));
            setHasAutoSyncChanges(false);
            alert('Pengaturan Sinkronisasi Otomatis berhasil disimpan.');
        } catch (error: any) {
            console.error('Error saving auto sync config:', error);
            alert('Gagal menyimpan pengaturan sinkronisasi: ' + (error?.message || 'Terjadi kesalahan'));
        } finally {
            setIsSavingAutoSync(false);
        }
    };

    return (
        <div className="space-y-8 font-sans min-h-screen max-w-[1400px] mx-auto pb-16 pt-2 px-2 sm:px-4 lg:px-6">
            {/* Page Header (Tanpa ikon gerigi/settings) */}
            <div className="border-b border-slate-200 pb-5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-1">
                    Pengaturan Evaluasi
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    Konfigurasi terpadu: periode evaluasi, target setoran, poin evaluasi kuesioner, dan skema setoran harian.
                </p>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 1: KELOLA PERIODE EVALUASI */}
            {/* ========================================================================= */}
            <div className="space-y-4">
                <div className="pb-1">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Kelola Periode Evaluasi</h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-medium">
                        Tentukan rentang tanggal mulai dan selesai untuk siklus evaluasi bulanan/semester santri.
                    </p>
                </div>

                {/* 2-Column layout langsung tanpa kontainer pembungkus ganda */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
                    {/* Left Column: Daftar Periode */}
                    <div className="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                        <div className="p-3.5 border-b border-slate-100 bg-slate-50/60">
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                                Daftar Periode
                            </h4>
                        </div>

                        <div className="p-2 space-y-1.5 overflow-y-auto max-h-[380px] flex-1">
                            {masterPeriods.map(p => {
                                const isSelected = editingPeriod?.id === p.id && !editingPeriod?.isNew;
                                return (
                                    <div 
                                        key={p.id}
                                        onClick={() => setEditingPeriod(p)}
                                        className={`w-full flex items-center justify-between p-3.5 rounded-xl text-xs transition-all cursor-pointer border ${
                                            isSelected
                                                ? 'bg-blue-50 border-blue-200 text-blue-900 shadow-2xs font-bold'
                                                : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700'
                                        }`}
                                    >
                                        <div className="truncate pr-2 flex-1">
                                            <div className="font-bold truncate text-slate-900">{p.name || p.id}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5 truncate font-medium">
                                                {p.startDate ? format(new Date(p.startDate), 'dd MMM yyyy') : '-'} s/d {p.endDate ? format(new Date(p.endDate), 'dd MMM yyyy') : '-'}
                                            </div>
                                        </div>
                                        <div className="flex items-center shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePeriod(p.id);
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                title="Hapus Periode"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {masterPeriods.length === 0 && (
                                <p className="text-xs text-slate-400 italic text-center py-6">Belum ada periode evaluasi.</p>
                            )}
                        </div>

                        {/* Tombol Tambah Periode di bagian bawah */}
                        <div className="p-3 border-t border-slate-200/60 bg-slate-50 mt-auto">
                            <button 
                                type="button"
                                onClick={() => {
                                    setEditingPeriod({ id: Date.now().toString(), name: '', startDate: '', endDate: '', isNew: true });
                                }}
                                className="w-full flex items-center justify-center py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
                            >
                                <Plus size={15} className="mr-1.5 text-slate-400" strokeWidth={2.5}/> Tambah Periode
                            </button>
                        </div>
                    </div>

                    {/* Right Column: Konfigurasi Periode */}
                    <div className="lg:col-span-8 bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/80 overflow-y-auto max-h-[500px] shadow-2xs">
                        {editingPeriod ? (
                            <form onSubmit={handleSavePeriod} className="space-y-5">
                                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900">
                                            {editingPeriod.isNew ? 'Tambah Periode Baru' : 'Edit Periode Evaluasi'}
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Tentukan nama dan rentang tanggal pelaksanaan evaluasi santri.
                                        </p>
                                    </div>
                                    {!editingPeriod.isNew && (
                                        <button
                                            type="button"
                                            onClick={() => handleDeletePeriod(editingPeriod.id)}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                            title="Hapus Periode"
                                        >
                                            <Trash2 size={16} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-4 max-w-lg">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Nama Periode
                                        </label>
                                        <input 
                                            type="text" 
                                            placeholder="Contoh: September 2026"
                                            value={editingPeriod.name || ''} 
                                            onChange={e => setEditingPeriod({ ...editingPeriod, name: e.target.value })}
                                            className="w-full text-xs font-semibold text-slate-800 bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Tanggal Mulai
                                        </label>
                                        <input 
                                            type="date" 
                                            value={editingPeriod.startDate || ''} 
                                            onChange={e => setEditingPeriod({ ...editingPeriod, startDate: e.target.value })}
                                            className="w-full text-xs font-semibold text-slate-800 bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Tanggal Selesai
                                        </label>
                                        <input 
                                            type="date" 
                                            value={editingPeriod.endDate || ''} 
                                            onChange={e => setEditingPeriod({ ...editingPeriod, endDate: e.target.value })}
                                            className="w-full text-xs font-semibold text-slate-800 bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                            required
                                        />
                                    </div>

                                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                                        {editingPeriod.isNew && (
                                            <button 
                                                type="button" 
                                                onClick={() => setEditingPeriod(masterPeriods[0] || null)} 
                                                className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                                            >
                                                Batal
                                            </button>
                                        )}
                                        <button 
                                            type="submit" 
                                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                                        >
                                            Simpan Periode
                                        </button>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                                <LayoutList size={40} strokeWidth={1.5} className="mb-3 text-slate-300"/>
                                <p className="text-xs font-medium">Pilih periode di samping untuk melihat dan mengedit konfigurasi.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 2: KELOLA TARGET SETORAN */}
            {/* ========================================================================= */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-3">
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Kelola Target Setoran</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleSaveTargets}
                            disabled={isSavingTargets}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Save size={15} />
                            <span>{isSavingTargets ? 'Menyimpan...' : 'Simpan Semua Target'}</span>
                        </button>
                    </div>
                </div>

                {/* Sub-tabs: Target Hafalan vs Target Murojaah */}
                <div className="flex border-b border-slate-200 gap-6 overflow-x-auto hide-scrollbar">
                    <button
                        type="button"
                        onClick={() => setTargetActiveTab('hafalan')}
                        className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${
                            targetActiveTab === 'hafalan'
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Target Hafalan
                    </button>
                    <button
                        type="button"
                        onClick={() => setTargetActiveTab('murojaah')}
                        className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${
                            targetActiveTab === 'murojaah'
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Target Murojaah
                    </button>
                </div>

                {/* Content: Target Hafalan (Hanya menampilkan target hafalan saja) */}
                {targetActiveTab === 'hafalan' && (
                    <div className="space-y-6">
                        {activeMarhalahs.map(m => {
                            const kelasForMarhalah = getKelasListForMarhalah(m);
                            return (
                                <div key={m.id || m.nama} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                                    <div className="bg-slate-50/80 px-5 py-3.5 font-bold text-sm text-slate-700 border-b border-slate-200/80 flex items-center justify-between">
                                        <span className="font-bold text-slate-800">Marhalah {m.nama}</span>
                                        <span className="text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                                            {kelasForMarhalah.length} Kelas
                                        </span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {kelasForMarhalah.map(k => (
                                            <div key={k.id || k.nama_kelas} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors pl-6 sm:pl-8 border-l-4 border-l-blue-500/40">
                                                <div className="text-xs font-semibold text-slate-700">
                                                    Kelas: <span className="font-bold text-slate-900 text-sm ml-1">{k.nama_kelas}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number" 
                                                        step="0.5" 
                                                        value={targets[activeSemester]?.[m.nama]?.[k.nama_kelas]?.hafalan ?? ''}
                                                        onChange={(e) => handleTargetChange(activeSemester, m.nama, k.nama_kelas, 'hafalan', parseFloat(e.target.value) || 0)}
                                                        className="w-24 text-center text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
                                                        placeholder="0"
                                                    />
                                                    <span className="text-xs font-bold text-slate-400">JUZ</span>
                                                </div>
                                            </div>
                                        ))}
                                        {kelasForMarhalah.length === 0 && (
                                            <div className="p-5 text-center text-slate-400 text-xs italic">
                                                Belum ada kelas yang terdaftar pada marhalah ini.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Content: Target Murojaah (Aturan Ambang Batas Global) */}
                {targetActiveTab === 'murojaah' && (
                    <div className="space-y-6">
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                            Tentukan target hafalan Murojaah bulanan berdasarkan ambang batas capaian hafalan santri (Juz) untuk masing-masing Marhalah.
                        </p>
                        {activeMarhalahs.map(m => {
                            const rules = murojaahRules[m.nama] || [];
                            return (
                                <div key={m.id || m.nama} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                                    <div className="bg-slate-50/80 px-5 py-3.5 font-bold text-sm text-slate-700 border-b border-slate-200/80 flex justify-between items-center">
                                        <span className="font-bold text-slate-800">Marhalah {m.nama}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => handleAddMurojaahRule(m.nama)}
                                            className="text-[11px] flex items-center gap-1 font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-xl transition-colors border border-blue-200 cursor-pointer"
                                        >
                                            <Plus size={13} /> Tambah Ambang Batas
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-3">
                                        {rules.length === 0 ? (
                                            <div className="text-center py-6 text-slate-400 text-xs font-medium border-2 border-dashed border-slate-100 rounded-xl">
                                                Belum ada aturan ambang batas untuk Marhalah {m.nama}.
                                            </div>
                                        ) : (
                                            rules.map((rule, idx) => (
                                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50/70 border border-slate-200/80 p-3.5 rounded-xl">
                                                    <div className="flex-1">
                                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">JIKA CAPAIAN HAFALAN &ge;</label>
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="number" 
                                                                step="0.5" 
                                                                value={rule.min_capaian}
                                                                onChange={(e) => handleMurojaahRuleChange(m.nama, idx, 'min_capaian', parseFloat(e.target.value) || 0)}
                                                                className="w-20 text-center text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                            />
                                                            <span className="text-xs font-bold text-slate-400">JUZ</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-300 hidden sm:block mt-4">&rarr;</div>
                                                    <div className="flex-1">
                                                        <label className="block text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">TARGET MUROJAAH (BLN)</label>
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="number" 
                                                                step="0.5" 
                                                                value={rule.target}
                                                                onChange={(e) => handleMurojaahRuleChange(m.nama, idx, 'target', parseFloat(e.target.value) || 0)}
                                                                className="w-20 text-center text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                            />
                                                            <span className="text-xs font-bold text-slate-400">JUZ</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveMurojaahRule(m.nama, idx)}
                                                        className="sm:ml-auto p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer self-end sm:self-center mt-2 sm:mt-0"
                                                        title="Hapus Aturan"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* SECTION 3: POIN EVALUASI (SANTRI & HALAQAH) */}
            {/* ========================================================================= */}
            <div className="space-y-4">
                <div className="pb-1">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Poin Evaluasi & Pertanyaan Halaqah</h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-medium">
                        Kelola kategori kuesioner evaluasi santri, opsi predikat nilai (skor % & warna), serta evaluasi halaqah.
                    </p>
                </div>

                {/* Sub-tabs: Evaluasi Santri vs Evaluasi Halaqah */}
                <div className="flex border-b border-slate-200 gap-6 overflow-x-auto hide-scrollbar">
                    <button 
                        type="button"
                        className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${activeEvalTab === 'santri' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        onClick={() => { if(hasUnsavedChanges && !confirm('Ada perubahan belum disimpan. Lanjutkan?')) return; setHasUnsavedChanges(false); setActiveEvalTab('santri'); }}
                    >
                        Evaluasi Santri
                    </button>
                    <button 
                        type="button"
                        className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${activeEvalTab === 'halaqah' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        onClick={() => { if(hasUnsavedChanges && !confirm('Ada perubahan belum disimpan. Lanjutkan?')) return; setHasUnsavedChanges(false); setActiveEvalTab('halaqah'); }}
                    >
                        Evaluasi Halaqah
                    </button>
                </div>

                {/* ================= EVALUASI SANTRI LAYOUT ================= */}
                {activeEvalTab === 'santri' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
                        {/* Left Categories Sidebar */}
                        <div className="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                            <div className="p-3.5 border-b border-slate-100 bg-slate-50/60">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                                    Kategori Evaluasi
                                </h4>
                            </div>

                            <div className="p-2 space-y-1 overflow-y-auto max-h-[380px] flex-1">
                                {allCategories.map(c => (
                                    <button 
                                        key={c}
                                        type="button"
                                        onClick={() => { 
                                            if (hasUnsavedChanges && !confirm('Ada perubahan yang belum disimpan. Pindah kategori akan membuang perubahan. Lanjutkan?')) return;
                                            setHasUnsavedChanges(false);
                                            setNewCategory(c); 
                                            setIsAddingCategory(false); 
                                            setIsEditingCategory(false); 
                                        }}
                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                            newCategory === c && !isAddingCategory 
                                                ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-2xs font-bold' 
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <LayoutList size={14} className={newCategory === c && !isAddingCategory ? 'text-blue-600' : 'text-slate-400'} />
                                            <span className="truncate">{c}</span>
                                        </div>
                                        <ChevronRight size={13} className={newCategory === c && !isAddingCategory ? 'text-blue-500' : 'text-slate-300'} />
                                    </button>
                                ))}
                            </div>

                            {/* Tombol Tambah Kategori di bagian bawah */}
                            <div className="p-3 border-t border-slate-200/60 bg-slate-50 mt-auto">
                                <button 
                                    type="button"
                                    onClick={() => { 
                                        if (hasUnsavedChanges && !confirm('Ada perubahan belum disimpan. Lanjutkan?')) return;
                                        setHasUnsavedChanges(false);
                                        setIsAddingCategory(true); 
                                        setNewCategory(''); 
                                    }}
                                    className="w-full flex items-center justify-center py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
                                >
                                    <Plus size={15} className="mr-1.5 text-slate-400" strokeWidth={2.5}/> Tambah Kategori
                                </button>
                            </div>
                        </div>

                        {/* Right Options Content */}
                        <div className="lg:col-span-8 bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/80 overflow-y-auto max-h-[500px] shadow-2xs">
                            {isAddingCategory ? (
                                <div className="max-w-lg space-y-4">
                                    <h3 className="text-base font-bold text-slate-800">Tambah Kategori Baru</h3>
                                    <p className="text-xs text-slate-500">Buat kategori kuesioner evaluasi baru beserta opsi predikat pertamanya.</p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Nama Kategori</label>
                                            <input 
                                                type="text" 
                                                placeholder="Contoh: Kedisiplinan Halaqah" 
                                                className="w-full text-xs font-semibold border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                value={newCategoryName}
                                                onChange={e => setNewCategoryName(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Opsi Predikat Pertama</label>
                                            <input 
                                                type="text" 
                                                placeholder="Contoh: Sangat Disiplin" 
                                                className="w-full text-xs font-semibold border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                value={newOption}
                                                onChange={e => setNewOption(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            <button type="button" onClick={() => setIsAddingCategory(false)} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer">Batal</button>
                                            <button type="button" onClick={handleAddCategory} className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 cursor-pointer shadow-sm">Simpan Kategori</button>
                                        </div>
                                    </div>
                                </div>
                            ) : newCategory ? (
                                <div className="space-y-5">
                                    {/* Configuration Header with Pencil & Trash */}
                                    <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                                        {isEditingCategory ? (
                                            <div className="flex items-center gap-2 w-full max-w-md">
                                                <input 
                                                    className="flex-1 text-sm font-bold text-slate-800 border-b-2 border-blue-500 px-2 py-1 outline-none bg-blue-50/50 rounded"
                                                    value={editCategoryName}
                                                    onChange={e => setEditCategoryName(e.target.value)}
                                                    autoFocus
                                                />
                                                <button type="button" onClick={handleUpdateCategory} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer" title="Simpan"><CheckSquare size={18}/></button>
                                                <button type="button" onClick={() => setIsEditingCategory(false)} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg cursor-pointer" title="Batal"><X size={18}/></button>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <h3 className="text-base font-bold text-slate-900">{newCategory}</h3>
                                                    <p className="text-xs text-slate-500 mt-0.5">Kelola opsi penilaian yang akan ditampilkan saat pengguna memilih kategori ini.</p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {hasUnsavedChanges && (
                                                        <button type="button" onClick={handleSaveChanges} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer mr-1">
                                                            <Save size={14} /> Simpan
                                                        </button>
                                                    )}
                                                    <button 
                                                        type="button" 
                                                        onClick={() => { setEditCategoryName(newCategory); setIsEditingCategory(true); }} 
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                                                        title="Edit Nama Kategori"
                                                    >
                                                        <Edit2 size={16} strokeWidth={2.5}/>
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        onClick={handleDeleteCategory} 
                                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                                        title="Hapus Kategori"
                                                    >
                                                        <Trash2 size={16} strokeWidth={2.5}/>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Options List */}
                                    <div className="space-y-2.5">
                                        {localCategorySettings.map((s, idx) => (
                                            <div 
                                                key={s.id} 
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, idx)}
                                                onDragOver={(e) => handleDragOver(e, idx)}
                                                onDragEnd={handleDragEnd}
                                                className={`flex items-center bg-slate-50/70 border border-slate-200/80 p-3 rounded-xl hover:bg-white hover:border-slate-300 transition-all group ${draggedIdx === idx ? 'opacity-40' : ''}`}
                                            >
                                                <div className="text-slate-300 mr-2.5 cursor-grab hover:text-blue-500 transition-colors"><GripVertical size={15}/></div>
                                                <ColorPicker 
                                                    initialColor={localEvalColors[s.label] || '#cbd5e1'} 
                                                    onChangeComplete={(c) => handleUpdateLocalColor(s.label, c)} 
                                                />
                                                <span className="flex-1 text-xs font-bold text-slate-800">{s.label}</span>
                                                <div className="flex items-center gap-2 mr-3">
                                                    <span className="text-[11px] text-slate-500 font-semibold">Skor:</span>
                                                    <input
                                                        type="number"
                                                        value={s.score || 0}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            const newSettings = [...localCategorySettings];
                                                            newSettings[idx] = { ...newSettings[idx], score: val };
                                                            setLocalCategorySettings(newSettings);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className="w-16 px-2 py-1 text-xs font-bold text-center border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                    />
                                                    <span className="text-[11px] text-slate-400 font-bold">%</span>
                                                </div>
                                                <button type="button" onClick={() => handleDeleteLocalOption(s.id)} className="text-slate-300 hover:text-rose-500 p-1 rounded-md transition-colors cursor-pointer">
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>
                                        ))}
                                        {localCategorySettings.length === 0 && (
                                            <p className="text-xs text-slate-400 italic text-center py-5 border border-dashed border-slate-200 rounded-xl">
                                                Belum ada opsi untuk kategori ini.
                                            </p>
                                        )}
                                    </div>

                                    {/* Tambah Opsi Input */}
                                    <div className="flex gap-2 pt-2">
                                        <input 
                                            type="text" 
                                            placeholder="Ketik opsi predikat baru..." 
                                            className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={newOption}
                                            onChange={e => setNewOption(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddLocalOption()}
                                        />
                                        <button type="button" onClick={handleAddLocalOption} className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer">
                                            + Tambah Opsi
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                                    <LayoutList size={40} strokeWidth={1.5} className="mb-3 text-slate-300"/>
                                    <p className="text-xs font-medium">Pilih kategori di samping untuk melihat dan mengelola opsi.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ================= EVALUASI HALAQAH LAYOUT ================= */}
                {activeEvalTab === 'halaqah' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
                        {/* Left Questions Sidebar */}
                        <div className="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
                            <div className="p-3.5 border-b border-slate-100 bg-slate-50/60">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                                    Daftar Pertanyaan
                                </h4>
                            </div>

                            <div className="p-2 space-y-1 overflow-y-auto max-h-[380px] flex-1">
                                {halaqahEvalQuestions.map((q: any) => (
                                    <button 
                                        key={q.id}
                                        type="button"
                                        onClick={() => { 
                                            setSelectedHalaqahQuestionId(q.id); 
                                            setEditingHalaqahQuestion(q);
                                            setIsAddingHalaqahQuestion(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                            (selectedHalaqahQuestionId === q.id || editingHalaqahQuestion?.id === q.id) && !isAddingHalaqahQuestion 
                                                ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-2xs font-bold' 
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <LayoutList size={14} className={(selectedHalaqahQuestionId === q.id || editingHalaqahQuestion?.id === q.id) && !isAddingHalaqahQuestion ? 'text-blue-600' : 'text-slate-400'} />
                                            <span className="truncate">{q.question}</span>
                                        </div>
                                        <ChevronRight size={13} className={(selectedHalaqahQuestionId === q.id || editingHalaqahQuestion?.id === q.id) && !isAddingHalaqahQuestion ? 'text-blue-500' : 'text-slate-300'} />
                                    </button>
                                ))}
                                {halaqahEvalQuestions.length === 0 && (
                                    <p className="text-xs text-slate-400 italic text-center py-6">Belum ada pertanyaan.</p>
                                )}
                            </div>

                            {/* Tombol Tambah Pertanyaan di bagian bawah */}
                            <div className="p-3 border-t border-slate-200/60 bg-slate-50 mt-auto">
                                <button 
                                    type="button"
                                    onClick={() => { 
                                        setIsAddingHalaqahQuestion(true); 
                                        setSelectedHalaqahQuestionId(null);
                                        setEditingHalaqahQuestion({ 
                                            question: '', 
                                            description: '',
                                            type: 'text', 
                                            options: [
                                                { label: 'Opsi 1', color: '#cbd5e1' },
                                                { label: 'Opsi 2', color: '#94a3b8' }
                                            ] 
                                        });
                                    }}
                                    className="w-full flex items-center justify-center py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
                                >
                                    <Plus size={15} className="mr-1.5 text-slate-400" strokeWidth={2.5}/> Tambah Pertanyaan
                                </button>
                            </div>
                        </div>

                        {/* Right Question Configuration Area */}
                        <div className="lg:col-span-8 bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/80 overflow-y-auto max-h-[500px] shadow-2xs">
                            {isAddingHalaqahQuestion || editingHalaqahQuestion ? (
                                <div className="space-y-5">
                                    <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900">
                                                {isAddingHalaqahQuestion ? 'Tambah Pertanyaan Baru' : 'Edit Pertanyaan'}
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-0.5">Konfigurasi pertanyaan yang akan dijawab saat evaluasi halaqah.</p>
                                        </div>
                                        {!isAddingHalaqahQuestion && editingHalaqahQuestion?.id && (
                                            <button 
                                                type="button" 
                                                onClick={() => handleDeleteHalaqahQuestion(editingHalaqahQuestion.id)} 
                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                                title="Hapus Pertanyaan"
                                            >
                                                <Trash2 size={16} strokeWidth={2.5}/>
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        {/* Pertanyaan */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">Pertanyaan</label>
                                            <input 
                                                type="text" 
                                                value={editingHalaqahQuestion?.question || ''} 
                                                onChange={e => setEditingHalaqahQuestion((prev: any) => ({ ...prev, question: e.target.value }))}
                                                placeholder="Cth: Kelengkapan Santri"
                                                className="w-full text-xs font-semibold text-slate-800 bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                                                required
                                            />
                                        </div>

                                        {/* Penjelasan (Opsional) */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">Penjelasan (Opsional)</label>
                                            <textarea 
                                                value={editingHalaqahQuestion?.description || ''} 
                                                onChange={e => setEditingHalaqahQuestion((prev: any) => ({ ...prev, description: e.target.value }))}
                                                placeholder="Tambahkan instruksi jika diperlukan..."
                                                rows={2}
                                                className="w-full text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors resize-y"
                                            />
                                        </div>

                                        {/* Jenis Jawaban */}
                                        <div className="w-full sm:w-1/2">
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">Jenis Jawaban</label>
                                            <div className="relative">
                                                <select 
                                                    value={editingHalaqahQuestion?.type || 'text'} 
                                                    onChange={e => {
                                                        const newType = e.target.value as 'text' | 'dropdown';
                                                        setEditingHalaqahQuestion((prev: any) => ({
                                                            ...prev,
                                                            type: newType,
                                                            options: newType === 'dropdown' 
                                                                ? (prev?.options && prev.options.length > 0 ? prev.options : [{ label: 'Opsi 1', color: '#cbd5e1' }, { label: 'Opsi 2', color: '#94a3b8' }]) 
                                                                : undefined
                                                        }));
                                                    }}
                                                    className="w-full text-xs font-semibold text-slate-700 bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                                                >
                                                    <option value="text">Teks Bebas</option>
                                                    <option value="dropdown">Pilihan (Dropdown)</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Pilihan Jawaban jika Dropdown */}
                                        {editingHalaqahQuestion?.type === 'dropdown' && (
                                            <div className="pt-3 border-t border-slate-100 space-y-3">
                                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Pilihan Jawaban</h4>
                                                <div className="space-y-2.5">
                                                    {(editingHalaqahQuestion.options || []).map((opt: any, idx: number) => (
                                                        <div key={idx} className="flex items-center bg-slate-50/70 border border-slate-200/80 p-3 rounded-xl hover:bg-white hover:border-slate-300 transition-all group">
                                                            {/* Arrow up/down */}
                                                            <div className="flex flex-col items-center mr-2.5 gap-0.5">
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => moveHalaqahOptionUp(idx)} 
                                                                    disabled={idx === 0} 
                                                                    className="text-slate-300 hover:text-blue-500 disabled:opacity-20 p-0.5 cursor-pointer"
                                                                >
                                                                    <ChevronUp size={13} strokeWidth={3}/>
                                                                </button>
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => moveHalaqahOptionDown(idx)} 
                                                                    disabled={idx === (editingHalaqahQuestion.options?.length || 0) - 1} 
                                                                    className="text-slate-300 hover:text-blue-500 disabled:opacity-20 p-0.5 cursor-pointer"
                                                                >
                                                                    <ChevronDown size={13} strokeWidth={3}/>
                                                                </button>
                                                            </div>
                                                            <ColorPicker 
                                                                initialColor={opt.color || '#cbd5e1'}
                                                                onChangeComplete={c => updateHalaqahOptionColor(idx, c)}
                                                            />
                                                            <input 
                                                                type="text" 
                                                                value={opt.label || ''} 
                                                                onChange={e => updateHalaqahOptionLabel(idx, e.target.value)}
                                                                className="flex-1 text-xs font-bold text-slate-800 outline-none bg-transparent"
                                                                placeholder={`Opsi ${idx + 1}`}
                                                            />
                                                            <button 
                                                                type="button" 
                                                                onClick={() => removeHalaqahOption(idx)}
                                                                className="text-slate-300 hover:text-rose-500 p-1 rounded-md transition-colors cursor-pointer"
                                                            >
                                                                <Trash2 size={14}/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="pt-1">
                                                    <button 
                                                        type="button" 
                                                        onClick={addHalaqahOption} 
                                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                    >
                                                        <Plus size={13}/> Tambah Pilihan
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Submit Button */}
                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                                            <button 
                                                type="button" 
                                                onClick={() => { setIsAddingHalaqahQuestion(false); setEditingHalaqahQuestion(null); setSelectedHalaqahQuestionId(null); }} 
                                                className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                                            >
                                                Batal
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={handleSaveHalaqahQuestion} 
                                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                                            >
                                                Simpan Pertanyaan
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                                    <LayoutList size={40} strokeWidth={1.5} className="mb-3 text-slate-300"/>
                                    <p className="text-xs font-medium">Pilih pertanyaan di samping untuk melihat dan mengedit detail.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* SECTION 4: PENGATURAN SETORAN HARIAN */}
            {/* ========================================================================= */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-3">
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Pengaturan Setoran Harian</h2>
                        <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-medium">
                            Kelola opsi skema setoran harian, tautan waktu halaqah, sistem penilaian otomatis, dan notifikasi telegram.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSaveSetoranSettings}
                        disabled={isSavingSetoran}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto shrink-0"
                    >
                        <Save size={15} />
                        <span>{isSavingSetoran ? 'Menyimpan...' : 'Simpan Pengaturan Setoran'}</span>
                    </button>
                </div>

                {/* ROW 1: Tautan Waktu & Automasi Perhitungan Nilai */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start">
                    {/* 1. Tautan Waktu ke Skema Default */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-3.5 self-start w-full">
                        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Tautan Waktu ke Skema Default
                        </label>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Pilih skema default otomatis saat guru menginput setoran berdasarkan waktu halaqah.
                        </p>
                        <div className="space-y-2 pt-1">
                            {(globalWaktuHalaqah || []).map(waktu => (
                                <div key={waktu} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/70 px-3.5 py-2.5 rounded-xl border border-slate-200/70 text-xs gap-2">
                                    <span className="font-bold text-slate-700">{waktu}</span>
                                    <select 
                                        value={(waktuMap || {})[waktu] || ''} 
                                        onChange={e => setWaktuMap({ ...(waktuMap || {}), [waktu]: e.target.value })}
                                        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                    >
                                        <option value="">Pilih Skema</option>
                                        {(typeof skemaOptions === 'string' ? skemaOptions : '').split(',').map(s => s.trim()).filter(Boolean).map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                            {(!globalWaktuHalaqah || globalWaktuHalaqah.length === 0) && (
                                <p className="text-xs text-slate-400 italic py-2">Belum ada data waktu halaqah.</p>
                            )}
                        </div>
                    </div>

                    {/* 2. Automasi Perhitungan Nilai Setoran */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 self-start w-full">
                        <div className="flex items-center justify-between gap-3">
                            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                Automasi Perhitungan Nilai Setoran
                            </label>
                            {/* Toggle switch button modern, aman & anti-blank */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={autoEnable}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setAutoEnable(prev => !prev);
                                }}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    autoEnable ? 'bg-blue-600' : 'bg-slate-300'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        autoEnable ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>

                        {autoEnable && (
                            <div className="space-y-4 pt-3 border-t border-slate-100">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/70">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nilai Awal (Base)</label>
                                        <input 
                                            type="number" 
                                            value={autoBase ?? 100}
                                            onChange={e => setAutoBase(Number(e.target.value))}
                                            className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-center bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                    <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/70">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Minus Khoto Kabir</label>
                                        <input 
                                            type="number" 
                                            value={autoKabir ?? 20}
                                            onChange={e => setAutoKabir(Number(e.target.value))}
                                            className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-center bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                    <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/70">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Minus Khoto Shoghir</label>
                                        <input 
                                            type="number" 
                                            value={autoShoghir ?? 10}
                                            onChange={e => setAutoShoghir(Number(e.target.value))}
                                            className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-center bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                </div>

                                {/* Rentang Nilai Predikat Fleksibel & Responsif */}
                                <div className="pt-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                                        Rentang Predikat Nilai
                                    </label>
                                    <div className="space-y-2">
                                        {(Array.isArray(nilaiRanges) ? nilaiRanges : []).map((range, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/80">
                                                <div className="flex-1 min-w-0">
                                                    <input 
                                                        type="text" 
                                                        value={range?.label || ''}
                                                        onChange={e => {
                                                            const newRanges = [...(Array.isArray(nilaiRanges) ? nilaiRanges : [])];
                                                            newRanges[idx] = { ...newRanges[idx], label: e.target.value };
                                                            setNilaiRanges(newRanges);
                                                        }}
                                                        placeholder="Nama Predikat"
                                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-start gap-2 shrink-0">
                                                    <span className="text-xs font-semibold text-slate-500">Min:</span>
                                                    <input 
                                                        type="number" 
                                                        value={range?.min ?? 0}
                                                        onChange={e => {
                                                            const newRanges = [...(Array.isArray(nilaiRanges) ? nilaiRanges : [])];
                                                            newRanges[idx] = { ...newRanges[idx], min: Number(e.target.value) };
                                                            setNilaiRanges(newRanges);
                                                        }}
                                                        className="w-20 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-center text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newRanges = (Array.isArray(nilaiRanges) ? nilaiRanges : []).filter((_, i) => i !== idx);
                                                            setNilaiRanges(newRanges);
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                        title="Hapus Predikat"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setNilaiRanges([...(Array.isArray(nilaiRanges) ? nilaiRanges : []), { label: 'Predikat Baru', min: 50 }])}
                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3.5 py-1.5 rounded-xl transition-colors cursor-pointer border border-blue-200 mt-1"
                                        >
                                            <Plus size={13} /> Tambah Predikat
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ROW 2: Opsi Skema Setoran & Notifikasi Telegram Bersebelahan secara Fleksibel di Bawah */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start pt-1">
                    {/* 3. Opsi Skema Setoran (Disandingkan di bawah dengan Telegram) */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-3 self-start w-full">
                        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Opsi Skema Setoran
                        </label>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Pisahkan dengan koma (,). Contoh: Ziyadah, Murojaah, Sabqi, Manzil
                        </p>
                        <input 
                            type="text" 
                            value={skemaOptions || ''} 
                            onChange={e => setSkemaOptions(e.target.value)} 
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold bg-slate-50/50 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                        />
                    </div>

                    {/* 4. Notifikasi Telegram Wali Santri */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-3.5 self-start w-full">
                        <div className="flex items-center justify-between gap-3">
                            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                Notifikasi Telegram Wali Santri
                            </label>
                            {/* Toggle switch button modern, aman & anti-blank */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={telegramEnable}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTelegramEnable(prev => !prev);
                                }}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    telegramEnable ? 'bg-blue-600' : 'bg-slate-300'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        telegramEnable ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>

                        {telegramEnable && (
                            <div className="space-y-2 pt-3 border-t border-slate-100">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">Template Pesan</label>
                                <textarea 
                                    value={telegramTemplate || ''}
                                    onChange={e => setTelegramTemplate(e.target.value)}
                                    rows={5}
                                    className="w-full border border-slate-200 rounded-xl p-3 text-xs font-mono bg-slate-50/50 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
                                />
                                <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                                    Variabel: {'{nama_santri}'}, {'{halaqah}'}, {'{tanggal}'}, {'{waktu}'}, {'{surat}'}, {'{ayat}'}, {'{skema}'}, {'{nilai}'}, {'{khoto_kabir}'}, {'{khoto_shoghir}'}, {'{jumlah_halaman}'}, {'{keterangan}'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 5: SINKRONISASI OTOMATIS SETORAN HARIAN KE EVALUASI PERIODIK */}
            {/* ========================================================================= */}
            <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-3">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                                Sinkronisasi Otomatis Setoran Harian
                            </h2>
                            {autoSyncConfig.enabled ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Aktif
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                    Non-Aktif
                                </span>
                            )}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-medium">
                            Otomatisasi kalkulasi agregat hafalan, ziyadah, murojaah, dan kelancaran dari log setoran harian santri langsung ke form evaluasi periodik.
                        </p>
                    </div>
                    {/* Toggle Switch di Header Atas */}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={autoSyncConfig.enabled}
                        onClick={() => {
                            setAutoSyncConfig(prev => ({ ...prev, enabled: !prev.enabled }));
                            setHasAutoSyncChanges(true);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none self-start sm:self-auto ${
                            autoSyncConfig.enabled ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                autoSyncConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                    </button>
                </div>

                {autoSyncConfig.enabled ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start">
                        {/* 1. Sub-pengaturan Ziyadah */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 self-start w-full">
                            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    1. Jumlah Ziyadah
                                </h3>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={autoSyncConfig.ziyadah.enabled}
                                    onClick={() => {
                                        setAutoSyncConfig(prev => ({
                                            ...prev,
                                            ziyadah: { ...prev.ziyadah, enabled: !prev.ziyadah.enabled }
                                        }));
                                        setHasAutoSyncChanges(true);
                                    }}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        autoSyncConfig.ziyadah.enabled ? 'bg-blue-600' : 'bg-slate-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                            autoSyncConfig.ziyadah.enabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {autoSyncConfig.ziyadah.enabled && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                                    <MultiSelectDropdown
                                        label="Tautan Skema"
                                        options={dynamicSchemeOptions}
                                        selected={autoSyncConfig.ziyadah.selected_schemes || []}
                                        onChange={selected => {
                                            setAutoSyncConfig(prev => ({
                                                ...prev,
                                                ziyadah: { ...prev.ziyadah, selected_schemes: selected }
                                            }));
                                            setHasAutoSyncChanges(true);
                                        }}
                                        placeholder="Pilih skema..."
                                    />

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                            Nilai Minimal
                                        </label>
                                        <select
                                            value={autoSyncConfig.ziyadah.min_nilai || 'Jayyid'}
                                            onChange={e => {
                                                setAutoSyncConfig(prev => ({
                                                    ...prev,
                                                    ziyadah: { ...prev.ziyadah, min_nilai: e.target.value }
                                                }));
                                                setHasAutoSyncChanges(true);
                                            }}
                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/60 outline-none focus:bg-white focus:border-slate-400 transition-all cursor-pointer"
                                        >
                                            {dynamicNilaiOptions.map(nilai => (
                                                <option key={nilai} value={nilai}>{nilai}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Sub-pengaturan Murojaah */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 self-start w-full">
                            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    2. Jumlah Murojaah
                                </h3>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={autoSyncConfig.murojaah.enabled}
                                    onClick={() => {
                                        setAutoSyncConfig(prev => ({
                                            ...prev,
                                            murojaah: { ...prev.murojaah, enabled: !prev.murojaah.enabled }
                                        }));
                                        setHasAutoSyncChanges(true);
                                    }}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        autoSyncConfig.murojaah.enabled ? 'bg-blue-600' : 'bg-slate-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                            autoSyncConfig.murojaah.enabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {autoSyncConfig.murojaah.enabled && (
                                <div className="pt-1">
                                    <MultiSelectDropdown
                                        label="Tautan Skema"
                                        options={dynamicSchemeOptions}
                                        selected={autoSyncConfig.murojaah.selected_schemes || []}
                                        onChange={selected => {
                                            setAutoSyncConfig(prev => ({
                                                ...prev,
                                                murojaah: { ...prev.murojaah, selected_schemes: selected }
                                            }));
                                            setHasAutoSyncChanges(true);
                                        }}
                                        placeholder="Pilih skema..."
                                    />
                                </div>
                            )}
                        </div>

                        {/* 3. Sub-pengaturan Capaian Hafalan (Depan & Belakang) */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 self-start w-full">
                            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    3. Data Capaian Hafalan (Depan & Belakang)
                                </h3>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={autoSyncConfig.hafalan.enabled}
                                    onClick={() => {
                                        setAutoSyncConfig(prev => ({
                                            ...prev,
                                            hafalan: { ...prev.hafalan, enabled: !prev.hafalan.enabled }
                                        }));
                                        setHasAutoSyncChanges(true);
                                    }}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        autoSyncConfig.hafalan.enabled ? 'bg-blue-600' : 'bg-slate-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                            autoSyncConfig.hafalan.enabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {autoSyncConfig.hafalan.enabled && (
                                <div className="pt-1 space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Metode Identifikasi
                                    </label>
                                    <select
                                        value={autoSyncConfig.hafalan.method || 'history_and_juz'}
                                        onChange={e => {
                                            setAutoSyncConfig(prev => ({
                                                ...prev,
                                                hafalan: { ...prev.hafalan, method: e.target.value as any }
                                            }));
                                            setHasAutoSyncChanges(true);
                                        }}
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/60 outline-none focus:bg-white focus:border-slate-400 transition-all cursor-pointer"
                                    >
                                        <option value="history_and_juz">Otomatis: Deteksi Riwayat Santri & Posisi Juz</option>
                                        <option value="standard_boundary">Otomatis: Batas Standar (Depan ≤ Juz 27, Belakang ≥ Juz 28)</option>
                                        <option value="only_front">Hanya Hafalan Depan</option>
                                        <option value="only_back">Hanya Hafalan Belakang</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* 4. Sub-pengaturan Kelancaran Hafalan */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 self-start w-full">
                            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    4. Kelancaran Hafalan
                                </h3>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={autoSyncConfig.kelancaran.enabled}
                                    onClick={() => {
                                        setAutoSyncConfig(prev => ({
                                            ...prev,
                                            kelancaran: { ...prev.kelancaran, enabled: !prev.kelancaran.enabled }
                                        }));
                                        setHasAutoSyncChanges(true);
                                    }}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        autoSyncConfig.kelancaran.enabled ? 'bg-blue-600' : 'bg-slate-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                            autoSyncConfig.kelancaran.enabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {autoSyncConfig.kelancaran.enabled && (
                                <div className="space-y-4 pt-1">
                                    {/* Tautan Kategori */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                            Tautan Kategori
                                        </label>
                                        <select
                                            value={targetKelancaranCategory}
                                            onChange={e => handleTargetCategoryChange(e.target.value)}
                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/60 outline-none focus:bg-white focus:border-slate-400 transition-all cursor-pointer"
                                        >
                                            {allCategories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Ambang Batas Skor */}
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-bold text-slate-700">
                                                Ambang Batas Skor
                                            </label>
                                            <button
                                                type="button"
                                                onClick={handleAddKelancaranRule}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                                            >
                                                <Plus size={13} /> Tambah Batas
                                            </button>
                                        </div>

                                        {activeKelancaranRules.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic py-1">
                                                Belum ada ambang batas skor. Klik "Tambah Batas" untuk menentukan pemetaan skor ke opsi evaluasi.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {activeKelancaranRules.map((rule, idx) => (
                                                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-xl border border-slate-200/80 bg-slate-50/70">
                                                        <div className="flex-1 min-w-0 w-full sm:w-auto">
                                                            <select
                                                                value={rule.option_label}
                                                                onChange={e => handleUpdateKelancaranRule(idx, 'option_label', e.target.value)}
                                                                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none cursor-pointer focus:border-slate-400"
                                                            >
                                                                {categoryAvailableSettings.map(s => (
                                                                    <option key={s.id || s.label} value={s.label}>
                                                                        {s.label}
                                                                    </option>
                                                                ))}
                                                                {categoryAvailableSettings.length === 0 && (
                                                                    <option value={rule.option_label}>{rule.option_label}</option>
                                                                )}
                                                            </select>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Skor ≥</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.1"
                                                                    min="0"
                                                                    max="5"
                                                                    value={rule.min_score}
                                                                    onChange={e => handleUpdateKelancaranRule(idx, 'min_score', e.target.value)}
                                                                    className="w-16 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-center text-slate-800 bg-white outline-none focus:border-slate-400"
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveKelancaranRule(idx)}
                                                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                                                                title="Hapus batas"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Fallback Option Row */}
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 sm:p-3 rounded-xl border border-slate-200/80 bg-slate-50/70">
                                                    <span className="text-xs font-medium text-slate-500 shrink-0">
                                                        Fallback:
                                                    </span>
                                                    <select
                                                        value={activeFallbackOption}
                                                        onChange={e => handleFallbackOptionChange(e.target.value)}
                                                        className="w-full sm:flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none cursor-pointer focus:border-slate-400"
                                                    >
                                                        <option value="">(Otomatis Opsi Terendah)</option>
                                                        {categoryAvailableSettings.map(s => (
                                                            <option key={s.id || s.label} value={s.label}>
                                                                {s.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="p-6 text-center rounded-2xl bg-white border border-slate-200/80 text-slate-400 text-xs">
                        <p className="font-medium text-slate-500">Auto-sinkronisasi saat ini nonaktif. Aktifkan toggle di atas untuk mengatur parameter sinkronisasi.</p>
                    </div>
                )}

                {/* Tombol Simpan Pengaturan Sinkronisasi di Paling Bawah */}
                <div className="flex justify-end pt-2 pb-6">
                    <button
                        type="button"
                        onClick={handleSaveAutoSyncConfig}
                        disabled={isSavingAutoSync}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                        <Save size={15} />
                        <span>{isSavingAutoSync ? 'Menyimpan...' : 'Simpan Pengaturan Sinkronisasi'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PengaturanEvaluasiPage;
