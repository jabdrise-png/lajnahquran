import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Download, Upload, Filter, Printer, ArrowUpDown, ChevronUp, ChevronDown, Eye, PenTool, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import ActionDropdown from '../../components/ActionDropdown';
import RaportDocument from '../../components/RaportDocument';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { exportToExcel, parseSpreadsheet, getActiveSemesterDateRange, getPredikat, getEvaluationPeriods } from '../../lib/utils';
import { AttendanceStatus } from '../../types';
import { supabase } from '../../lib/supabaseClient';

const RekapNilaiPage: React.FC = () => {
    const { 
        santri, 
        ujianBulanan, 
        ujianSemester, 
        studentProgress, 
        attendance,
        saveUjianSemester,
        addStudentProgressBatch,
        selectedAcademicYear,
        appSettings,
        loading, masterKelas, globalMarhalahs, userProfile, waliKelas, classTargets, globalPredikatNilai, masterMarhalahs, masterKelasRelasi, getOrgId 
    } = useSupabaseData();
    
    // removed local selectedSemester state
    const [selectedMarhalah, setSelectedMarhalah] = useState('All');
    const [selectedKelas, setSelectedKelas] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedSantriIds, setSelectedSantriIds] = useState<Set<number>>(new Set());
    const [showPreview, setShowPreview] = useState(false);
    const [signatureImage, setSignatureImage] = useState<string | null>(localStorage.getItem('e_signature_image'));
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    
    const [attendancePercentages, setAttendancePercentages] = useState<Record<number, number>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [currentPageNum, setCurrentPageNum] = useState(0);
    const rowsPerPage = 50;

    const settings = useMemo(() => {
        return {
            pctBulanan: Number(appSettings.find(s => s.key === 'PCT_UJIAN_BULANAN')?.value) || 40,
            pctSemester: Number(appSettings.find(s => s.key === 'PCT_UJIAN_SEMESTER')?.value) || 50,
            pctSilabus: Number(appSettings.find(s => s.key === 'PCT_SILABUS')?.value) || 10,
            pctKehadiran: Number(appSettings.find(s => s.key === 'PCT_KEHADIRAN')?.value) || 0,
        };
    }, [appSettings]);

    // We use student_progress table to store 'Silabus Hafalan' value. We use a synthetic month_key for it.
    const selectedSemester = selectedAcademicYear?.active_semester || 'Ganjil';
    const { orgName: userOrgName } = useSupabaseData();
    const orgName = appSettings.find(s => s.key === 'ORG_NAME')?.value || userOrgName || 'TPA / TPQ Al-Hidayah';
    const orgLogo = appSettings.find(s => s.key === 'ORG_LOGO')?.value || '';
    const autoSilabus = appSettings.find(s => s.key === 'AUTO_SILABUS_SCORE')?.value === 'true';
    const semesterDates = getActiveSemesterDateRange(appSettings, selectedAcademicYear?.id, selectedSemester);

    useEffect(() => {
        let isMounted = true;
        const fetchAttendancePercentages = async () => {
            try {
                const orgId = await getOrgId();
                if (!orgId) return;

                const startDate = semesterDates.startDate || '1970-01-01';
                const endDate = semesterDates.endDate || '2999-12-31';

                const { data, error } = await (supabase as any).rpc('rpc_get_santri_attendance_percentages', {
                    p_org_id: orgId,
                    p_start_date: startDate,
                    p_end_date: endDate
                });

                if (error) throw error;

                if (data && isMounted) {
                    const map: Record<number, number> = {};
                    data.forEach((row: any) => {
                        map[row.person_id] = Number(row.pct_kehadiran);
                    });
                    setAttendancePercentages(map);
                }
            } catch (err: any) {
                // Downgrade to console.warn so it doesn't trigger error overlays.
                // This is expected to fail if the user hasn't executed the SQL script yet,
                // and the app will smoothly fallback to manual calculation.
                console.warn("RPC attendance percentages not available, falling back to manual calculation.", err.message);
            }
        };

        if (semesterDates) {
            fetchAttendancePercentages();
        }
        return () => { isMounted = false; };
    }, [semesterDates, getOrgId]);

    // We use student_progress table to store 'Silabus Hafalan' value. We use a synthetic month_key for it.
    const silabusMonthKey = useMemo(() => {
        if (!selectedAcademicYear) return '';
        return `SEM-${selectedAcademicYear.id}-${selectedSemester}`;
    }, [selectedAcademicYear, selectedSemester]);

    const ubPeriods = useMemo(() => {
        const periodsSettingKey = `UB_PERIODS_${selectedAcademicYear?.id}_${selectedSemester}`;
        const setting = appSettings.find(s => s.key === periodsSettingKey);
        if (setting && setting.value) {
            try { return JSON.parse(setting.value); } catch (e) { return []; }
        }
        if (selectedSemester === 'Ganjil') {
            const oldKey = `UB_PERIODS_${selectedAcademicYear?.id}`;
            let oldStored = appSettings.find(s => s.key === oldKey)?.value;
            if (!oldStored) {
                oldStored = appSettings.find(s => s.key === `UB_PERIODS_${selectedAcademicYear?.id}_Gasal`)?.value;
            }
            if (oldStored) {
                try { return JSON.parse(oldStored); } catch (e) { return []; }
            }
        }
        return [];
    }, [appSettings, selectedAcademicYear, selectedSemester]);

    const allFilteredSantri = (() => {
                let baseSantri = santri;
                if (userProfile?.role === 'pengajar') {
                    const userWaliClasses = waliKelas.filter(w => w.user_id === userProfile.id).map(w => ({ marhalah: w.marhalah, kelas: w.kelas }));
                    baseSantri = baseSantri.filter(s => userWaliClasses.some(wc => wc.marhalah === s.marhalah && wc.kelas === s.kelas));
                }
                return baseSantri;
            })().filter(s => {
        if (!s.kelas || s.kelas === 'Belum Ada Kelas' || s.kelas === '-') return false;
        if (selectedMarhalah !== 'All' && s.marhalah !== selectedMarhalah) return false;
        if (selectedKelas !== 'All' && s.kelas !== selectedKelas) return false;
        if (searchQuery && !s.nama.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    }).sort((a, b) => {
        const marhalahCompare = (a.marhalah || '').localeCompare(b.marhalah || '');
        if (marhalahCompare !== 0) return marhalahCompare;
        const kelasCompare = (a.kelas || '').localeCompare(b.kelas || '');
        if (kelasCompare !== 0) return kelasCompare;
        return (a.nama || '').localeCompare(b.nama || '');
    });

    // Calculate all data for all filtered santri FIRST so we can sort them globally
    const allRekapData = useMemo(() => {
        if (!selectedAcademicYear) return [];

        const masterPeriods = getEvaluationPeriods(appSettings);
        const validPeriodes = ubPeriods.map(p => p.id);

        return allFilteredSantri.map(s => {
            // Ujian Bulanan
            const blnsRaw = ujianBulanan.filter(ub => ub.santri_id === s.id && validPeriodes.includes(ub.periode) && (ub.semester === selectedSemester || (!ub.semester && selectedSemester === 'Ganjil')));
            const blns = blnsRaw.map(br => {
                const pInfo = ubPeriods.find((p: any) => p.id === br.periode);
                return {
                    ...br,
                    ke: pInfo ? pInfo.ke : '-',
                    bulan: pInfo ? pInfo.bulan : '-'
                }
            }).sort((a,b) => (a.ke === '-' ? 99 : Number(a.ke)) - (b.ke === '-' ? 99 : Number(b.ke)));
            const validBlns = blns.filter(curr => curr.nilai !== null && curr.nilai !== undefined && curr.nilai !== '');
            const sumBln = validBlns.reduce((acc, curr) => acc + Number(curr.nilai || 0), 0);
            const avgBln = validBlns.length > 0 ? (sumBln / validBlns.length) : 0;
            
            // Evaluasi Semester
            const sem = ujianSemester.find(us => us.santri_id === s.id && us.academic_year_id === selectedAcademicYear.id && us.semester === selectedSemester);
            const valSem = sem && sem.nilai_akhir !== null ? sem.nilai_akhir : 0;

            // Silabus Hafalan
            let nilaiSilabus = 0;
            if (autoSilabus) {
                // Get class target for selected semester
                const target = (classTargets || []).find(t => (t.semester === selectedSemester || !t.semester) && t.marhalah === s.marhalah && t.kelas === s.kelas);
                let totalTargetJuz = 0;
                if (target && target.target_hafalan > 0) {
                    totalTargetJuz = target.target_hafalan;
                }
                
                if (totalTargetJuz > 0) {
                    // Find all 'Total Hafalan' progress for this student in the current semester
                    const totalHafalanProgresses = studentProgress.filter(p => p.santri_id === s.id && p.progress_type === 'Total Hafalan');
                    
                    // Sort by the actual Start Date of the period to ensure it's chronologically bullet-proof
                    totalHafalanProgresses.sort((a, b) => {
                        const periodA = masterPeriods.find(mp => mp.id === a.month_key);
                        const periodB = masterPeriods.find(mp => mp.id === b.month_key);
                        
                        const dateA = periodA?.startDate ? new Date(periodA.startDate).getTime() : 0;
                        const dateB = periodB?.startDate ? new Date(periodB.startDate).getTime() : 0;
                        
                        if (dateA !== dateB) return dateB - dateA;
                        return b.month_key.localeCompare(a.month_key);
                    });
                    
                    if (totalHafalanProgresses.length > 0) {
                        const maxHafalanVal = parseFloat(totalHafalanProgresses[0].value) || 0;
                        const calcScore = (maxHafalanVal / totalTargetJuz) * 100;
                        nilaiSilabus = Math.min(100, calcScore); // Cap at 100
                    }
                }
            } else {
                // Manual entry from 'Silabus Hafalan' progress type
                const silabusProgress = studentProgress.find(p => p.santri_id === s.id && p.progress_type === 'Silabus Hafalan' && p.month_key === silabusMonthKey);
                nilaiSilabus = silabusProgress ? parseFloat(silabusProgress.value) : 0;
            }

            // Kehadiran Percentage
            const pctKehadiran = attendancePercentages[s.id] !== undefined ? attendancePercentages[s.id] : (() => {
                const sAtt = attendance.filter(a => {
                    if (a.personId !== s.id || a.peran !== 'Santri') return false;
                    
                    if (semesterDates.startDate && semesterDates.endDate) {
                        if (a.date < semesterDates.startDate || a.date > semesterDates.endDate) {
                            return false;
                        }
                    }
                    return true;
                });
                const totalHadir = sAtt.filter(a => ['hadir', 'terlambat', 'hadir telat'].includes((a.status || '').trim().toLowerCase())).length;
                return sAtt.length > 0 ? (totalHadir / sAtt.length) * 100 : 0;
            })();

            // Raport Tahfidz calculation based on dynamic settings
            const finalScore = 
                (avgBln * (settings.pctBulanan / 100)) + 
                (valSem * (settings.pctSemester / 100)) + 
                (nilaiSilabus * (settings.pctSilabus / 100)) + 
                (pctKehadiran * (settings.pctKehadiran / 100));

            // Addition for RaportDocument using dynamic Predikat Nilai settings
            const predikat = getPredikat(finalScore, globalPredikatNilai);

            let targetHafalan: string | number = '30 Juz';
            const cTarget = (classTargets || []).find(t => (t.semester === selectedSemester || !t.semester) && t.marhalah === s.marhalah && t.kelas === s.kelas);
            if (cTarget && cTarget.target_hafalan) {
                targetHafalan = `${cTarget.target_hafalan} Juz`;
            }

            // Latest Hafalan Details
            const monthProgress = studentProgress.filter(p => p.santri_id === s.id && !p.month_key.startsWith('SEM-'));
            
            const periodSorter = (a: any, b: any) => {
                const periodA = masterPeriods.find(mp => mp.id === a.month_key);
                const periodB = masterPeriods.find(mp => mp.id === b.month_key);
                const dateA = periodA?.startDate ? new Date(periodA.startDate).getTime() : 0;
                const dateB = periodB?.startDate ? new Date(periodB.startDate).getTime() : 0;
                if (dateA !== dateB) return dateB - dateA;
                return b.month_key.localeCompare(a.month_key);
            };

            const sortedHD = monthProgress.filter(p => p.progress_type === 'Hafalan Depan').sort(periodSorter);
            let hafalanDepan = sortedHD.length > 0 ? sortedHD[0].value : '-';
            if (sortedHD.length > 0) {
                const saDepan = monthProgress.find(p => p.progress_type === 'Surat Ayat Depan' && p.month_key === sortedHD[0].month_key)?.value;
                if (saDepan) hafalanDepan += ` (${saDepan})`;
            }

            const sortedHB = monthProgress.filter(p => p.progress_type === 'Hafalan Belakang').sort(periodSorter);
            let hafalanBelakang = sortedHB.length > 0 ? sortedHB[0].value : '-';
            if (sortedHB.length > 0) {
                const saBelakang = monthProgress.find(p => p.progress_type === 'Surat Ayat Belakang' && p.month_key === sortedHB[0].month_key)?.value;
                if (saBelakang) hafalanBelakang += ` (${saBelakang})`;
            }

            const sortedTH = monthProgress.filter(p => p.progress_type === 'Total Hafalan').sort(periodSorter);
            let totalHafalan = sortedTH.length > 0 ? sortedTH[0].value : '-';
            if (totalHafalan !== '-') {
                const tfNum = parseFloat(totalHafalan);
                if (!isNaN(tfNum)) {
                    totalHafalan = Number.isInteger(tfNum) ? tfNum.toString() : tfNum.toFixed(2);
                }
            } else if (hafalanDepan !== '-' && hafalanBelakang !== '-') {
                const dep = parseFloat(hafalanDepan.split(' ')[0] || '0');
                const bel = parseFloat(hafalanBelakang.split(' ')[0] || '0');
                if (!isNaN(dep) && !isNaN(bel)) {
                    const sum = dep + bel;
                    totalHafalan = Number.isInteger(sum) ? sum.toString() : sum.toFixed(2);
                }
            }

            return {
                santri: s,
                blns,
                us: sem,
                avgBln: Number(avgBln.toFixed(2)),
                valSem,
                materiSem: sem?.materi_juz || '-',
                nilaiSilabus: Number(nilaiSilabus.toFixed(2)),
                hafalanDepan,
                hafalanBelakang,
                totalHafalan,
                targetHafalan,
                pctKehadiran: Number(pctKehadiran.toFixed(2)),
                finalScore: Number(finalScore.toFixed(2)),
                predikat
            };
        });
    }, [allFilteredSantri, ujianBulanan, ujianSemester, studentProgress, attendance, attendancePercentages, selectedAcademicYear, selectedSemester, ubPeriods, silabusMonthKey, settings, semesterDates, autoSilabus, classTargets, appSettings]);

    const sortedRekapData = useMemo(() => {
        let sortableData = [...allRekapData];
        if (sortConfig !== null) {
            sortableData.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof typeof a];
                let bValue: any = b[sortConfig.key as keyof typeof b];

                if (sortConfig.key === 'nama') {
                    aValue = a.santri.nama;
                    bValue = b.santri.nama;
                } else if (sortConfig.key === 'kelas') {
                    aValue = a.santri.kelas;
                    bValue = b.santri.kelas;
                } else if (sortConfig.key.startsWith('ub_')) {
                    const ubIndex = parseInt(sortConfig.key.split('_')[1], 10);
                    const periodId = ubPeriods[ubIndex]?.id;
                    const ubA = a.blns.find(b => b.periode === periodId);
                    const ubB = b.blns.find(b => b.periode === periodId);
                    aValue = ubA?.nilai || 0;
                    bValue = ubB?.nilai || 0;
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableData;
    }, [allRekapData, sortConfig, ubPeriods]);

    const totalPages = Math.ceil(sortedRekapData.length / rowsPerPage);
    const rekapData = sortedRekapData.slice(currentPageNum * rowsPerPage, (currentPageNum + 1) * rowsPerPage);

    useEffect(() => {
        setCurrentPageNum(0);
    }, [selectedMarhalah, selectedKelas, searchQuery]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown size={14} className="text-slate-300 ml-1 inline-block" />;
        }
        if (sortConfig.direction === 'asc') {
            return <ChevronUp size={14} className="text-blue-600 ml-1 inline-block" />;
        }
        return <ChevronDown size={14} className="text-blue-600 ml-1 inline-block" />;
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedSantriIds(new Set(allFilteredSantri.map(s => s.id)));
        } else {
            setSelectedSantriIds(new Set());
        }
    };

    const handleCheckboxChange = (id: number) => {
        const next = new Set(selectedSantriIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedSantriIds(next);
    };

    const handlePrint = () => {
        if (selectedSantriIds.size === 0) {
            alert('Pilih setidaknya satu siswa untuk dicetak.');
            return;
        }
        window.print();
    };

    const handleExport = () => {
        const dataToExport = sortedRekapData.map((d, index) => {
            const row: any = {
                'No': index + 1,
                'ID': d.santri.id,
                'Nama': d.santri.nama,
                'Marhalah': d.santri.marhalah,
                'Kelas': d.santri.kelas,
            };

            ubPeriods.forEach((p, i) => {
                const ub = d.blns.find(b => b.periode === p.id);
                row[`Ujian Bulanan ${i + 1} (${p.bulan})`] = ub?.nilai || '-';
            });

            row['Rata-rata nilai ujian bulanan'] = d.avgBln;
            row['Nilai ujian semester'] = d.valSem;
            row['Nilai silabus (pencapaian target hafalan)'] = d.nilaiSilabus;
            row['Kehadiran (%)'] = d.pctKehadiran;
            row['Nilai Akhir'] = d.finalScore;

            return row;
        });
        exportToExcel(dataToExport, `Rekap_Nilai_${selectedSemester}`);
    };

    const handleDownloadTemplate = () => {
        const dataToExport = sortedRekapData.map((d, index) => {
            const row: any = {
                'No': index + 1,
                'ID': d.santri.id,
                'Nama': d.santri.nama,
                'Marhalah': d.santri.marhalah,
                'Kelas': d.santri.kelas,
            };

            ubPeriods.forEach((p, i) => {
                const ub = d.blns.find(b => b.periode === p.id);
                row[`Ujian Bulanan ${i + 1} (${p.bulan})`] = ub?.nilai || '-';
            });

            row['Rata-rata nilai ujian bulanan'] = d.avgBln;
            row['Nilai ujian semester'] = d.valSem;
            row['Nilai silabus (pencapaian target hafalan)'] = ''; // Empty for template
            row['Kehadiran (%)'] = d.pctKehadiran;
            row['Nilai Akhir'] = d.finalScore;

            return row;
        });
        exportToExcel(dataToExport, `Template_Import_Nilai_Silabus_${selectedSemester}`);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (autoSilabus) {
            alert('Perhitungan otomatis Nilai Silabus sedang aktif. Menonaktifkan fitur import nilai silabus.');
            return;
        }
        const file = e.target.files?.[0];
        if (!file) return;

        setIsSaving(true);
        try {
            const data = await parseSpreadsheet(file);
            if (!data || data.length === 0) {
                alert('Data CSV/Excel kosong atau format tidak sesuai.');
                setIsSaving(false);
                return;
            }

            let updatedCount = 0;
            const recordsToSave: any[] = [];

            for (const row of data) {
                const importedId = row['id'];
                const nilaiSilabusRaw = row['nilai silabus (pencapaian target hafalan)'] || row['nilai silabus (pencapaian target)'] || row['nilai silabus'];

                if (importedId && nilaiSilabusRaw !== undefined) {
                    const sId = parseInt(importedId as string, 10);
                    const nilai = parseFloat(nilaiSilabusRaw);

                    if (!isNaN(sId) && !isNaN(nilai) && santri.some(s => s.id === sId)) {
                        recordsToSave.push({
                            organization_id: "WILL_BE_FILLED", // Add filled by the hook
                            santri_id: sId,
                            month_key: silabusMonthKey,
                            progress_type: 'Silabus Hafalan',
                            value: nilai.toString()
                        });
                        updatedCount++;
                    }
                }
            }
            
            if (recordsToSave.length > 0) {
                await addStudentProgressBatch(recordsToSave);
                alert(`Berhasil mengimpor nilai silabus hafalan untuk ${updatedCount} santri.`);
            } else {
                alert('Tidak ada data valid yang ditemukan untuk diimport.');
            }
            
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Error importing:', error);
            alert('Gagal mengimpor file.');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <div className="p-6 text-slate-500">Memuat data...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-sans min-h-screen max-w-[1400px] mx-auto pb-12 pt-2 print:p-0 print:m-0 print:space-y-0 print:bg-white w-full">
            <div className="print:hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2">Rekap Nilai</h1>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Rekapitulasi seluruh nilai Ujian, Silabus, dan Kehadiran</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button onClick={handleExport} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center hover:bg-blue-700 shadow-sm transition-all focus:ring-4 focus:ring-blue-500/20">
                        <Download size={16} className="mr-2" strokeWidth={2.5}/> Export
                    </button>
                    {!autoSilabus && (
                        <div className="relative group z-20">
                            <button className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center hover:bg-blue-700 shadow-sm transition-all focus:ring-4 focus:ring-blue-500/20">
                                <Upload size={16} className="mr-2" strokeWidth={2.5}/> Import
                            </button>
                            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-[0_12px_40px_-10px_rgba(0,0,0,0.15)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all overflow-hidden z-50">
                                <button onClick={() => fileInputRef.current?.click()} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center transition-colors">
                                    <Upload size={16} className="mr-3 text-blue-600" /> Upload File Excel
                                </button>
                                <button onClick={handleDownloadTemplate} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center border-t border-slate-100 transition-colors">
                                    <Download size={16} className="mr-3 text-emerald-600" /> Download Template
                                </button>
                            </div>
                        </div>
                    )}
                    <ActionDropdown label={`Cetak Raport (${selectedSantriIds.size})`} icon={<Printer size={16} strokeWidth={2.5} />} variant="secondary">
                        <button onClick={() => setShowSignatureModal(true)} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center border-b border-slate-100">
                            <PenTool size={16} className="mr-2 text-indigo-600" /> E-Signature
                        </button>
                        <button onClick={() => setShowPreview(true)} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center">
                            <Eye size={16} className="mr-2" /> Preview
                        </button>
                        <button onClick={handlePrint} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center">
                            <Printer size={16} className="mr-2" /> Cetak
                        </button>
                    </ActionDropdown>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" />
                </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-wrap gap-5 items-end z-10 relative">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Marhalah</label>
                    <select
                        value={selectedMarhalah}
                        onChange={(e) => { setSelectedMarhalah(e.target.value); setSelectedKelas('All'); }}
                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        <option value="All">Semua Marhalah</option>
                        {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Kelas</label>
                    <select
                        value={selectedKelas}
                        onChange={(e) => setSelectedKelas(e.target.value)}
                        disabled={selectedMarhalah === 'All'}
                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <option value="All">Semua Kelas</option>
                        {masterKelasRelasi?.filter((k: any) => selectedMarhalah === 'All' ? true : k.marhalah_id === masterMarhalahs?.find((m: any) => m.nama === selectedMarhalah)?.id).map((k: any) => (
                            <option key={k.id} value={k.nama_kelas || k.id}>{k.nama_kelas}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Pencarian</label>
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Cari nama..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white"
                        />
                    </div>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-extrabold text-slate-800 flex items-center">
                        Tabel Rekap Nilai {selectedSemester}
                        <span className="ml-3 bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-[11px] font-bold">
                            {allFilteredSantri.length} Santri
                        </span>
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold">
                            <tr>
                                <th className="px-4 py-4 border-b border-slate-200/80 w-12 text-center align-middle" rowSpan={2}>
                                    <input 
                                        type="checkbox" 
                                        checked={selectedSantriIds.size > 0 && selectedSantriIds.size === allFilteredSantri.length} 
                                        onChange={handleSelectAll} 
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                                    />
                                </th>
                                <th className="px-4 py-4 border-b border-slate-200/80 w-12 text-center align-middle" rowSpan={2}>No</th>
                                <th className="px-6 py-4 border-b border-slate-200/80 min-w-[200px] align-middle cursor-pointer hover:bg-slate-100 transition-colors" rowSpan={2} onClick={() => requestSort('nama')}>
                                    <div className="flex items-center">Nama Santri {getSortIcon('nama')}</div>
                                </th>
                                <th className="px-6 py-4 border-b border-slate-200/80 align-middle cursor-pointer hover:bg-slate-100 transition-colors" rowSpan={2} onClick={() => requestSort('kelas')}>
                                    <div className="flex items-center">Kelas {getSortIcon('kelas')}</div>
                                </th>
                                {ubPeriods.length > 0 && (
                                    <th className="px-4 py-3 border-b border-r border-l border-slate-200/80 text-center align-middle bg-slate-100/50" colSpan={ubPeriods.length}>
                                        Nilai Ujian Bulanan
                                    </th>
                                )}
                                <th className="px-4 py-4 border-b border-slate-200/80 text-center align-middle cursor-pointer hover:bg-slate-100 transition-colors min-w-[140px]" rowSpan={2} onClick={() => requestSort('avgBln')}>
                                    <div className="flex items-center justify-center text-xs">Rata-rata Ujian<br/>Bulanan {getSortIcon('avgBln')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-200/80 text-center align-middle cursor-pointer hover:bg-slate-100 transition-colors min-w-[140px]" rowSpan={2} onClick={() => requestSort('valSem')}>
                                    <div className="flex items-center justify-center text-xs">Nilai Ujian<br/>Semester {getSortIcon('valSem')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-200/80 text-center align-middle cursor-pointer hover:bg-slate-100 transition-colors min-w-[140px]" rowSpan={2} onClick={() => requestSort('nilaiSilabus')}>
                                    <div className="flex items-center justify-center text-xs">Nilai Silabus<br/>(Target Hafalan) {getSortIcon('nilaiSilabus')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-200/80 text-center align-middle cursor-pointer hover:bg-slate-100 transition-colors" rowSpan={2} onClick={() => requestSort('pctKehadiran')}>
                                    <div className="flex items-center justify-center">Kehadiran {getSortIcon('pctKehadiran')}</div>
                                </th>
                                <th className="px-6 py-4 border-b border-slate-200/80 text-center align-middle cursor-pointer hover:bg-slate-100 transition-colors" rowSpan={2} onClick={() => requestSort('finalScore')}>
                                    <div className="flex items-center justify-center">Nilai Akhir {getSortIcon('finalScore')}</div>
                                </th>
                            </tr>
                            {ubPeriods.length > 0 && (
                                <tr>
                                    {ubPeriods.map((p, i) => (
                                        <th key={p.id} className="px-4 py-3 border-b border-slate-200/80 text-center align-middle whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort(`ub_${i}`)}>
                                            <div className="flex items-center justify-center font-bold text-slate-600">{p.bulan} {getSortIcon(`ub_${i}`)}</div>
                                        </th>
                                    ))}
                                </tr>
                            )}
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {rekapData.length > 0 ? (
                                rekapData.map((d, idx) => (
                                    <tr key={d.santri.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedSantriIds.has(d.santri.id)} 
                                                onChange={() => handleCheckboxChange(d.santri.id)} 
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                                            />
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-slate-400">{currentPageNum * rowsPerPage + idx + 1}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{d.santri.nama}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide bg-slate-100 text-slate-600 whitespace-nowrap">
                                                {d.santri.kelas}
                                            </span>
                                        </td>
                                        
                                        {ubPeriods.map((p) => {
                                            const ub = d.blns.find(b => b.periode === p.id);
                                            return <td key={p.id} className="px-4 py-4 text-center">{ub?.nilai !== undefined && ub?.nilai !== null ? ub.nilai : '-'}</td>;
                                        })}
                                        
                                        <td className="px-4 py-4 text-center font-bold text-slate-700">{d.avgBln}</td>
                                        <td className="px-4 py-4 text-center font-bold text-slate-700">{d.valSem !== undefined && d.valSem > 0 ? d.valSem : '-'}</td>
                                        <td className="px-4 py-4 text-center text-slate-800 font-bold">{d.nilaiSilabus !== undefined ? d.nilaiSilabus : '0'}</td>
                                        <td className="px-4 py-4 text-center font-bold">{d.pctKehadiran > 0 ? `${d.pctKehadiran}%` : '-'}</td>
                                        
                                        <td className="px-6 py-4 text-center">
                                            <span className="font-bold text-slate-700">{d.finalScore > 0 ? d.finalScore : '-'}</span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={10 + ubPeriods.length} className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mb-4">
                                                <Search size={24} />
                                            </div>
                                            <p className="font-semibold text-slate-600">Tidak ada santri ditemukan</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {allFilteredSantri.length > 0 && (
                    <div className="flex justify-between items-center p-5 border-t border-slate-100 bg-slate-50/50 text-[13px]">
                        <span className="text-slate-500 font-medium">
                            Menampilkan <span className="font-bold text-slate-700">{currentPageNum * rowsPerPage + 1}</span> - <span className="font-bold text-slate-700">{Math.min((currentPageNum + 1) * rowsPerPage, allFilteredSantri.length)}</span> dari <span className="font-bold text-slate-700">{allFilteredSantri.length}</span> santri
                        </span>
                        <div className="flex gap-2">
                            <button 
                                disabled={currentPageNum === 0} 
                                onClick={() => setCurrentPageNum(prev => prev - 1)}
                                className="px-4 py-2 border border-slate-200/80 rounded-lg font-bold disabled:opacity-50 hover:bg-slate-50 hover:border-slate-300 transition-all bg-white text-slate-600 focus:ring-4 focus:ring-slate-100"
                            >Sebelumnya</button>
                            <button 
                                disabled={currentPageNum >= totalPages - 1} 
                                onClick={() => setCurrentPageNum(prev => prev + 1)}
                                className="px-4 py-2 border border-slate-200/80 rounded-lg font-bold disabled:opacity-50 hover:bg-slate-50 hover:border-slate-300 transition-all bg-white text-slate-600 focus:ring-4 focus:ring-slate-100"
                            >Selanjutnya</button>
                        </div>
                    </div>
                )}
            </div>
            
            </div> {/* End print:hidden */}

            {/* Print View (Only for Printing) */}
            <div className="hidden print:block print:w-full print:static print:z-auto print:bg-white print:p-0 print:overflow-visible">
                <div className="print:block print:w-full">
                    {rekapData.filter(d => selectedSantriIds.has(d.santri.id)).map((d, index, arr) => (
                        <div 
                            key={d.santri.id} 
                            className="raport-print-wrapper shadow-none print:shadow-none"
                            style={{
                                pageBreakAfter: index === arr.length - 1 ? 'auto' : 'always',
                                breakAfter: index === arr.length - 1 ? 'auto' : 'page',
                                pageBreakInside: 'avoid',
                                breakInside: 'avoid'
                            }}
                        >
                            <RaportDocument 
                                 d={d} 
                                 selectedSemester={selectedSemester} 
                                 selectedAcademicYear={selectedAcademicYear} 
                                 orgName={orgName} 
                                 orgLogo={orgLogo}
                                 settings={settings}
                                 signatureImage={signatureImage}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Preview Modal (Portal) */}
            {showPreview && createPortal(
                <div className="fixed inset-0 z-[999999] bg-slate-800/90 overflow-y-auto p-4 sm:p-8 flex flex-col items-center print:hidden">
                    <div className="fixed top-4 right-4 sm:top-8 sm:right-8 z-[1000000] flex gap-2">
                        <button onClick={() => {
                            setShowPreview(false);
                            setTimeout(handlePrint, 100);
                        }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-emerald-700 flex items-center"><Printer size={16} className="mr-2"/> Cetak</button>
                        <button onClick={() => setShowPreview(false)} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-red-600 flex items-center">Tutup Preview</button>
                    </div>
                    <div className="flex flex-col gap-8 w-fit mt-16 sm:mt-0 pb-16 mx-auto">
                        {rekapData.filter(d => selectedSantriIds.has(d.santri.id)).map((d, index) => (
                            <div key={d.santri.id} className="shadow-2xl mx-auto overflow-hidden bg-white">
                                <RaportDocument 
                                    d={d} 
                                    selectedSemester={selectedSemester} 
                                    selectedAcademicYear={selectedAcademicYear} 
                                    orgName={orgName} 
                                    orgLogo={orgLogo}
                                    settings={settings}
                                 signatureImage={signatureImage}
                            />
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}
            

            {showSignatureModal && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h3 className="font-bold text-slate-800 flex items-center">
                                <PenTool size={18} className="mr-2 text-indigo-600" /> E-Signature
                            </h3>
                            <button onClick={() => setShowSignatureModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-5">
                            <p className="text-sm text-slate-600">Unggah file tanda tangan berformat PNG (latar belakang transparan) untuk disematkan secara otomatis saat mencetak raport.</p>
                            
                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50 relative group hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors cursor-pointer">
                                <input 
                                    type="file" 
                                    accept=".png" 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (ev) => {
                                                const base64 = ev.target?.result as string;
                                                setSignatureImage(base64);
                                                localStorage.setItem('e_signature_image', base64);
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                />
                                {signatureImage ? (
                                    <div className="relative w-full h-24 flex items-center justify-center bg-white border border-slate-200 rounded-lg shadow-sm p-2">
                                        <img src={signatureImage} alt="Preview" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto shadow-sm mb-3 group-hover:border-indigo-300 group-hover:text-indigo-600 transition-colors">
                                            <Upload size={20} className="text-slate-400 group-hover:text-indigo-500" />
                                        </div>
                                        <p className="font-semibold text-slate-700 text-sm">Klik atau Seret file PNG ke sini</p>
                                    </div>
                                )}
                            </div>

                            {signatureImage && (
                                <button onClick={() => {
                                    setSignatureImage(null);
                                    localStorage.removeItem('e_signature_image');
                                }} className="text-red-500 text-sm font-semibold hover:text-red-600 hover:bg-red-50 py-2 px-3 rounded-lg self-center transition-colors">
                                    Hapus Tanda Tangan
                                </button>
                            )}

                        </div>
                        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => setShowSignatureModal(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors text-sm">Tutup</button>
                            <button onClick={() => setShowSignatureModal(false)} className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all text-sm">Simpan & Terapkan</button>
                        </div>
                    </div>
                </div>
                , document.body)
            }
            {isSaving && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[200] flex items-center justify-center">
                    <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                        <p className="font-bold text-slate-800">Menyimpan Data...</p>
                        <p className="text-[13px] text-slate-500 mt-1">Mohon tunggu sebentar</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RekapNilaiPage;
