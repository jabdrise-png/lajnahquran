import React, { useState, useEffect, useMemo } from 'react';
import { Save, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { PageShell, PageHeader, StatCard, StatusBadge } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';

const PengaturanNilaiPage: React.FC = () => {
    const {
        appSettings,
        saveMultipleAppSettings,
        saveAppSetting,
        loading,
        globalPredikatNilai,
        selectedAcademicYear,
        getOrgId,
        userProfile,
    } = useSupabaseData();

    const [isSaving, setIsSaving] = useState(false);
    const [newPredikatLabel, setNewPredikatLabel] = useState('');
    const [newPredikatMinScore, setNewPredikatMinScore] = useState('');

    // Ujian Semester Settings
    const [nilaiAwalJuz, setNilaiAwalJuz] = useState('100');
    const [pengurangShogir, setPengurangShogir] = useState('1.25');
    const [pengurangKabir, setPengurangKabir] = useState('5');
    const [minNilaiJuz, setMinNilaiJuz] = useState('50');

    // Raport Formula
    const [pctBulanan, setPctBulanan] = useState('40');
    const [pctSemester, setPctSemester] = useState('50');
    const [pctSilabus, setPctSilabus] = useState('10');
    const [pctKehadiran, setPctKehadiran] = useState('0');
    const [autoSilabus, setAutoSilabus] = useState('false');

    // Versi Rubrik (rubric_versions V2)
    const [rubricVersions, setRubricVersions] = useState<any[]>([]);
    const [rubricNote, setRubricNote] = useState('');

    // Simulator Rubrik Real-Time (Blueprint Fase 4)
    const [simShogir, setSimShogir] = useState(2);
    const [simKabir, setSimKabir] = useState(1);
    const [simAvgBulanan, setSimAvgBulanan] = useState(88);
    const [simSilabus, setSimSilabus] = useState(90);
    const [simKehadiran, setSimKehadiran] = useState(95);

    const fetchRubricVersions = async () => {
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { data } = await (supabase as any)
                .from('rubric_versions')
                .select('*')
                .eq('organization_id', orgId)
                .order('version_no', { ascending: false })
                .limit(10);
            if (data) setRubricVersions(data);
        } catch {
            setRubricVersions([]);
        }
    };

    useEffect(() => {
        fetchRubricVersions();
    }, [selectedAcademicYear?.id]);

    useEffect(() => {
        if (!loading) {
            setNilaiAwalJuz(appSettings.find((s) => s.key === 'NILAI_AWAL_JUZ')?.value || '100');
            setPengurangShogir(appSettings.find((s) => s.key === 'PENGURANG_KHOTO_SHOGIR')?.value || '1.25');
            setPengurangKabir(appSettings.find((s) => s.key === 'PENGURANG_KHOTO_KABIR')?.value || '5');
            setMinNilaiJuz(appSettings.find((s) => s.key === 'MIN_NILAI_JUZ')?.value || '50');

            setPctBulanan(appSettings.find((s) => s.key === 'PCT_UJIAN_BULANAN')?.value || '40');
            setPctSemester(appSettings.find((s) => s.key === 'PCT_UJIAN_SEMESTER')?.value || '50');
            setPctSilabus(appSettings.find((s) => s.key === 'PCT_SILABUS')?.value || '10');
            setPctKehadiran(appSettings.find((s) => s.key === 'PCT_KEHADIRAN')?.value || '0');
            setAutoSilabus(appSettings.find((s) => s.key === 'AUTO_SILABUS_SCORE')?.value || 'false');
        }
    }, [appSettings, loading]);

    const handleSavePredikat = async () => {
        if (!newPredikatLabel || !newPredikatMinScore) return;
        setIsSaving(true);
        try {
            const newList = [...(globalPredikatNilai || [])];
            newList.push({ label: newPredikatLabel, minScore: Number(newPredikatMinScore) });
            newList.sort((a, b) => b.minScore - a.minScore);
            await saveAppSetting('GLOBAL_PREDIKAT_NILAI', JSON.stringify(newList));
            setNewPredikatLabel('');
            setNewPredikatMinScore('');
            NotificationStore.addNotification('Skala predikat nilai berhasil ditambahkan.', 'success');
        } catch (e: any) {
            NotificationStore.addNotification(e.message || 'Gagal menambah predikat.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePredikat = async (label: string) => {
        setIsSaving(true);
        try {
            const newList = (globalPredikatNilai || []).filter((p) => p.label !== label);
            await saveAppSetting('GLOBAL_PREDIKAT_NILAI', JSON.stringify(newList));
            NotificationStore.addNotification(`Predikat ${label} dihapus.`, 'info');
        } catch (e: any) {
            NotificationStore.addNotification(e.message || 'Gagal menghapus predikat.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        const totalPct =
            Number(pctBulanan) + Number(pctSemester) + Number(pctSilabus) + Number(pctKehadiran);
        if (totalPct !== 100) {
            NotificationStore.addNotification(
                `Total persentase bobot raport wajib 100% (saat ini: ${totalPct}%).`,
                'error'
            );
            return;
        }

        setIsSaving(true);
        try {
            await saveMultipleAppSettings([
                { key: 'NILAI_AWAL_JUZ', value: String(nilaiAwalJuz) },
                { key: 'PENGURANG_KHOTO_SHOGIR', value: String(pengurangShogir) },
                { key: 'PENGURANG_KHOTO_KABIR', value: String(pengurangKabir) },
                { key: 'MIN_NILAI_JUZ', value: String(minNilaiJuz) },
                { key: 'PCT_UJIAN_BULANAN', value: String(pctBulanan) },
                { key: 'PCT_UJIAN_SEMESTER', value: String(pctSemester) },
                { key: 'PCT_SILABUS', value: String(pctSilabus) },
                { key: 'PCT_KEHADIRAN', value: String(pctKehadiran) },
                { key: 'AUTO_SILABUS_SCORE', value: autoSilabus },
            ]);

            // Simpan snapshot versi rubrik baru ke tabel V2 rubric_versions + audit_logs
            try {
                const orgId = await getOrgId();
                const nextVersionNo =
                    rubricVersions.length > 0
                        ? Math.max(...rubricVersions.map((r) => Number(r.version_no) || 1)) + 1
                        : 1;

                const versionName = rubricNote.trim()
                    ? `Rubrik v${nextVersionNo} — ${rubricNote.trim()}`
                    : `Rubrik Penilaian v${nextVersionNo} (${selectedAcademicYear?.name || 'Global'})`;

                await (supabase as any)
                    .from('rubric_versions')
                    .update({ is_active: false })
                    .eq('organization_id', orgId);

                await (supabase as any).from('rubric_versions').insert({
                    organization_id: orgId,
                    academic_year_id: selectedAcademicYear?.id || null,
                    semester_name: selectedAcademicYear?.active_semester || 'Ganjil',
                    version_no: nextVersionNo,
                    name: versionName,
                    initial_score: Number(nilaiAwalJuz) || 100,
                    deduction_minor: Number(pengurangShogir) || 1.25,
                    deduction_major: Number(pengurangKabir) || 5,
                    min_score: Number(minNilaiJuz) || 50,
                    passing_score: 70,
                    predicates: globalPredikatNilai || [],
                    is_active: true,
                    created_by: userProfile?.id || null,
                });

                await (supabase as any).from('audit_logs').insert({
                    organization_id: orgId,
                    actor_id: userProfile?.id || null,
                    actor_role: userProfile?.role || 'admin',
                    action: 'PUBLISH_RUBRIC_VERSION',
                    resource_type: 'rubric_versions',
                    resource_id: `v${nextVersionNo}`,
                    reason: rubricNote.trim() || `Publikasi Rubrik Penilaian v${nextVersionNo}`,
                    after_state: {
                        version_no: nextVersionNo,
                        name: versionName,
                        initial_score: Number(nilaiAwalJuz),
                        deduction_minor: Number(pengurangShogir),
                        deduction_major: Number(pengurangKabir),
                        weights: {
                            pctBulanan: Number(pctBulanan),
                            pctSemester: Number(pctSemester),
                            pctSilabus: Number(pctSilabus),
                            pctKehadiran: Number(pctKehadiran),
                        },
                    },
                });

                await fetchRubricVersions();
                setRubricNote('');
            } catch {
                // Abaikan bila tabel rubric_versions belum dimigrasikan
            }

            NotificationStore.addNotification(
                'Versi rubrik & formula penilaian berhasil disimpan dan diterbitkan.',
                'success'
            );
        } catch (e: any) {
            NotificationStore.addNotification('Gagal menyimpan: ' + e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const totalPersentase =
        Number(pctBulanan) + Number(pctSemester) + Number(pctSilabus) + Number(pctKehadiran);

    // Kalkulasi Simulator Rubrik Real-Time
    const simulationResult = useMemo(() => {
        const base = Number(nilaiAwalJuz) || 100;
        const pShogir = Number(pengurangShogir) || 1.25;
        const pKabir = Number(pengurangKabir) || 5;
        const minDrop = Number(minNilaiJuz) || 50;

        const simJuzScore = Math.max(
            minDrop,
            Number((base - simShogir * pShogir - simKabir * pKabir).toFixed(2))
        );

        const finalRaportScore = Number(
            (
                simAvgBulanan * (Number(pctBulanan) / 100) +
                simJuzScore * (Number(pctSemester) / 100) +
                simSilabus * (Number(pctSilabus) / 100) +
                simKehadiran * (Number(pctKehadiran) / 100)
            ).toFixed(2)
        );

        const sortedPredicates = [...(globalPredikatNilai || [])].sort(
            (a, b) => b.minScore - a.minScore
        );
        const matchedPredikat =
            sortedPredicates.find((p) => finalRaportScore >= p.minScore)?.label || 'Rasib';

        return {
            simJuzScore,
            finalRaportScore,
            matchedPredikat,
        };
    }, [
        nilaiAwalJuz,
        pengurangShogir,
        pengurangKabir,
        minNilaiJuz,
        pctBulanan,
        pctSemester,
        pctSilabus,
        pctKehadiran,
        simShogir,
        simKabir,
        simAvgBulanan,
        simSilabus,
        simKehadiran,
        globalPredikatNilai,
    ]);

    if (loading) return <div className="p-6 text-sm text-slate-500">Memuat rubrik penilaian...</div>;

    return (
        <PageShell>
            <PageHeader
                kicker="STANDARISASI MUTU AKADEMIK (FASE 4)"
                title="Rubrik Penilaian Berversi & Simulator Formula Raport"
                description="Konfigurasi pengurang kesalahan ujian per juz, bobot komponen raport akhir, skala predikat, serta simulasi perhitungan sebelum diterbitkan sebagai versi rubrik resmi."
                actions={
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || totalPersentase !== 100}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                        <Save size={15} />
                        {isSaving ? 'Menyimpan Versi Rubrik...' : 'Terbitkan Versi Rubrik'}
                    </button>
                }
            />

            {/* Ringkasan Versi & Simulasi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Versi Rubrik Aktif"
                    value={`v${rubricVersions[0]?.version_no || 1}`}
                    meta={rubricVersions[0]?.name || 'Konfigurasi Standar Lembaga'}
                    tone="primary"
                />
                <StatCard
                    label="Total Bobot Komponen"
                    value={`${totalPersentase}%`}
                    meta={totalPersentase === 100 ? 'Valid (Tepat 100%)' : 'Wajib berjumlah 100%'}
                    tone={totalPersentase === 100 ? 'success' : 'danger'}
                />
                <StatCard
                    label="Hasil Simulasi Skor Juz"
                    value={simulationResult.simJuzScore}
                    meta={`${simShogir} Shogir · ${simKabir} Kabir`}
                    tone="neutral"
                />
                <StatCard
                    label="Simulasi Nilai Akhir Raport"
                    value={`${simulationResult.finalRaportScore} (${simulationResult.matchedPredikat})`}
                    meta="Berdasarkan parameter di bawah"
                    tone="success"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Kolom Kiri: Komponen Ujian & Bobot Raport */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                        <div className="border-b border-slate-200 pb-3">
                            <h2 className="text-base font-bold text-slate-900">
                                1. Parameter Penilaian Ujian Semester (Per Juz)
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Digunakan untuk menghitung skor per juz dari jumlah kesalahan kecil (shogir) dan besar (kabir).
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nilai Awal / Maksimal Per Juz
                                </label>
                                <input
                                    type="number"
                                    value={nilaiAwalJuz}
                                    onChange={(e) => setNilaiAwalJuz(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Batas Nilai Minimal (Floor Score)
                                </label>
                                <input
                                    type="number"
                                    value={minNilaiJuz}
                                    onChange={(e) => setMinNilaiJuz(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-red-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Pengurangan Khoto Shogir (Salah Kecil)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={pengurangShogir}
                                    onChange={(e) => setPengurangShogir(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Pengurangan Khoto Kabir (Salah Besar)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={pengurangKabir}
                                    onChange={(e) => setPengurangKabir(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                        <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-slate-900">
                                    2. Bobot Formula Nilai Akhir Raport (%)
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Total persentase keempat komponen wajib berjumlah tepat 100%.
                                </p>
                            </div>
                            <StatusBadge
                                label={`TOTAL: ${totalPersentase}%`}
                                tone={totalPersentase === 100 ? 'success' : 'danger'}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Bobot Rata-rata Ujian Bulanan (%)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={pctBulanan}
                                    onChange={(e) => setPctBulanan(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Bobot Ujian Semester (%)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={pctSemester}
                                    onChange={(e) => setPctSemester(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Bobot Ketercapaian Target Silabus (%)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={pctSilabus}
                                    onChange={(e) => setPctSilabus(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Bobot Persentase Kehadiran Sesi (%)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={pctKehadiran}
                                    onChange={(e) => setPctKehadiran(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
                                />
                            </div>
                        </div>

                        <label className="flex items-start gap-3 cursor-pointer p-3.5 border border-slate-200 rounded-lg bg-slate-50/70">
                            <input
                                type="checkbox"
                                checked={autoSilabus === 'true'}
                                onChange={(e) => setAutoSilabus(e.target.checked ? 'true' : 'false')}
                                className="mt-0.5 w-4 h-4 text-blue-600 border-slate-300 rounded"
                            />
                            <div>
                                <div className="text-xs font-bold text-slate-800">
                                    Hitung Otomatis Nilai Silabus dari Capaian vs Target Kelas
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                    Bila diaktifkan, nilai silabus dihitung otomatis dari rasio Total Hafalan santri terhadap Target Hafalan kelas (maksimal 100).
                                </div>
                            </div>
                        </label>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Catatan Perubahan Versi Rubrik (Opsional)
                            </label>
                            <input
                                type="text"
                                value={rubricNote}
                                onChange={(e) => setRubricNote(e.target.value)}
                                placeholder="Contoh: Penyesuaian bobot kehadiran semester genap..."
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                            />
                        </div>
                    </div>
                </div>

                {/* Kolom Kanan: Simulator Rubrik & Skala Predikat */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                        <div className="border-b border-slate-200 pb-3">
                            <h2 className="text-base font-bold text-slate-900">
                                Simulator Perhitungan Rubrik
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Uji dampak perubahan rumus terhadap nilai akhir dan predikat santri.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Simulasi Salah Shogir
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={simShogir}
                                    onChange={(e) => setSimShogir(Math.max(0, Number(e.target.value)))}
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Simulasi Salah Kabir
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={simKabir}
                                    onChange={(e) => setSimKabir(Math.max(0, Number(e.target.value)))}
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Rata-rata Ujian Bulanan
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={simAvgBulanan}
                                    onChange={(e) => setSimAvgBulanan(Number(e.target.value))}
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Skor Silabus / Target
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={simSilabus}
                                    onChange={(e) => setSimSilabus(Number(e.target.value))}
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
                                />
                            </div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-600">Skor Ujian Semester (Simulasi):</span>
                                <span className="font-mono font-bold text-slate-900 tabular-nums">
                                    {simulationResult.simJuzScore}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-600">Nilai Akhir Raport:</span>
                                <span className="font-mono font-bold text-blue-700 tabular-nums">
                                    {simulationResult.finalRaportScore}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                                <span className="text-slate-600">Predikat Kelulusan:</span>
                                <StatusBadge label={simulationResult.matchedPredikat} tone="success" />
                            </div>
                        </div>
                    </div>

                    {/* Skala Predikat Nilai */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                        <div className="border-b border-slate-200 pb-3">
                            <h2 className="text-base font-bold text-slate-900">
                                3. Skala Predikat Nilai
                            </h2>
                        </div>

                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newPredikatLabel}
                                onChange={(e) => setNewPredikatLabel(e.target.value)}
                                placeholder="Nama Predikat (mis. Mumtaz)"
                                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                            />
                            <input
                                type="number"
                                value={newPredikatMinScore}
                                onChange={(e) => setNewPredikatMinScore(e.target.value)}
                                placeholder="Min Skor"
                                className="w-24 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums"
                            />
                            <button
                                type="button"
                                onClick={handleSavePredikat}
                                disabled={!newPredikatLabel || !newPredikatMinScore || isSaving}
                                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                            >
                                <Plus size={15} />
                            </button>
                        </div>

                        <ul className="border border-slate-200 rounded-lg divide-y divide-slate-200 max-h-52 overflow-auto">
                            {(globalPredikatNilai || []).map((p) => (
                                <li
                                    key={p.label}
                                    className="px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50"
                                >
                                    <span className="font-semibold text-slate-800">{p.label}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-slate-600 tabular-nums">
                                            ≥ {p.minScore}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleDeletePredikat(p.label)}
                                            className="text-slate-400 hover:text-red-600"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Riwayat Versi Rubrik (rubric_versions) */}
            {rubricVersions.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-200">
                        <h3 className="text-sm font-bold text-slate-900">
                            Riwayat Versi Rubrik Penilaian (Immutable Version History)
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                                <tr>
                                    <th className="px-5 py-3">Versi</th>
                                    <th className="px-5 py-3">Nama / Catatan</th>
                                    <th className="px-5 py-3">Parameter Pengurang Juz</th>
                                    <th className="px-5 py-3">Status</th>
                                    <th className="px-5 py-3 text-right">Diterbitkan Pada</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {rubricVersions.map((rv) => {
                                    const w = rv.weights_json || {};
                                    const initScore = rv.initial_score ?? w.nilai_awal_juz ?? 100;
                                    const dedMajor = rv.deduction_major ?? w.pengurang_kabir ?? 5;
                                    const dedMinor = rv.deduction_minor ?? w.pengurang_shogir ?? 1.25;
                                    const isActive = rv.is_active ?? (rv.status === 'published');
                                    const pubDate = rv.published_at || rv.created_at;
                                    return (
                                        <tr key={rv.id} className="hover:bg-slate-50">
                                            <td className="px-5 py-3 font-mono font-bold text-slate-900 tabular-nums">
                                                v{rv.version_no}
                                            </td>
                                            <td className="px-5 py-3 font-medium text-slate-800">
                                                {rv.name}
                                            </td>
                                            <td className="px-5 py-3 font-mono text-slate-600 tabular-nums">
                                                Awal {initScore} | Kabir -{dedMajor} | Shogir -{dedMinor}
                                            </td>
                                            <td className="px-5 py-3">
                                                <StatusBadge
                                                    label={isActive ? 'ACTIVE' : 'ARCHIVED'}
                                                    tone={isActive ? 'success' : 'neutral'}
                                                />
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono text-slate-500 tabular-nums">
                                                {pubDate
                                                    ? new Date(pubDate).toLocaleString('id-ID')
                                                    : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </PageShell>
    );
};

export default PengaturanNilaiPage;
