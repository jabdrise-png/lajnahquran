import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, Plus, Trash2, Activity } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';

const PengaturanNilaiPage: React.FC = () => {
    const { appSettings, saveMultipleAppSettings, saveAppSetting, loading, globalPredikatNilai } = useSupabaseData();
    const [isSaving, setIsSaving] = useState(false);
    const [newPredikatLabel, setNewPredikatLabel] = useState('');
    const [newPredikatMinScore, setNewPredikatMinScore] = useState('');



    const handleSavePredikat = async () => {
        if (!newPredikatLabel || !newPredikatMinScore) return;
        setIsSaving(true);
        try {
            const newList = [...(globalPredikatNilai || [])];
            newList.push({ label: newPredikatLabel, minScore: Number(newPredikatMinScore) });
            // Sort by minScore descending
            newList.sort((a,b) => b.minScore - a.minScore);
            await saveAppSetting('GLOBAL_PREDIKAT_NILAI', JSON.stringify(newList));
            setNewPredikatLabel('');
            setNewPredikatMinScore('');
            alert('Predikat berhasil ditambahkan!');
        } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
    };

    const handleDeletePredikat = async (label: string) => {
        if (!confirm('Hapus predikat ini?')) return;
        setIsSaving(true);
        try {
            const newList = (globalPredikatNilai || []).filter(p => p.label !== label);
            await saveAppSetting('GLOBAL_PREDIKAT_NILAI', JSON.stringify(newList));
        } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
    };

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

    useEffect(() => {
        if (!loading) {
            setNilaiAwalJuz(appSettings.find(s => s.key === 'NILAI_AWAL_JUZ')?.value || '100');
            setPengurangShogir(appSettings.find(s => s.key === 'PENGURANG_KHOTO_SHOGIR')?.value || '1.25');
            setPengurangKabir(appSettings.find(s => s.key === 'PENGURANG_KHOTO_KABIR')?.value || '5');
            setMinNilaiJuz(appSettings.find(s => s.key === 'MIN_NILAI_JUZ')?.value || '50');

            setPctBulanan(appSettings.find(s => s.key === 'PCT_UJIAN_BULANAN')?.value || '40');
            setPctSemester(appSettings.find(s => s.key === 'PCT_UJIAN_SEMESTER')?.value || '50');
            setPctSilabus(appSettings.find(s => s.key === 'PCT_SILABUS')?.value || '10');
            setPctKehadiran(appSettings.find(s => s.key === 'PCT_KEHADIRAN')?.value || '0');
            setAutoSilabus(appSettings.find(s => s.key === 'AUTO_SILABUS_SCORE')?.value || 'false');
        }
    }, [appSettings, loading]);

    const handleSave = async () => {
        const totalPct = Number(pctBulanan) + Number(pctSemester) + Number(pctSilabus) + Number(pctKehadiran);
        if (totalPct !== 100) {
            alert(`Total persentase harus 100%. Saat ini: ${totalPct}%`);
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
                { key: 'AUTO_SILABUS_SCORE', value: autoSilabus }
            ]);
            alert('Pengaturan nilai berhasil disimpan.');
        } catch (e: any) {
            alert('Gagal menyimpan: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <div className="p-6 text-slate-500">Memuat data...</div>;

    const totalPersentase = Number(pctBulanan) + Number(pctSemester) + Number(pctSilabus) + Number(pctKehadiran);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 font-sans min-h-screen max-w-[1400px] mx-auto pb-12 pt-2">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Pengaturan Nilai</h1>
                <p className="text-slate-500 text-sm mt-1">Atur parameter dan formula perhitungan nilai ujian dan raport</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Ujian Semester Settings Box */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        Komponen Ujian Semester (Per Juz)
                    </h2>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Nilai Awal / Maksimal</label>
                            <input 
                                type="number" 
                                value={nilaiAwalJuz} 
                                onChange={(e) => setNilaiAwalJuz(e.target.value)} 
                                className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Pengurangan Khoto Shogir</label>
                            <input 
                                type="number" step="0.01"
                                value={pengurangShogir} 
                                onChange={(e) => setPengurangShogir(e.target.value)} 
                                className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Pengurangan Khoto Kabir</label>
                            <input 
                                type="number" step="0.01"
                                value={pengurangKabir} 
                                onChange={(e) => setPengurangKabir(e.target.value)} 
                                className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Nilai Minimal Drop</label>
                            <input 
                                type="number" 
                                value={minNilaiJuz} 
                                onChange={(e) => setMinNilaiJuz(e.target.value)} 
                                className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono text-red-600"
                            />
                            <p className="text-xs text-slate-500 mt-1">Nilai tidak akan lebih kecil dari angka ini walau banyak salah.</p>
                        </div>
                    </div>
                </div>

                {/* Raport Formula Box */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        Formula Raport Akhir (%)
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Persentase Ujian Bulanan</label>
                            <div className="relative">
                                <input 
                                    type="number" max="100" min="0"
                                    value={pctBulanan} 
                                    onChange={(e) => setPctBulanan(e.target.value)} 
                                    className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono pr-8"
                                />
                                <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Persentase Ujian Semester</label>
                            <div className="relative">
                                <input 
                                    type="number" max="100" min="0"
                                    value={pctSemester} 
                                    onChange={(e) => setPctSemester(e.target.value)} 
                                    className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono pr-8"
                                />
                                <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Persentase Silabus Hafalan</label>
                            <div className="relative">
                                <input 
                                    type="number" max="100" min="0"
                                    value={pctSilabus} 
                                    onChange={(e) => setPctSilabus(e.target.value)} 
                                    className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono pr-8"
                                />
                                <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-600 mb-1">Persentase Kehadiran</label>
                            <div className="relative">
                                <input 
                                    type="number" max="100" min="0"
                                    value={pctKehadiran} 
                                    onChange={(e) => setPctKehadiran(e.target.value)} 
                                    className="w-full h-10 border-slate-300 rounded-lg text-sm focus:border-blue-500 font-mono pr-8"
                                />
                                <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                            </div>
                        </div>

                        <div className={`mt-4 p-3 rounded-lg text-sm font-bold flex items-center gap-2 ${totalPersentase === 100 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            <AlertCircle size={16} /> Total: {totalPersentase}% {totalPersentase !== 100 && '(Harus 100%)'}
                        </div>
                    </div>
                </div>
            </div>
                {/* Auto Silabus Score Settings Box */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 md:col-span-2">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        Perhitungan Nilai Silabus
                    </h2>
                    
                    <div className="space-y-4">
                        <label className="flex items-start gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                            <div className="flex items-center h-5 mt-1">
                                <input
                                    type="checkbox"
                                    checked={autoSilabus === 'true'}
                                    onChange={(e) => setAutoSilabus(e.target.checked ? 'true' : 'false')}
                                    className="w-5 h-5 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-800">Aktifkan Hitung Otomatis Nilai Silabus dari Progress Hafalan</span>
                                <span className="text-xs text-slate-500 mt-1">Jika diaktifkan, kolom "Nilai Silabus" di halaman Rekap Nilai akan dihitung otomatis dari Total Hafalan santri di Master Data Perkembangan dibagi Jumlah Juz Target kelas. (Maks 100).</span>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Standar Predikat Nilai */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 md:col-span-2">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        <Activity className="text-blue-500" size={20}/> Standar Predikat Nilai
                    </h2>
                    <div className="flex gap-2 mb-4">
                        <input type="text" value={newPredikatLabel} onChange={e => setNewPredikatLabel(e.target.value)} placeholder="Label Predikat" className="flex-1 text-[13px] border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 px-3 py-2 shadow-sm" />
                        <input type="number" value={newPredikatMinScore} onChange={e => setNewPredikatMinScore(e.target.value)} placeholder="Min. Nilai" className="w-24 text-[13px] border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 px-2 py-2 shadow-sm" />
                        <button onClick={handleSavePredikat} disabled={!newPredikatLabel || !newPredikatMinScore || isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg disabled:opacity-50 transition-colors shadow-sm"><Plus size={16}/></button>
                    </div>
                    <ul className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[200px] overflow-auto">
                        {(globalPredikatNilai || []).map(p => (
                            <li key={p.label} className="px-4 py-3 text-[13px] flex justify-between items-center group">
                                <div>
                                    <span className="font-bold text-slate-700 mr-2">{p.label}</span>
                                    <span className="text-[11px] font-bold px-2 py-1 rounded bg-white border border-slate-200 text-slate-500 shadow-sm">≥ {p.minScore}</span>
                                </div>
                                <button onClick={() => handleDeletePredikat(p.label)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded transition-colors"><Trash2 size={16}/></button>
                            </li>
                        ))}
                    </ul>
                </div>

            <div className="flex justify-end mt-6">
                <button 
                    onClick={handleSave} 
                    disabled={isSaving || totalPersentase !== 100}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} strokeWidth={2.5} /> {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
            </div>
        </div>
    );
};

export default PengaturanNilaiPage;
