import React, { useState, useEffect, useMemo } from 'react';
import { 
    Plus, Trash2, Edit2, Save, X, CheckSquare, GripVertical, 
    ChevronRight, LayoutList, ChevronUp, ChevronDown,
    RefreshCw, Sliders, CheckCircle2, Info, BookOpen, Layers, Check, Sparkles
} from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import PeriodeEvaluasiPanel from '../components/evaluasi/PeriodeEvaluasiPanel';
import ModePencatatanPanel from '../components/evaluasi/ModePencatatanPanel';
import IsianFormPanel from '../components/evaluasi/IsianFormPanel';
import SetoranSettingsModal from '../components/SetoranSettingsModal';
import { supabase } from '../lib/supabaseClient';
import { NotificationStore } from '../lib/NotificationStore';
import { StatusBadge } from '../components/ui/SaaSPrimitives';
import { MurojaahRule, TargetMurojaahConfig } from '../types';
import { format } from 'date-fns';

const isUUID = (str: any): boolean => {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
};

type TargetGrid = Record<string, Record<string, { hafalan: number, murojaah: number, ziyadah: number, marhalah_id?: string, kelas_id?: string }>>;

export const PengaturanEvaluasiPage: React.FC = () => {
    const {
        appSettings, saveAppSetting, saveMultipleAppSettings,
        globalMarhalahs, masterKelas, classTargets, saveClassTargetBatch, masterMarhalahs, masterKelasRelasi,
        selectedAcademicYear, userProfile, getOrgId
    } = useSupabaseData();
    const [isSetoranSettingsOpen, setIsSetoranSettingsOpen] = useState(false);

    // =========================================================================
    // SECTION 2: KELOLA TARGET SETORAN & TARGET PLANS BERVERSI (V2)
    // =========================================================================
    const [targetActiveTab, setTargetActiveTab] = useState<'hafalan' | 'murojaah' | 'versions'>('hafalan');
    const [isSavingTargets, setIsSavingTargets] = useState(false);
    const [targetPlansHistory, setTargetPlansHistory] = useState<any[]>([]);
    const [targetVersionNote, setTargetVersionNote] = useState<string>('');

    // Active semester adjusted automatically from system active semester
    const activeSemester: 'Ganjil' | 'Genap' = (selectedAcademicYear?.active_semester === 'Genap') ? 'Genap' : 'Ganjil';

    const fetchTargetPlansHistory = async () => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { data } = await (supabase as any)
                .from('target_plans')
                .select('*')
                .eq('organization_id', orgId)
                .order('version_no', { ascending: false })
                .limit(20);
            if (data) setTargetPlansHistory(data);
        } catch {
            // Abaikan bila tabel target_plans belum dimigrasikan
        }
    };

    useEffect(() => {
        fetchTargetPlansHistory();
    }, [selectedAcademicYear?.id, activeSemester]);

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

            // Simpan snapshot versi baru ke target_plans V2 + audit_logs
            try {
                const orgId = await getOrgId();
                if (orgId) {
                    const semPlans = targetPlansHistory.filter((p: any) => p.semester_name === activeSemester);
                    const nextVersion = semPlans.length > 0 ? Math.max(...semPlans.map((p: any) => Number(p.version_no) || 1)) + 1 : 1;

                    await (supabase as any)
                        .from('target_plans')
                        .update({ status: 'archived' })
                        .eq('organization_id', orgId)
                        .eq('semester_name', activeSemester)
                        .eq('status', 'published');

                    await (supabase as any).from('target_plans').insert({
                        organization_id: orgId,
                        academic_year_id: selectedAcademicYear?.id || null,
                        semester_name: activeSemester,
                        version_no: nextVersion,
                        status: 'published',
                        targets_json: currentGrid,
                        murojaah_rules_json: murojaahRules,
                        notes: targetVersionNote.trim() || `Pembaruan Target Hafalan & Murojaah Semester ${activeSemester} v${nextVersion}`,
                        created_by: userProfile?.id || null
                    });

                    await (supabase as any).from('audit_logs').insert({
                        organization_id: orgId,
                        actor_id: userProfile?.id || null,
                        actor_role: userProfile?.role || 'admin',
                        action: 'PUBLISH_TARGET_PLAN_VERSION',
                        resource_type: 'target_plans',
                        resource_id: `${activeSemester}-v${nextVersion}`,
                        reason: targetVersionNote.trim() || `Publikasi Target Setoran Semester ${activeSemester} v${nextVersion}`,
                        after_state: { version_no: nextVersion, semester_name: activeSemester, class_count: batchToSave.length }
                    });

                    setTargetVersionNote('');
                    await fetchTargetPlansHistory();
                }
            } catch {
                // Abaikan bila tabel target_plans belum dimigrasikan
            }

            NotificationStore.addNotification(`Target Setoran Semester ${activeSemester} berhasil disimpan & diterbitkan sebagai versi baru.`, 'success');
        } catch (error) {
            console.error('Error saving targets:', error);
            NotificationStore.addNotification('Gagal menyimpan target setoran.', 'error');
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

    return (
        <div className="space-y-10 font-sans min-h-screen max-w-[1400px] mx-auto pb-16 pt-2 px-2 sm:px-4 lg:px-6">
            <div className="border-b border-slate-200 pb-5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-1">
                    Pengaturan Evaluasi
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    Periode evaluasi, mode pencatatan halaqah, target setoran, isian form evaluasi periode, dan notifikasi setoran.
                </p>
            </div>

            {/* Fase 4: periode dari tabel evaluation_periods */}
            <PeriodeEvaluasiPanel />

            {/* Fase 4: mode pencatatan per halaqah */}
            <ModePencatatanPanel />

            {/* ========================================================================= */}
            {/* SECTION 2: KELOLA TARGET SETORAN */}
            {/* ========================================================================= */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-3">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Kelola Target Setoran Berversi</h2>
                            {targetPlansHistory.find(p => p.semester_name === activeSemester && p.status === 'published') && (
                                <StatusBadge
                                    label={`AKTIF v${targetPlansHistory.find(p => p.semester_name === activeSemester && p.status === 'published')?.version_no || 1}`}
                                    tone="success"
                                />
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-medium">
                            Setiap penyimpanan menerbitkan snapshot versi target baru (<span className="font-mono">target_plans</span>) untuk menjaga akurasi histori evaluasi.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <input
                            type="text"
                            value={targetVersionNote}
                            onChange={(e) => setTargetVersionNote(e.target.value)}
                            placeholder="Catatan versi target (opsional)..."
                            className="text-xs border border-slate-200 rounded-xl px-3.5 py-2 bg-white text-slate-700 w-56 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        <button
                            type="button"
                            onClick={handleSaveTargets}
                            disabled={isSavingTargets}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Save size={15} />
                            <span>{isSavingTargets ? 'Menyimpan...' : 'Terbitkan Versi Target'}</span>
                        </button>
                    </div>
                </div>

                {/* Sub-tabs: Target Hafalan vs Target Murojaah vs Riwayat Versi */}
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
                        Target Hafalan ({activeSemester})
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
                    <button
                        type="button"
                        onClick={() => setTargetActiveTab('versions')}
                        className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                            targetActiveTab === 'versions'
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <span>Riwayat Versi Target</span>
                        <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-600 font-bold">
                            {targetPlansHistory.length}
                        </span>
                    </button>
                </div>

                {targetActiveTab === 'versions' && (
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Riwayat Versi Target (target_plans)</span>
                            <span className="text-[11px] text-slate-500">Semester Aktif: {activeSemester}</span>
                        </div>
                        {targetPlansHistory.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">
                                Belum ada riwayat versi target tersimpan di tabel <span className="font-mono">target_plans</span>. Klik "Terbitkan Versi Target" untuk membuat snapshot v1.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {targetPlansHistory.map((plan: any) => (
                                    <div key={plan.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-900">
                                                    Target Semester {plan.semester_name} — Versi v{plan.version_no}
                                                </span>
                                                <StatusBadge
                                                    label={plan.status === 'published' ? 'PUBLISHED' : 'ARCHIVED'}
                                                    tone={plan.status === 'published' ? 'success' : 'neutral'}
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">{plan.notes || '-'}</p>
                                        </div>
                                        <div className="text-[11px] font-mono text-slate-400">
                                            {plan.created_at ? format(new Date(plan.created_at), 'dd MMM yyyy HH:mm') : '-'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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


            {/* Fase 4: isian form evaluasi periode (isian sistem, isian bebas, evaluasi kegiatan) */}
            <IsianFormPanel />

            {/* Setoran harian: jenis & waktu di Referensi Data Dasar, predikat di Tabel Kelancaran (Fase 2–3) */}
            <section className="space-y-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Setoran Harian</h2>
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 space-y-2">
                    <p>
                        Jenis setoran, waktu halaqah, dan <b>Tabel Kelancaran</b> (predikat otomatis) diatur di
                        <b> Pengaturan &gt; Referensi Data Dasar</b>. Di Mode Harian, rekap periode dijumlah otomatis dari setoran —
                        tidak perlu lagi "Tarik Data" atau sinkronisasi.
                    </p>
                    <button type="button" onClick={() => setIsSetoranSettingsOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700">
                        Notifikasi Telegram setoran ke wali
                    </button>
                </div>
            </section>
            <SetoranSettingsModal isOpen={isSetoranSettingsOpen} onClose={() => setIsSetoranSettingsOpen(false)} />
        </div>
    );
};

export default PengaturanEvaluasiPage;