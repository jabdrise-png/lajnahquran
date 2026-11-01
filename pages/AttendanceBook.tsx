
import React, { useState, useMemo, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import Card from '../components/Card';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { HalaqahType, Marhalah, Waktu, Peran } from '../types';
// Removed globalJenisHalaqah import
import { Printer, Calendar, Filter, Clock, ArrowLeft } from 'lucide-react';
import { addDays, format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AttendanceBookProps {
    onNavigate?: (page: any) => void;
}

const AttendanceBook: React.FC<AttendanceBookProps> = ({ onNavigate }) => {
    const { halaqah, attendance, loading, error, globalMarhalahs, globalWaktuHalaqah, globalJenisHalaqah, userProfile, waliKelas , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const permittedHalaqah = useMemo(() => {
        if (!halaqah) return [];
        const activeHalaqah = halaqah.filter(h => h.is_active !== false);
        if (userProfile?.role === 'musammi') {
            return activeHalaqah.filter(h => 
                (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                (h.musammi?.nama?.toLowerCase().trim() === userProfile.name.toLowerCase().trim())
            );
        }
        return activeHalaqah;
    }, [halaqah, userProfile]);
    
    // Helper to get Monday of the current week
    const getMonday = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
        return new Date(date.setDate(diff));
    };

    const formatDateIndo = (date: Date) => {
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    };

    const formatDayIndo = (date: Date) => {
        const days = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        return `${days[date.getDay()]}, ${date.getDate()}/${date.getMonth() + 1}`;
    };

    // Filters
    const [startDate, setStartDate] = useState(() => {
        const today = new Date();
        const monday = getMonday(today);
        return monday.toISOString().split('T')[0];
    });
    
    // Duration is now a number (number of weeks)
    const [durationWeeks, setDurationWeeks] = useState<number>(1);
    const [maxPerPage, setMaxPerPage] = useState<number>(3);
    const [selectedType, setSelectedType] = useState<string>(HalaqahType.Utama); // Changed type to string to allow custom types
    const [selectedMarhalah, setSelectedMarhalah] = useState<Marhalah | 'all'>('all');

    // --- NEW: Calculate Dynamic Available Types ---
    const availableTypes = useMemo(() => {
        const types = new Set<string>(globalJenisHalaqah);
        // Add custom types found in the database
        if (permittedHalaqah && permittedHalaqah.length > 0) {
            permittedHalaqah.forEach(h => {
                if (h.jenis) types.add(h.jenis);
            });
        }
        return Array.from(types).sort();
    }, [permittedHalaqah]);

    // Filter Halaqah List
    const filteredHalaqah = useMemo(() => {
        const getActiveSantriForDate = (h: any, dateStr: string) => {
            if (!h.history) return h.santri || [];
            return h.history.filter((hs: any) => {
                if (!hs.santri) return false;
                if (hs.start_date && new Date(hs.start_date.includes('/') ? hs.start_date.split('/').reverse().join('-') : hs.start_date).getTime() > new Date(dateStr.length > 10 ? dateStr.substring(0,10) : dateStr).getTime()) return false;
                if (hs.end_date && hs.end_date.trim() !== '' && new Date(hs.end_date.includes('/') ? hs.end_date.split('/').reverse().join('-') : hs.end_date).getTime() < new Date(dateStr.length > 10 ? dateStr.substring(0,10) : dateStr).getTime()) return false;
                return true;
            }).map((hs: any) => hs.santri);
        };

        return permittedHalaqah
            .map(h => {
                let santriList = getActiveSantriForDate(h, startDate);
                if (userProfile?.role === 'pengajar') {
                    const isMusammiOfThisHalaqah = (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                                                   (h.musammi?.nama?.toLowerCase().trim() === userProfile?.name?.toLowerCase().trim());
                    if (!isMusammiOfThisHalaqah) {
                        const userWaliClasses = waliKelas.filter(w => w.user_id === userProfile.id).map(w => ({ marhalah: w.marhalah, kelas: w.kelas }));
                        santriList = santriList.filter(s => userWaliClasses.some(wc => wc.marhalah === s.marhalah && wc.kelas === s.kelas));
                    }
                }
                return {
                    ...h,
                    santri: santriList
                };
            })
            .filter(h => {
            if (h.jenis !== selectedType) return false;
            if (selectedMarhalah !== 'all') {
                const targetMarhalahId = masterMarhalahs?.find((m: any) => m.nama === selectedMarhalah)?.id;
                const matchesMarhalah = h.marhalah === selectedMarhalah || (targetMarhalahId && h.marhalah_id === targetMarhalahId);
                if (!matchesMarhalah) return false;
            }
            return true;
        }).sort((a, b) => {
            // Sort: No Urut (Primary) -> Jenis -> Marhalah -> Nama
            
            // 1. No Urut
            if ((a.no_urut || 999) !== (b.no_urut || 999)) return (a.no_urut || 999) - (b.no_urut || 999);

            // 2. Jenis
            if (a.jenis !== b.jenis) return a.jenis.localeCompare(b.jenis);

            // 3. Marhalah
            const marhalahOrder = globalMarhalahs;
            const mIdxA = marhalahOrder.indexOf(a.marhalah);
            const mIdxB = marhalahOrder.indexOf(b.marhalah);
            if (mIdxA !== mIdxB) return mIdxA - mIdxB;

            // 4. Nama
            return a.nama.localeCompare(b.nama);
        });
    }, [permittedHalaqah, selectedType, selectedMarhalah, globalMarhalahs, startDate]);

    // Get 6 working days for a specific week (skip Friday)
    const getDaysForWeek = (weekStartDate: Date) => {
        const dates: Date[] = [];
        for(let i=0; i < 7; i++) {
            const d = addDays(weekStartDate, i);
            if (d.getDay() !== 5) { // 5 is Friday (Jumat)
                dates.push(d);
            }
        }
        return dates;
    };

    const getWaktuInitials = (waktuArr: Waktu[]) => {
        return waktuArr.map(w => {
            if (w === Waktu.Shubuh) return 'S';
            if (w === Waktu.Dhuha) return 'D';
            if (w === Waktu.Ashar) return 'A';
            if (w === Waktu.Isya) return 'I';
            return (w as string).charAt(0);
        });
    };

    // Function to generate the PDF object
    const generatePDFDoc = (): jsPDF => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const totalWeeks = durationWeeks;
        const mainStartDate = new Date(startDate);
        
        // --- 1. COVER PAGE ---
        doc.setFillColor(255, 255, 255); 
        doc.rect(0, 0, 210, 297, 'F');
        
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.text("BUKU ABSENSI", 105, 80, { align: 'center' });
        doc.text("HALAQAH AL-QURAN", 105, 92, { align: 'center' });
        
        doc.setFontSize(14);
        doc.setTextColor(37, 99, 235);
        doc.text("MA'HAD AL FARUQ ASSALAFY", 105, 110, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text("Kalibagor, Banyumas", 105, 117, { align: 'center' });

        doc.setDrawColor(200, 200, 200);
        doc.line(60, 130, 150, 130);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.text(selectedType.toUpperCase(), 105, 145, { align: 'center' });
        
        doc.setFontSize(12);
        doc.text(`Marhalah: ${selectedMarhalah === 'all' ? 'SEMUA MARHALAH' : selectedMarhalah.toUpperCase()}`, 105, 155, { align: 'center' });
        
        // Calculate Total Period
        const endDateTotal = addDays(mainStartDate, (totalWeeks * 7) - 1);
        doc.setFont('helvetica', 'bold');
        doc.text(`PERIODE TOTAL`, 105, 180, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text(`${formatDateIndo(mainStartDate)} - ${formatDateIndo(endDateTotal)}`, 105, 188, { align: 'center' });
        doc.text(`(${totalWeeks} Minggu)`, 105, 195, { align: 'center' });

        // Loop through each week
        for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
            const currentWeekStart = addDays(mainStartDate, weekIndex * 7);
            const activeDates = getDaysForWeek(currentWeekStart);
            const weekLabel = `MINGGU KE-${weekIndex + 1}`;
            const weekPeriod = `${formatDateIndo(activeDates[0])} - ${formatDateIndo(activeDates[activeDates.length - 1])}`;

            // --- 2. SEPARATOR PAGE FOR WEEK X ---
            doc.addPage();
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, 210, 297, 'F'); // Light background

            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(1);
            doc.rect(20, 100, 170, 60); // Box

            doc.setTextColor(37, 99, 235);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(30);
            doc.text(weekLabel, 105, 130, { align: 'center' });
            
            doc.setTextColor(71, 85, 105);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text(weekPeriod, 105, 145, { align: 'center' });


            // --- 3. DATA PAGES FOR WEEK X ---
            doc.addPage();
            
            let cursorY = 15; 
            let itemsOnPage = 0;
            const MAX_PER_PAGE = maxPerPage; // Dynamic: 1-5 Halaqah per page

            filteredHalaqah.forEach((h, index) => {
                // Force page break every 3 items
                if (itemsOnPage === MAX_PER_PAGE) {
                    doc.addPage();
                    cursorY = 15;
                    itemsOnPage = 0;
                }

                const sesiHeaders = getWaktuInitials(h.waktu);
                const colsPerDay = sesiHeaders.length;
                
                // --- Halaqah Header Info ---
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                
                // Header Bar (Light Gray) - Simplified
                doc.setFillColor(240, 240, 240);
                doc.rect(14, cursorY, 182, 7, 'F');
                
                // Only show Name and Number (sorted number if available)
                // Use actual index in filtered list for display number if no_urut not set
                const displayNumber = h.no_urut || (index + 1);
                doc.text(`${displayNumber}. ${h.nama}`, 16, cursorY + 5);
                
                cursorY += 8; // Reduced Spacing after header

                // --- Table Construction ---
                const headRow1: any[] = [
                    { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Nama (Kelas)', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } }
                ];
                const headRow2: any[] = [];

                activeDates.forEach(date => {
                    // Header Tanggal
                    const dayLabel = formatDayIndo(date);
                    headRow1.push({ 
                        content: dayLabel, 
                        colSpan: colsPerDay, 
                        styles: { halign: 'center', fillColor: [255, 255, 255], textColor: 0, fontSize: 8, fontStyle: 'bold' } 
                    });
                    sesiHeaders.forEach(s => {
                        headRow2.push({ content: s, styles: { halign: 'center', cellWidth: 'auto', fontSize: 7, textColor: [50,50,50] } });
                    });
                });

                // --- ROW DATA CONSTRUCTION ---
                // Helper to get attendance status code for a person on a specific date and waktu
                const getStatusLetter = (personId: number, role: Peran, date: Date, waktuName: string) => {
                    if (!attendance || attendance.length === 0) return '';
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const found = attendance.find(a => {
                        const aDate = a.date ? a.date.substring(0, 10) : '';
                        return aDate === dateStr &&
                            a.personId === personId &&
                            a.peran === role &&
                            a.waktu?.toLowerCase() === waktuName.toLowerCase();
                    });
                    if (!found) return '';
                    const st = (found.status || '').toLowerCase();
                    if (st === 'hadir') return 'H';
                    if (st === 'izin') return 'I';
                    if (st === 'sakit') return 'S';
                    if (st === 'alpa') return 'A';
                    if (st === 'terlambat') return 'T';
                    return (found.status || '').charAt(0).toUpperCase();
                };

                // 1. Musammi Row (Distinct Style, No Suffix)
                const musammiCells: any[] = [];
                activeDates.forEach(date => {
                    h.waktu.forEach((waktuName: string) => {
                        const code = getStatusLetter(h.musammi.id, Peran.Musammi, date, waktuName);
                        musammiCells.push({
                            content: code,
                            styles: {
                                halign: 'center',
                                fontSize: 7,
                                fontStyle: code ? 'bold' : 'normal',
                                fillColor: [240, 248, 255],
                                textColor: code === 'A' ? [225, 29, 72] : (code === 'S' || code === 'I' ? [217, 119, 6] : [30, 41, 59])
                            }
                        });
                    });
                });

                const musammiRow = [
                    { content: 'M', styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 248, 255] } },
                    { content: h.musammi.nama, styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } },
                    ...musammiCells
                ];

                // 2. Santri Rows
                const santriRows = h.santri.sort((a,b) => a.nama.localeCompare(b.nama)).map((s, i) => {
                    const sCells: any[] = [];
                    activeDates.forEach(date => {
                        h.waktu.forEach((waktuName: string) => {
                            const code = getStatusLetter(s.id, Peran.Santri, date, waktuName);
                            sCells.push({
                                content: code,
                                styles: {
                                    halign: 'center',
                                    fontSize: 7,
                                    fontStyle: code ? 'bold' : 'normal',
                                    textColor: code === 'A' ? [225, 29, 72] : (code === 'S' || code === 'I' ? [217, 119, 6] : [30, 41, 59])
                                }
                            });
                        });
                    });
                    return [
                        i + 1, 
                        `${s.nama} (${s.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas})`, 
                        ...sCells
                    ];
                });

                // Combine them: Musammi first, then Santri
                const body = [musammiRow, ...santriRows];

                autoTable(doc, {
                    startY: cursorY,
                    head: [headRow1, headRow2],
                    body: body,
                    theme: 'grid',
                    styles: { 
                        fontSize: 9, 
                        cellPadding: 1.5,
                        lineColor: [100, 100, 100],
                        lineWidth: 0.1,
                        textColor: 0,
                        valign: 'middle',
                        minCellHeight: 6
                    },
                    headStyles: {
                        fillColor: [255, 255, 255],
                        textColor: 0,
                        lineWidth: 0.1,
                        lineColor: [100, 100, 100],
                        valign: 'middle'
                    },
                    columnStyles: {
                        0: { cellWidth: 10, halign: 'center' }, // No
                        1: { cellWidth: 55 }, // Nama - Wider column
                    },
                    margin: { left: 14, right: 14 },
                    pageBreak: 'auto', 
                });

                // Update cursor based on table end
                const finalY = (doc as any).lastAutoTable.finalY;
                
                // Reduce spacing for the next item (closer tables)
                cursorY = finalY + 8; 
                itemsOnPage++;
            });
        } // End Week Loop

        return doc;
    };

    // Auto-generate preview whenever data/filters change
    useEffect(() => {
        let objectUrl: string | null = null;
        
        const timer = setTimeout(() => {
            if (filteredHalaqah.length > 0) {
                try {
                    const doc = generatePDFDoc();
                    // Using Blob URL instead of Data URI string for better browser support
                    const blob = doc.output('blob');
                    objectUrl = URL.createObjectURL(blob);
                    setPreviewUrl(objectUrl);
                } catch (e) {
                    console.error("Preview generation error:", e);
                }
            } else {
                setPreviewUrl(null);
            }
        }, 800); 

        return () => {
            clearTimeout(timer);
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [filteredHalaqah, attendance, startDate, durationWeeks, maxPerPage, selectedType, selectedMarhalah]);

    const handleDownloadPDF = () => {
        try {
            const doc = generatePDFDoc();
            doc.save(`Buku_Absensi_${selectedType.replace(/\s/g, '_')}_${startDate}_${durationWeeks}Minggu.pdf`);
        } catch (e: any) {
            console.error("PDF Generation Error:", e);
            alert(`Gagal membuat PDF: ${e.message}`);
        }
    };

    if (loading) return <p>Loading data...</p>;
    if (error) return <p className="text-error">Error: {error}</p>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Format Cetak Fisik Buku Absensi</h1>
                    <p className="text-sm text-slate-500 mt-1">Generate lembar absensi mingguan per halaqah dalam format PDF untuk pencatatan manual.</p>
                </div>
                {onNavigate && (
                    <button
                        onClick={() => onNavigate('Buku Absensi')}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                    >
                        <ArrowLeft size={16} />
                        Kembali ke Buku Absensi
                    </button>
                )}
            </div>

            <Card title="Pengaturan Cetak Buku Absensi">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            <Calendar size={16} className="inline mr-1"/> Mulai Tanggal (Senin)
                        </label>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={e => setStartDate(e.target.value)} 
                            className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-secondary focus:border-secondary sm:text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            <Clock size={16} className="inline mr-1"/> Durasi Buku
                        </label>
                        <select 
                            value={durationWeeks} 
                            onChange={e => setDurationWeeks(parseInt(e.target.value))}
                            className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-secondary focus:border-secondary sm:text-sm"
                        >
                            <option value={1}>1 Minggu</option>
                            <option value={2}>2 Minggu</option>
                            <option value={3}>3 Minggu</option>
                            <option value={4}>4 Minggu (1 Bulan)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Halaqah per Halaman
                        </label>
                        <select 
                            value={maxPerPage} 
                            onChange={e => setMaxPerPage(parseInt(e.target.value))}
                            className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-secondary focus:border-secondary sm:text-sm"
                        >
                            <option value={1}>1 Halaqah</option>
                            <option value={2}>2 Halaqah</option>
                            <option value={3}>3 Halaqah</option>
                            <option value={4}>4 Halaqah</option>
                            <option value={5}>5 Halaqah</option>
                        </select>
                    </div>

                    <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">
                            <Filter size={16} className="inline mr-1"/> Jenis Halaqah
                        </label>
                        <select 
                            value={selectedType} 
                            onChange={e => setSelectedType(e.target.value as HalaqahType)} 
                            className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-secondary focus:border-secondary sm:text-sm"
                        >
                            {/* Uses Dynamic availableTypes */}
                            {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">
                            Marhalah
                        </label>
                        <select 
                            value={selectedMarhalah} 
                            onChange={e => setSelectedMarhalah(e.target.value as Marhalah | 'all')} 
                            className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-secondary focus:border-secondary sm:text-sm"
                        >
                            <option value="all">Semua Marhalah</option>
                            {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex justify-between items-center border-t border-slate-100 pt-4">
                     <div className="text-sm text-slate-500">
                        {filteredHalaqah.length > 0 
                            ? `Siap mencetak ${filteredHalaqah.length} halaqah (Max ${maxPerPage}/halaman). Total ${durationWeeks} Minggu.` 
                            : 'Tidak ada data halaqah.'}
                    </div>
                    <button 
                        onClick={handleDownloadPDF} 
                        disabled={filteredHalaqah.length === 0}
                        className="bg-secondary text-white font-bold py-2.5 px-6 rounded-lg hover:bg-accent transition-colors flex items-center shadow-md disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                        <Printer size={20} className="mr-2" />
                        Download PDF
                    </button>
                </div>
            </Card>

            {/* Live Preview Section */}
            <div className="bg-slate-200 p-4 rounded-xl border border-slate-300">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-700">Live Preview</h3>
                    {!previewUrl && <span className="text-sm text-slate-500 italic">Menyiapkan preview...</span>}
                </div>
                <div className="w-full h-[750px] bg-white rounded shadow-lg overflow-hidden relative">
                    {previewUrl ? (
                        <iframe src={previewUrl} className="w-full h-full" title="PDF Preview"></iframe>
                    ) : (
                         <div className="flex h-full items-center justify-center text-slate-400">
                            {filteredHalaqah.length === 0 ? "Tidak ada data untuk ditampilkan." : "Memuat..."}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AttendanceBook;
