import React, { useState, useEffect } from 'react';
import { quranMetadata, calculateMetrics } from '../lib/quranUtils';

interface Props {
    title: string;
    juzValue: string;
    suratAyatValue: string;
    onJuzChange: (val: string) => void;
    onSuratAyatChange: (val: string) => void;
    usePrevChecked: boolean;
    onUsePrevChange: (checked: boolean) => void;
    defaultSurahStart?: number;
    defaultSurahEnd?: number;
}

export const QuranHafalanInput: React.FC<Props> = ({
    title, juzValue, suratAyatValue, onJuzChange, onSuratAyatChange, usePrevChecked, onUsePrevChange,
    defaultSurahStart, defaultSurahEnd
}) => {
    // State dimulai dari 0 (Kosong/Pilih)
    const [sSurah, setSSurah] = useState(0);
    const [sAyat, setSAyat] = useState(0);
    const [eSurah, setESurah] = useState(0);
    const [eAyat, setEAyat] = useState(0);
    const [isCustom, setIsCustom] = useState(false);

    const isBackward = title.toLowerCase().includes('belakang') || defaultSurahStart === 114;
    const isForward = title.toLowerCase().includes('depan') || defaultSurahStart === 1;
    const direction = isBackward ? 'backward' : isForward ? 'forward' : 'auto';

    // Helper untuk mem-parsing string pratinjau seperti "Al-'Ankabut 14 - An-Nas 6"
    const parseSuratAyat = (str: string) => {
        if (!str) return null;
        const parts = str.split(/\s+[-–—]\s+|\s+s\.?d\.?\s+/).map(s => s.trim());
        if (parts.length !== 2) return null;

        const parsePart = (p: string) => {
            const m = p.match(/^(.*?)\s*(\d+)$/);
            let name = p;
            let ayah = 1;
            if (m) {
                name = m[1].trim();
                ayah = parseInt(m[2], 10);
            }
            const cleanName = name.toLowerCase().replace(/[\x27\x60\-_\s]/g, "");
            const found = quranMetadata.find(s => {
                const sClean = s.name.toLowerCase().replace(/[\x27\x60\-_\s]/g, "");
                return sClean === cleanName;
            });
            if (!found) return null;
            return { surahId: found.id, ayah };
        };

        const p1 = parsePart(parts[0]);
        const p2 = parsePart(parts[1]);
        if (!p1 || !p2) return null;
        return { sSurah: p1.surahId, sAyat: p1.ayah, eSurah: p2.surahId, eAyat: p2.ayah };
    };

    // Sinkronisasi awal jika sudah ada suratAyatValue
    useEffect(() => {
        if (suratAyatValue && sSurah === 0 && eSurah === 0) {
            const parsed = parseSuratAyat(suratAyatValue);
            if (parsed) {
                setSSurah(parsed.sSurah);
                setSAyat(parsed.sAyat);
                setESurah(parsed.eSurah);
                setEAyat(parsed.eAyat);
            }
        }
    }, [suratAyatValue]);

    useEffect(() => {
        // Hanya jalankan kalkulasi dan update form pratinjau jika SEMUA dropdown sudah dipilih valid
        if (sSurah > 0 && sAyat > 0 && eSurah > 0 && eAyat > 0 && !isCustom) {
            const juz = calculateMetrics(sSurah, sAyat, eSurah, eAyat, direction);
            const formatted = juz === 0 ? "0" : parseFloat(juz.toFixed(2)).toString();
            
            if (formatted !== juzValue) {
                onJuzChange(formatted);
            }
            
            const nameStart = quranMetadata.find(s => s.id === sSurah)?.name || '';
            const nameEnd = quranMetadata.find(s => s.id === eSurah)?.name || '';
            const preview = `${nameStart} ${sAyat} - ${nameEnd} ${eAyat}`;
            
            if (preview !== suratAyatValue && !usePrevChecked) {
                onSuratAyatChange(preview);
            }
        }
    }, [sSurah, sAyat, eSurah, eAyat, isCustom, direction]); // Aman dari looping

    const handleSSurahChange = (val: number) => {
        setSSurah(val);
        setSAyat(0);
        if (val > 0 && eSurah === 0) {
            if (isBackward && val !== 114) {
                setESurah(114);
                setEAyat(6);
            }
        }
    };

    const handleESurahChange = (val: number) => {
        setESurah(val);
        setEAyat(0);
        if (val > 0 && sSurah === 0) {
            if (isForward && val !== 1) {
                setSSurah(1);
                setSAyat(1);
            }
        }
    };

    const renderAyatOptions = (surahId: number) => {
        if (surahId === 0) return <option value={0}>- Ayat -</option>;
        
        const surah = quranMetadata.find(s => s.id === surahId);
        const max = surah?.ayat || 1;
        
        return [
            <option key={0} value={0}>- Ayat -</option>,
            ...Array.from({ length: max }, (_, i) => i + 1).map(i => (
                <option key={i} value={i}>Ayat {i}</option>
            ))
        ];
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Rentang Surat & Ayat {title}</label>
                <div className="flex flex-col md:flex-row items-center gap-2">
                    <div className="grid grid-cols-2 gap-2 w-full">
                        <select className="w-full text-[12px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 h-10 px-2" value={sSurah} onChange={e => handleSSurahChange(Number(e.target.value))}>
                            <option value={0}>- Surat -</option>
                            {quranMetadata.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                        </select>
                        <select className="w-full text-[12px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 h-10 px-2" value={sAyat} onChange={e => setSAyat(Number(e.target.value))}>
                            {renderAyatOptions(sSurah)}
                        </select>
                    </div>
                    <span className="text-slate-300 hidden md:block">-</span>
                    <div className="grid grid-cols-2 gap-2 w-full">
                        <select className="w-full text-[12px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 h-10 px-2" value={eSurah} onChange={e => handleESurahChange(Number(e.target.value))}>
                            <option value={0}>- Surat -</option>
                            {quranMetadata.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                        </select>
                        <select className="w-full text-[12px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 h-10 px-2" value={eAyat} onChange={e => setEAyat(Number(e.target.value))}>
                            {renderAyatOptions(eSurah)}
                        </select>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title} (Juz)</label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-medium text-slate-500">
                            <input type="checkbox" checked={isCustom} onChange={e => setIsCustom(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 w-3 h-3" />
                            Custom
                        </label>
                    </div>
                    <input type="number" step="0.1" readOnly={!isCustom} className={`w-full text-[13px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-10 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${!isCustom ? 'bg-slate-50 text-slate-500 outline-none cursor-not-allowed' : 'bg-white text-slate-800'}`} value={juzValue} onChange={e => onJuzChange(e.target.value)} placeholder="0" />
                </div>
                <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pratinjau {title}</label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-medium text-slate-500 hover:text-blue-600 transition-colors">
                            <input type="checkbox" checked={usePrevChecked} onChange={e => onUsePrevChange(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 w-3 h-3" />
                            Data Terakhir
                        </label>
                    </div>
                    <input 
                        type="text" 
                        readOnly={!isCustom} 
                        className={`w-full text-[12px] font-medium border border-slate-200/80 rounded-xl h-10 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${!isCustom ? 'bg-slate-50 cursor-not-allowed text-slate-700 outline-none' : 'bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`} 
                        value={suratAyatValue || ''} 
                        onChange={e => onSuratAyatChange(e.target.value)} 
                        placeholder="-" 
                    />
                </div>
            </div>
        </div>
    );
};
