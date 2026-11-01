import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, Calendar, ChevronDown, ChevronRight, CheckCircle2, X } from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { format, parseISO} from 'date-fns';
import { id } from 'date-fns/locale';
import { exportToExcel } from '../lib/utils';

interface Props {
    startDate: string;
    endDate: string;
    filterMarhalah: string;
    filterKelas: string;
    filterJenisHalaqah: string;
    filterHalaqah: string;
    filterSkema: string;
    searchQuery: string;
}

export interface SetoranHarianRekapRef {
    exportData: () => void;
}

const SetoranHarianRekap = forwardRef<SetoranHarianRekapRef, Props>(({
    startDate,
    endDate,
    filterMarhalah,
    filterKelas,
    filterJenisHalaqah,
    filterHalaqah,
    filterSkema,
    searchQuery
}, ref) => {
    const { 
        santri, 
        halaqah, 
        masterKelas, 
        setoranHarian, 
        attendance, 
        appSettings,
        globalMarhalahs,
        globalJenisHalaqah
    } = useSupabaseData();


    
    const [selectedSantriForModal, setSelectedSantriForModal] = useState<any | null>(null);
    const [visibleCount, setVisibleCount] = useState(50);
    

    const skemaOptions = useMemo(() => {
        const val = appSettings.find(s => s.key === 'SETORAN_SKEMA_OPTIONS')?.value;
        return val ? val.split(',') : ['Ziyadah', 'Murojaah', 'Murojaah Sabqi', 'Murojaah Manzil'];
    }, [appSettings]);

    const nilaiRanges = useMemo(() => {
        const val = appSettings.find(s => s.key === 'SETORAN_AUTO_RANGES')?.value;
        if (val) {
            try { return JSON.parse(val); } catch (e) {}
        }
        return [
            { label: 'Mumtaz', min: 90 },
            { label: 'Jayyid Jiddan', min: 80 },
            { label: 'Jayyid', min: 70 },
            { label: 'Maqbul', min: 60 },
            { label: 'Dhaif', min: 0 }
        ];
    }, [appSettings]);

    const filteredHalaqahList = useMemo(() => {
        return halaqah.filter(h => {
            if (filterMarhalah !== 'all' && h.marhalah !== filterMarhalah) return false;
            if (filterJenisHalaqah !== 'all' && (h.jenis || (h as any).jenis_halaqah) !== filterJenisHalaqah) return false;
            return true;
        });
    }, [halaqah, filterMarhalah, filterJenisHalaqah]);

    // Build flattened list of santri and their halaqah
    const santriHalaqahMap = useMemo(() => {
        const map = new Map();
        halaqah.forEach(h => {
            if (h.history) {
                h.history.forEach((hs: any) => {
                    if (hs.santri) {
                        const existing = map.get(hs.santri.id) || [];
                        existing.push({ halaqah: h, start_date: hs.start_date, end_date: hs.end_date });
                        map.set(hs.santri.id, existing);
                    }
                });
            } else if (h.santri) {
                h.santri.forEach((s: any) => {
                    const existing = map.get(s.id) || [];
                    existing.push({ halaqah: h, start_date: null, end_date: null });
                    map.set(s.id, existing);
                });
            }
        });
        return map;
    }, [halaqah]);

    const filteredData = useMemo(() => {
        let results = santri.filter(s => {
            if (filterMarhalah !== 'all' && s.marhalah !== filterMarhalah) return false;
            if (filterKelas !== 'all' && s.kelas !== filterKelas) return false;
            if (searchQuery && !s.nama.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            
            const hList = santriHalaqahMap.get(s.id) || [];
            if (filterHalaqah !== 'all') {
                if (!hList.some((h: any) => h.halaqah.id.toString() === filterHalaqah)) return false;
            }
            if (filterJenisHalaqah !== 'all') {
                if (!hList.some((h: any) => (h.halaqah.jenis || h.halaqah.jenis_halaqah) === filterJenisHalaqah)) return false;
            }
            return true;
        });

        return results.map(s => {
            // Filter setoran
            let sSetoran = setoranHarian.filter(sh => sh.santri_id === s.id);
            if (startDate) sSetoran = sSetoran.filter(sh => sh.tanggal >= startDate);
            if (endDate) sSetoran = sSetoran.filter(sh => sh.tanggal <= endDate);
            
            const ziyadahCount = sSetoran.filter(sh => sh.skema?.toLowerCase().includes('ziyadah')).length;
            
            if (filterSkema !== 'all') {
                if (filterSkema === 'Murojaah' || filterSkema === 'murojaah') {
                    sSetoran = sSetoran.filter(sh => sh.skema?.toLowerCase().includes('murojaah'));
                } else {
                    sSetoran = sSetoran.filter(sh => sh.skema === filterSkema);
                }
            }
            
            // Stats
            const filterSkemaCount = sSetoran.length;
            const totalHalaman = sSetoran.reduce((acc, sh) => acc + (parseFloat(sh.jumlah_halaman) || 0), 0);
            
            let totalScore = 0;
            let scoredCount = 0;
            sSetoran.forEach(sh => {
                const range = nilaiRanges.find((r: any) => r.label === sh.nilai);
                if (range) {
                    totalScore += range.min;
                    scoredCount++;
                } else if (sh.nilai) {
                    // Fallback
                    const n = sh.nilai.toLowerCase();
                    if (n.includes('mumtaz')) totalScore += 90;
                    else if (n.includes('jayyid jiddan')) totalScore += 80;
                    else if (n.includes('jayyid')) totalScore += 70;
                    else if (n.includes('maqbul')) totalScore += 60;
                    scoredCount++;
                }
            });
            
            const avgScore = scoredCount > 0 ? totalScore / scoredCount : 0;
            let finalNilaiLabel = '-';
            const sortedRanges = [...nilaiRanges].sort((a: any, b: any) => b.min - a.min);
            if (scoredCount > 0) {
                for (const r of sortedRanges) {
                    if (avgScore >= r.min) {
                        finalNilaiLabel = r.label;
                        break;
                    }
                }
            }

            // Attendance
            let sAtt = attendance.filter(a => a.personId === s.id && a.peran !== 'Musammi');
            if (startDate) sAtt = sAtt.filter(a => a.date >= startDate);
            if (endDate) sAtt = sAtt.filter(a => a.date <= endDate);
            const hadirAtt = sAtt.filter(a => a.status === 'Hadir' || a.status === 'Terlambat').length;
            const persentaseKehadiran = sAtt.length > 0 ? (hadirAtt / sAtt.length) * 100 : 0;

            return {
                ...s,
                setoranList: sSetoran,
                ziyadahCount,
                filterSkemaCount,
                totalHalaman,
                persentaseKelancaran: scoredCount > 0 ? avgScore : 0,
                finalNilaiLabel,
                persentaseKehadiran,
                totalAtt: sAtt.length
            };
        });
    }, [santri, santriHalaqahMap, setoranHarian, attendance, filterMarhalah, filterKelas, filterHalaqah, filterJenisHalaqah, filterSkema, searchQuery, startDate, endDate, nilaiRanges]);

    const paginatedData = useMemo(() => filteredData.slice(0, visibleCount), [filteredData, visibleCount]);

    useImperativeHandle(ref, () => ({
        exportData: () => {
            const dataToExport = filteredData.map(s => {
                let unitStr = 'Halaman';
                let totalStr = s.totalHalaman.toString();
                if ((filterSkema || '').toLowerCase().includes('murojaah')) {
                    unitStr = 'Juz';
                    totalStr = (s.totalHalaman / 20).toFixed(2);
                }
                return {
                    'Nama Santri': s.nama,
                    'Marhalah': s.marhalah,
                    'Kelas': s.kelas,
                    [`Jumlah Setoran (${unitStr})`]: totalStr,
                    '% Kelancaran': `${s.persentaseKelancaran.toFixed(1)}%`,
                    'Nilai Rata-rata': s.finalNilaiLabel,
                    '% Kehadiran': `${s.persentaseKehadiran.toFixed(1)}%`
                };
            });
            exportToExcel(dataToExport, `Rekap_Setoran_${startDate}_sd_${endDate}`);
        }
    }), [filteredData, filterSkema, startDate, endDate]);

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col min-h-[500px]">
                <div className="flex-1 overflow-x-auto p-0 min-h-[300px] border-b border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-40">
                            <tr className="bg-slate-50 border-b border-slate-200/80">
                                <th className="px-5 py-4 sticky left-0 bg-slate-50 z-50 w-12 border-r border-slate-200/80 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"></th>
                                <th className="px-5 py-4 sticky left-[48px] bg-slate-50 z-50 min-w-[200px] border-r border-slate-200/80 text-[12px] font-bold text-slate-600 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Nama Santri</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider min-w-[100px] border-r border-slate-200/80">Marhalah / Kelas</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[150px] border-r border-slate-200/80">
                                    Jumlah Setoran
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">% Kelancaran</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">Nilai Rata-rata</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px]">
                                    % Kehadiran
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-slate-500 font-medium">
                                        <div className="flex flex-col items-center justify-center">
                                            <Filter size={32} className="text-slate-300 mb-2" />
                                            <p className="text-sm font-medium">Tidak ada data santri yang sesuai filter</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((s) => (
                                    <React.Fragment key={s.id}>
                                        <tr 
                                            className={`hover:bg-slate-50/50 cursor-pointer transition-colors group`}
                                            onClick={() => setSelectedSantriForModal(s)}
                                        >
                                            <td className="px-5 py-4 text-slate-400 sticky left-0 z-10 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-center bg-white group-hover:bg-slate-50/50 transition-colors">
                                                <ChevronRight size={18} className="mx-auto" />
                                            </td>
                                            <td className="px-5 py-3 sticky left-[48px] bg-white group-hover:bg-slate-50 z-10 border-r-2 border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] min-w-[200px] transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                                        <span className="text-[11px] font-bold text-slate-600">
                                                            {(s.nama || '').split(' ').map((n: string) => n[0] || '').join('').substring(0, 2).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <p className="text-[13px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate max-w-[150px]" title={s.nama}>{s.nama}</p>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 border-r border-slate-100/60">
                                                <div className="flex flex-col">
                                                    <span className="text-[12px] font-semibold text-slate-700">{s.marhalah}</span>
                                                    <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Kelas {s.kelas}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center text-[13px] font-bold text-blue-600 border-r border-slate-200/80">
                                                <div className="flex flex-col items-center justify-center">
                                                    <div>
                                                        {(filterSkema || '').toLowerCase().includes('murojaah') ? (s.totalHalaman / 20).toFixed(2) : s.totalHalaman.toString()}
                                                        <span className="text-[10px] font-normal text-slate-400 ml-1">
                                                            {(filterSkema || '').toLowerCase().includes('murojaah') ? 'Juz' : 'Hal'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center border-r border-slate-200/80">
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className="text-[13px] font-bold text-slate-800">{s.persentaseKelancaran.toFixed(1)}%</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center border-r border-slate-200/80">
                                                <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide uppercase ${s.finalNilaiLabel.includes('Mumtaz') ? 'bg-emerald-100 text-emerald-700' : s.finalNilaiLabel.includes('Jayyid') ? 'bg-blue-100 text-blue-700' : s.finalNilaiLabel !== '-' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {s.finalNilaiLabel}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className="text-[13px] font-bold text-slate-800">{s.persentaseKehadiran.toFixed(1)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                        </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                                {visibleCount < filteredData.length && (
                    <div className="p-4 border-t border-slate-100 flex justify-center bg-slate-50/50">
                        <button 
                            onClick={() => setVisibleCount(v => v + 50)}
                            className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
                        >
                            Muat Lebih Banyak ({filteredData.length - visibleCount} tersisa)
                        </button>
                    </div>
                )}
            </div>

            {selectedSantriForModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedSantriForModal(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">{selectedSantriForModal.nama}</h3>
                                <p className="text-sm text-slate-500 font-medium">Detail Setoran Harian</p>
                            </div>
                            <button onClick={() => setSelectedSantriForModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-slate-50">
                            {selectedSantriForModal.setoranList.length === 0 ? (
                                <div className="text-center py-10 bg-white rounded-xl border border-slate-200 border-dashed">
                                    <p className="text-sm text-slate-500 font-medium">Belum ada data setoran pada periode ini.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-200/80 shadow-sm bg-white">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200/80 sticky top-0 z-30">
                                            <tr>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tanggal</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Waktu</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Skema</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Surat & Ayat</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Jml Hal</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Nilai</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Khoto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {[...selectedSantriForModal.setoranList].sort((a: any, b: any) => (b.tanggal || '').localeCompare(a.tanggal || '')).map((sh: any) => (
                                                <tr key={sh.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-3 whitespace-nowrap text-[12px] font-medium text-slate-700">{sh.tanggal ? (function(){ try { return format(parseISO(sh.tanggal), 'dd MMM yyyy', { locale: id }); } catch(e) { return sh.tanggal; } })() : '-'}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-slate-500">{sh.waktu}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-[12px] font-medium text-blue-600">{sh.skema}</td>
                                                    <td className="px-4 py-3 text-[12px] text-slate-700 font-bold">
                                                        {sh.surat} <span className="font-normal text-slate-500">{sh.ayat ? `Ayat ${sh.ayat}` : ''}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-[12px] font-bold text-slate-700">{sh.jumlah_halaman || '-'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="inline-flex px-2 py-1 bg-slate-100 rounded-md text-[10px] font-bold text-slate-600 uppercase tracking-wide">{sh.nilai}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2 text-[11px]">
                                                            <span className="text-rose-500 font-bold" title="Kesalahan Kabir">K:{sh.kesalahan_kabir || 0}</span>
                                                            <span className="text-amber-500 font-bold" title="Kesalahan Shoghir">S:{sh.kesalahan_shoghir || 0}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            , document.body)}
        </div>
    );
});

export default SetoranHarianRekap;