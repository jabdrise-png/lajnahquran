import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom'; 
import * as XLSX from 'xlsx';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import { Search, Save, Download, Upload, Filter, Edit2, Play, Award, X, PenTool, AlertTriangle, BookOpen, CheckCircle, FileSpreadsheet, History } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { exportToExcel, parseSpreadsheet, getPredikat } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { NotificationStore } from '../../lib/NotificationStore';
import { StatusBadge } from '../../components/ui/SaaSPrimitives';
import Modal from '../../components/Modal';

const parseJuzList = (materi: string): number[] => {
    const result = new Set<number>();
    if (!materi) return [];
    
    const parts = materi.split(',').map(p => p.trim());
    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                const s = Math.min(start, end);
                const e = Math.max(start, end);
                for (let i = Math.max(1, s); i <= Math.min(100, e); i++) {
                    result.add(i);
                }
            }
        } else {
            const num = Number(part);
            if (!isNaN(num) && num >= 1 && num <= 100) result.add(num);
        }
    }
    return Array.from(result).sort((a, b) => a - b);
};

const calculateJuzScore = (shogir: number = 0, kabir: number = 0, settings: any): number => {
    const nilaiAwal = Number(settings.nilaiAwalJuz) || 100;
    const pengurangShogir = Number(settings.pengurangShogir) || 1.25;
    const pengurangKabir = Number(settings.pengurangKabir) || 5;
    const minNilai = Number(settings.minNilaiJuz) || 50;

    const score = nilaiAwal - (shogir * pengurangShogir) - (kabir * pengurangKabir);
    return Math.max(minNilai, score);
};

const UjianSemesterPage: React.FC = () => {
    const { santri, ujianSemester, saveUjianSemester, selectedAcademicYear, appSettings, loading, masterKelas, globalMarhalahs, userProfile, waliKelas, globalPredikatNilai , masterMarhalahs, masterKelasRelasi, getOrgId} = useSupabaseData();
    
    const selectedSemester = selectedAcademicYear?.active_semester || 'Ganjil';
    const [selectedMarhalah, setSelectedMarhalah] = useState('All');
    const [selectedKelas, setSelectedKelas] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'materi-nilai' | 'remedial' | 'catatan'>('materi-nilai');
    
    const [localData, setLocalData] = useState<Record<number, any>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingModal, setIsSavingModal] = useState(false);
    const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
    
    const [editingSantri, setEditingSantri] = useState<number | null>(null);
    const [isRemedialAttempt, setIsRemedialAttempt] = useState(false);
    const [attemptNote, setAttemptNote] = useState('');
    const [examAttempts, setExamAttempts] = useState<any[]>([]);
    const [historySantriId, setHistorySantriId] = useState<number | null>(null);

    const [modalData, setModalData] = useState<{
        shogir: Record<number, number>;
        kabir: Record<number, number>;
        isCustom: Record<number, boolean>;
        customNilai: Record<number, number>;
    }>({ shogir: {}, kabir: {}, isCustom: {}, customNilai: {} });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchExamAttempts = async () => {
        if (!selectedAcademicYear?.id) return;
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { data } = await (supabase as any)
                .from('exam_attempts')
                .select('*')
                .eq('organization_id', orgId)
                .eq('academic_year_id', selectedAcademicYear.id)
                .eq('semester_name', selectedSemester)
                .order('attempt_no', { ascending: true });
            if (data) setExamAttempts(data);
        } catch {
            // Abaikan bila tabel exam_attempts belum dimigrasikan
        }
    };

    useEffect(() => {
        fetchExamAttempts();
    }, [selectedAcademicYear?.id, selectedSemester]);

    const settingsObj = useMemo(() => ({
        nilaiAwalJuz: appSettings.find(s => s.key === 'NILAI_AWAL_JUZ')?.value || '100',
        pengurangShogir: appSettings.find(s => s.key === 'PENGURANG_KHOTO_SHOGIR')?.value || '1.25',
        pengurangKabir: appSettings.find(s => s.key === 'PENGURANG_KHOTO_KABIR')?.value || '5',
        minNilaiJuz: appSettings.find(s => s.key === 'MIN_NILAI_JUZ')?.value || '50'
    }), [appSettings]);

    useEffect(() => {
        if (!selectedAcademicYear) return;
        
        const dataMap: Record<number, any> = {};
        santri.forEach(s => {
            const existingUjian = ujianSemester.find((u: any) => 
                u.santri_id === s.id && 
                u.semester === selectedSemester &&
                u.academic_year_id === selectedAcademicYear.id
            );

            if (existingUjian) {
                dataMap[s.id] = { 
                    materi_juz: existingUjian.materi_juz || '', 
                    khoto_shogir: existingUjian.khoto_shogir || {},
                    is_custom_nilai: existingUjian.is_custom_nilai || {},
                    custom_nilai: existingUjian.custom_nilai || {},
                    khoto_kabir: existingUjian.khoto_kabir || {},
                    nilai_akhir: existingUjian.nilai_akhir,
                    catatan: existingUjian.catatan || ''
                };
            } else {
                dataMap[s.id] = { 
                    materi_juz: '', 
                    khoto_shogir: {},
                    khoto_kabir: {},
                    nilai_akhir: null,
                    catatan: ''
                };
            }
        });
        setLocalData(dataMap);
    }, [santri, ujianSemester, selectedSemester, selectedAcademicYear]);

    const handleCatatanChange = (santriId: number, value: string) => {
        setLocalData(prev => ({
            ...prev,
            [santriId]: {
                ...prev[santriId],
                catatan: value
            }
        }));
    };
    
    const handleMateriChange = (santriId: number, value: string) => {
        setLocalData(prev => ({
            ...prev,
            [santriId]: { ...prev[santriId], materi_juz: value }
        }));
    };

    const handleOpenInputNilai = (santriId: number, remedialMode: boolean = false) => {
        const data = localData[santriId];
        if (!data) return;
        
        const juzList = parseJuzList(data.materi_juz);
        if (juzList.length === 0) {
            NotificationStore.addNotification('Silakan isi Materi Ujian (Juz) terlebih dahulu (misal: 1-5 atau 30).', 'error');
            return;
        }

        setModalData({
            shogir: data.khoto_shogir || {},
            kabir: data.khoto_kabir || {},
            isCustom: data.is_custom_nilai || {},
            customNilai: data.custom_nilai || {}
        });
        setIsRemedialAttempt(remedialMode);
        setAttemptNote('');
        setEditingSantri(santriId);
    };

    const handleCustomCheckbox = (juz: number, checked: boolean) => {
        setModalData(prev => ({
            ...prev,
            isCustom: { ...prev.isCustom, [juz]: checked }
        }));
    };

    const handleModalChange = (juz: number, type: 'shogir' | 'kabir' | 'customNilai', value: string) => {
        if (type === 'customNilai') {
            setModalData(prev => ({
                ...prev,
                customNilai: { ...prev.customNilai, [juz]: value as any }
            }));
            return;
        }
        const numValue = value === '' ? 0 : parseInt(value, 10);
        if (isNaN(numValue) || numValue < 0) return;
        setModalData(prev => ({
            ...prev,
            [type]: { ...prev[type], [juz]: numValue }
        }));
    };

    const handleSaveModal = async () => {
        if (!editingSantri || !selectedAcademicYear) return;

        setIsSavingModal(true);
        const data = localData[editingSantri];
        const juzList = parseJuzList(data.materi_juz);
        
        let totalScore = 0;
        let count = 0;
        
        juzList.forEach(juz => {
            const isC = modalData.isCustom[juz];
            const cNilai = parseFloat(modalData.customNilai[juz] as any) || 0;
            const shogir = modalData.shogir[juz] || 0;
            const kabir = modalData.kabir[juz] || 0;
            
            if (isC) {
                totalScore += cNilai;
            } else {
                totalScore += calculateJuzScore(shogir, kabir, settingsObj);
            }
            count++;
        });

        const nilaiAkhir = count > 0 ? Number((totalScore / count).toFixed(2)) : null;

        const updatedData = { 
            ...data, 
            khoto_shogir: modalData.shogir,
            khoto_kabir: modalData.kabir,
            is_custom_nilai: modalData.isCustom,
            custom_nilai: Object.fromEntries(Object.entries(modalData.customNilai).map(([k, v]) => [k, parseFloat(v as any) || 0])),
            nilai_akhir: nilaiAkhir
        };

        setLocalData(prev => ({
            ...prev,
            [editingSantri]: updatedData
        }));

        try {
            const orgId = await getOrgId();
            let rpcSucceeded = false;

            if (orgId) {
                try {
                    const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc('rpc_record_exam_attempt', {
                        p_org_id: orgId,
                        p_academic_year_id: selectedAcademicYear.id,
                        p_semester: selectedSemester,
                        p_exam_type: 'semester',
                        p_santri_id: editingSantri,
                        p_materi_juz: updatedData.materi_juz,
                        p_raw_score: updatedData.nilai_akhir,
                        p_final_score: updatedData.nilai_akhir,
                        p_predikat: getPredikat(updatedData.nilai_akhir, globalPredikatNilai || []),
                        p_detail_json: {
                            khoto_shogir: updatedData.khoto_shogir,
                            khoto_kabir: updatedData.khoto_kabir,
                            is_custom_nilai: updatedData.is_custom_nilai,
                            custom_nilai: updatedData.custom_nilai
                        },
                        p_is_remedial: isRemedialAttempt,
                        p_notes: attemptNote.trim() || (isRemedialAttempt ? 'Remedial Ujian Semester' : 'Ujian Semester')
                    });

                    if (!rpcErr && rpcRes?.success) {
                        rpcSucceeded = true;
                    }
                } catch {
                    rpcSucceeded = false;
                }
            }

            if (!rpcSucceeded) {
                await saveUjianSemester([{
                    santri_id: editingSantri,
                    academic_year_id: selectedAcademicYear.id,
                    semester: selectedSemester,
                    materi_juz: updatedData.materi_juz,
                    khoto_shogir: updatedData.khoto_shogir,
                    khoto_kabir: updatedData.khoto_kabir,
                    is_custom_nilai: updatedData.is_custom_nilai,
                    custom_nilai: updatedData.custom_nilai,
                    nilai_akhir: updatedData.nilai_akhir
                }]);
            }

            await fetchExamAttempts();

            NotificationStore.addNotification(
                isRemedialAttempt
                    ? 'Nilai Remedial berhasil disimpan & Attempt sebelumnya tetap tercatat di histori.'
                    : 'Nilai Ujian Semester berhasil disimpan.',
                'success'
            );
        } catch (error) {
            console.error(error);
            NotificationStore.addNotification('Gagal menyimpan nilai ke database', 'error');
        }

        setIsSavingModal(false);
        setEditingSantri(null);
    };

    const handleSaveAll = async () => {
        if (!selectedAcademicYear) {
            NotificationStore.addNotification('Tahun ajaran belum dipilih.', 'error');
            return;
        }
        
        setIsSaving(true);
        try {
            const recordsToSave = [];
            for (const s of allFilteredSantri) {
                const data = localData[s.id];
                if (data && (data.materi_juz || data.nilai_akhir !== null || data.catatan)) {
                    recordsToSave.push({
                        santri_id: s.id,
                        academic_year_id: selectedAcademicYear.id,
                        semester: selectedSemester,
                        materi_juz: data.materi_juz,
                        khoto_shogir: data.khoto_shogir,
                        khoto_kabir: data.khoto_kabir,
                        is_custom_nilai: data.is_custom_nilai,
                        custom_nilai: data.custom_nilai,
                        nilai_akhir: data.nilai_akhir,
                        catatan: data.catatan || ''
                    });
                }
            }
            if (recordsToSave.length > 0) {
                await saveUjianSemester(recordsToSave);
                NotificationStore.addNotification('Data ujian semester berhasil disimpan!', 'success');
            } else {
                NotificationStore.addNotification('Tidak ada data untuk disimpan.', 'info');
            }
        } catch (e: any) {
            NotificationStore.addNotification('Gagal menyimpan: ' + e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = () => {
        const dataToExport = allFilteredSantri.map(s => {
            const d = localData[s.id] || { materi_juz: '', nilai_akhir: '' };
            return {
                'ID': s.id,
                'Nama': s.nama,
                'Marhalah': s.marhalah,
                'Kelas': s.kelas,
                'Semester': selectedSemester,
                'Materi Juz': d.materi_juz,
                'Nilai Akhir': d.nilai_akhir !== null ? d.nilai_akhir : '',
                'Predikat': getPredikat(d.nilai_akhir, globalPredikatNilai || []),
                'Catatan': d.catatan || ''
            };
        });
        exportToExcel(dataToExport, `Ujian_Semester_${selectedSemester}`);
    };

    const handleDownloadTemplate = () => {
        const dataToExport = allFilteredSantri.map(s => {
            return {
                'id': s.id,
                'nama': s.nama,
                'materi juz': '',
                'nilai akhir': '',
                'catatan': ''
            };
        });
        exportToExcel(dataToExport, `Template_Ujian_Semester_${selectedSemester}`);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = await parseSpreadsheet(file);
            if (!data || data.length === 0) {
                NotificationStore.addNotification('Data CSV/Excel kosong atau format tidak sesuai.', 'error');
                return;
            }

            const newLocalData = { ...localData };
            let updatedCount = 0;

            for (const row of data) {
                const importedId = row['id'];
                const importedNama = row['nama'];

                if (importedId && importedNama) {
                    const sId = parseInt(importedId as string, 10);
                    if (!isNaN(sId) && santri.some(s => s.id === sId)) {
                        newLocalData[sId] = {
                            ...newLocalData[sId],
                            materi_juz: (row['materi juz'] !== undefined && row['materi juz'] !== '') ? row['materi juz'] : (newLocalData[sId]?.materi_juz || ''),
                            nilai_akhir: row['nilai akhir'] !== undefined && row['nilai akhir'] !== '' ? Number(row['nilai akhir']) : newLocalData[sId]?.nilai_akhir,
                            khoto_shogir: newLocalData[sId]?.khoto_shogir || {},
                            khoto_kabir: newLocalData[sId]?.khoto_kabir || {},
                            is_custom_nilai: newLocalData[sId]?.is_custom_nilai || {},
                            custom_nilai: newLocalData[sId]?.custom_nilai || {},
                            catatan: (row['catatan'] !== undefined && row['catatan'] !== '') ? row['catatan'] : (newLocalData[sId]?.catatan || ''),
                        };
                        updatedCount++;
                    }
                }
            }
            
            setLocalData(newLocalData);
            NotificationStore.addNotification(`Berhasil mengimpor data untuk ${updatedCount} santri.`, 'success');
            
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Error importing:', error);
            NotificationStore.addNotification('Gagal mengimpor file.', 'error');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const [currentPageNum, setCurrentPageNum] = useState(0);
    const rowsPerPage = 50;

    const allFilteredSantri = santri.filter(s => {
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

    const totalPages = Math.ceil(allFilteredSantri.length / rowsPerPage);
    const filteredSantri = allFilteredSantri.slice(currentPageNum * rowsPerPage, (currentPageNum + 1) * rowsPerPage);

    const kkmThreshold = useMemo(() => {
        if (!globalPredikatNilai || globalPredikatNilai.length === 0) return 60;
        const sorted = [...globalPredikatNilai].sort((a, b) => b.minScore - a.minScore);
        const rasibIdx = sorted.findIndex(p => p.label.toLowerCase().includes('rasib') || p.label.toLowerCase().includes('kurang'));
        if (rasibIdx !== -1) {
            if (rasibIdx > 0) {
                return sorted[rasibIdx - 1].minScore;
            }
            const passingTiers = sorted.filter(p => !p.label.toLowerCase().includes('rasib') && !p.label.toLowerCase().includes('kurang'));
            if (passingTiers.length > 0) {
                return passingTiers[passingTiers.length - 1].minScore;
            }
        }
        const positiveTiers = sorted.filter(p => p.minScore > 0);
        if (positiveTiers.length > 0) {
            return positiveTiers[positiveTiers.length - 1].minScore;
        }
        return 60;
    }, [globalPredikatNilai]);

    const remedialData = useMemo(() => {
        const list: {
            santri: any;
            rasibJuzList: { juz: string; score: number }[];
        }[] = [];

        allFilteredSantri.forEach(s => {
            const data = localData[s.id];
            if (!data || data.nilai_akhir === null || data.nilai_akhir === undefined) {
                return;
            }

            const juzList = parseJuzList(data.materi_juz || '');
            const rasibJuz: { juz: string; score: number }[] = [];

            if (juzList.length > 0) {
                juzList.forEach(juz => {
                    let juzScore: number;
                    if (data.is_custom_nilai?.[juz]) {
                        juzScore = parseFloat(data.custom_nilai?.[juz] as any) || 0;
                    } else if (
                        (data.khoto_shogir && data.khoto_shogir[juz] !== undefined) ||
                        (data.khoto_kabir && data.khoto_kabir[juz] !== undefined)
                    ) {
                        juzScore = calculateJuzScore(data.khoto_shogir?.[juz] || 0, data.khoto_kabir?.[juz] || 0, settingsObj);
                    } else {
                        juzScore = Number(data.nilai_akhir);
                    }

                    if (juzScore < kkmThreshold) {
                        rasibJuz.push({
                            juz: `Juz ${juz}`,
                            score: Number(juzScore.toFixed(2))
                        });
                    }
                });
            } else if (Number(data.nilai_akhir) < kkmThreshold) {
                rasibJuz.push({
                    juz: data.materi_juz ? `Juz ${data.materi_juz}` : 'Materi Ujian',
                    score: Number(Number(data.nilai_akhir).toFixed(2))
                });
            }

            if (rasibJuz.length > 0) {
                list.push({
                    santri: s,
                    rasibJuzList: rasibJuz
                });
            }
        });

        return list;
    }, [allFilteredSantri, localData, kkmThreshold, settingsObj]);

    const handleExportRemedial = () => {
        if (remedialData.length === 0) {
            NotificationStore.addNotification('Tidak ada data santri yang perlu remedial.', 'info');
            return;
        }

        const headers = ['No', 'ID Santri', 'Nama Santri', 'Kelas', 'Juz yang Rasib', 'Nilai', 'Jumlah Juz Rasib'];
        const data: any[][] = [headers];
        const merges: XLSX.Range[] = [];

        let currentRow = 1; // row index 0 is header

        remedialData.forEach((item, idx) => {
            const n = item.rasibJuzList.length;
            const startRow = currentRow;
            const endRow = currentRow + n - 1;

            item.rasibJuzList.forEach((r, jIdx) => {
                if (jIdx === 0) {
                    data.push([
                        idx + 1,
                        item.santri.nis || item.santri.id,
                        item.santri.nama,
                        item.santri.kelas,
                        r.juz,
                        r.score,
                        `${n} Juz`
                    ]);
                } else {
                    data.push([
                        '',
                        '',
                        '',
                        '',
                        r.juz,
                        r.score,
                        ''
                    ]);
                }
            });

            if (n > 1) {
                // Column 0: No
                merges.push({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 0 } });
                // Column 1: ID Santri
                merges.push({ s: { r: startRow, c: 1 }, e: { r: endRow, c: 1 } });
                // Column 2: Nama Santri
                merges.push({ s: { r: startRow, c: 2 }, e: { r: endRow, c: 2 } });
                // Column 3: Kelas
                merges.push({ s: { r: startRow, c: 3 }, e: { r: endRow, c: 3 } });
                // Column 6: Jumlah Juz Rasib
                merges.push({ s: { r: startRow, c: 6 }, e: { r: endRow, c: 6 } });
            }

            currentRow += n;
        });

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        worksheet['!merges'] = merges;
        worksheet['!cols'] = [
            { wch: 6 },  // No
            { wch: 14 }, // ID Santri
            { wch: 25 }, // Nama Santri
            { wch: 12 }, // Kelas
            { wch: 18 }, // Juz yang Rasib
            { wch: 10 }, // Nilai
            { wch: 18 }  // Jumlah Juz Rasib
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar Remedial');
        XLSX.writeFile(workbook, `Daftar_Remedial_Semester_${selectedSemester}.xlsx`);
    };

    useEffect(() => {
        setCurrentPageNum(0);
    }, [selectedMarhalah, selectedKelas, searchQuery]);

    if (loading) {
        return <div className="p-6 text-slate-500">Memuat data...</div>;
    }

    const editingSantriData = editingSantri ? santri.find(s => s.id === editingSantri) : null;
    const editingJuzList = editingSantri ? parseJuzList(localData[editingSantri]?.materi_juz || '') : [];

    let totalScoreModal = 0;
    let countModal = 0;
    if (editingSantri) {
        editingJuzList.forEach(juz => {
            const isC = modalData.isCustom[juz];
            const cNilai = parseFloat(modalData.customNilai[juz] as any) || 0;
            const shogir = modalData.shogir[juz] || 0;
            const kabir = modalData.kabir[juz] || 0;
            
            if (isC) {
                totalScoreModal += cNilai;
            } else {
                totalScoreModal += calculateJuzScore(shogir, kabir, settingsObj);
            }
            countModal++;
        });
    }
    const nilaiAkhirModal = countModal > 0 ? (totalScoreModal / countModal).toFixed(2) : '0';

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-sans min-h-screen max-w-[1400px] mx-auto pb-12 pt-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2">Ujian Semester</h1>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Evaluasi hafalan komprehensif akhir semester</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button onClick={activeTab === 'remedial' ? handleExportRemedial : handleExport} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center hover:bg-blue-700 shadow-sm transition-all focus:ring-4 focus:ring-blue-500/20 active:bg-blue-800">
                        <Download size={16} className="mr-2 text-white" strokeWidth={2.5}/> Export
                    </button>
                    {activeTab !== 'remedial' && (
                        <div className="relative group z-20">
                            <button onClick={() => setIsImportMenuOpen(prev => !prev)} className="bg-white border border-slate-200/80 text-slate-700 px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all focus:ring-4 focus:ring-slate-100">
                                <Upload size={16} className="mr-2 text-slate-500" strokeWidth={2.5}/> Import
                            </button>
                            <div className={`absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-[0_12px_40px_-10px_rgba(0,0,0,0.15)] transition-all overflow-hidden z-50 ${isImportMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible focus-within:opacity-100 focus-within:visible'}`}>
                                <button onClick={() => { setIsImportMenuOpen(false); fileInputRef.current?.click(); }} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center transition-colors">
                                    <Upload size={16} className="mr-3 text-blue-600" /> Upload File Excel
                                </button>
                                <button onClick={() => { setIsImportMenuOpen(false); handleDownloadTemplate(); }} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center transition-colors">
                                    <Download size={16} className="mr-3 text-green-600" /> Download Template
                                </button>
                            </div>
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload}/>
                </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-wrap gap-5 items-end relative z-[1]">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Marhalah</label>
                    <select 
                        className="w-full border border-slate-200/80 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                        value={selectedMarhalah} 
                        onChange={(e) => setSelectedMarhalah(e.target.value)}
                    >
                        <option value="All">Semua Marhalah</option>
                        {masterMarhalahs?.map((m: any) => (
                            <option key={m.id} value={m.nama || m.id}>{m.nama}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Kelas</label>
                    <select 
                        className="w-full border border-slate-200/80 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                        value={selectedKelas} 
                        onChange={(e) => setSelectedKelas(e.target.value)}
                    >
                        <option value="All">Semua Kelas</option>
                        {masterKelasRelasi?.filter((k: any) => selectedMarhalah === 'All' ? true : k.marhalah_id === masterMarhalahs?.find((m: any) => m.nama === selectedMarhalah)?.id).map((k: any) => (
                            <option key={k.id} value={k.nama_kelas || k.id}>{k.nama_kelas}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[250px] relative">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Cari Santri</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Ketik nama santri..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full border border-slate-200/80 rounded-xl pl-11 pr-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    </div>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex border-b border-slate-200 gap-2 px-1">
                <button
                    onClick={() => setActiveTab('materi-nilai')}
                    className={`pb-3.5 px-5 text-sm font-bold flex items-center border-b-2 transition-all ${
                        activeTab === 'materi-nilai'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    Materi & Nilai
                </button>
                <button
                    onClick={() => setActiveTab('remedial')}
                    className={`pb-3.5 px-5 text-sm font-bold flex items-center border-b-2 transition-all ${
                        activeTab === 'remedial'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    Daftar Remedial
                </button>
                <button
                    onClick={() => setActiveTab('catatan')}
                    className={`pb-3.5 px-5 text-sm font-bold flex items-center border-b-2 transition-all ${
                        activeTab === 'catatan'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    Catatan
                </button>
            </div>

            {activeTab === 'materi-nilai' ? (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col relative z-[0]">
                    <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white relative">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center">
                            Daftar Santri & Nilai Ujian
                            <span className="ml-3 bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-[11px] font-bold">
                                {allFilteredSantri.length} Santri
                            </span>
                        </h3>
                        <button 
                            onClick={handleSaveAll}
                            disabled={isSaving}
                            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm active:bg-blue-800 focus:ring-4 focus:ring-blue-500/20 disabled:opacity-50"
                        >
                            <Save size={16} strokeWidth={2.5}/>
                            {isSaving ? 'Menyimpan...' : 'Simpan Semua'}
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-16 text-center">No</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold min-w-[200px] text-left">Nama Santri</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold min-w-[120px] text-left">Marhalah / Kelas</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold min-w-[200px] text-left">Materi (Juz)</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-32 text-center">Nilai Akhir</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-32 text-center">Predikat</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-32 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredSantri.length > 0 ? (
                                    filteredSantri.map((s, idx) => {
                                        const data = localData[s.id] || { materi_juz: '', nilai_akhir: null };
                                        return (
                                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 text-center font-bold text-slate-400">{currentPageNum * rowsPerPage + idx + 1}</td>
                                                <td className="px-6 py-4 font-bold text-slate-800">{s.nama}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-slate-100 text-slate-700 whitespace-nowrap">
                                                            <KelasLabel text={s.kelas} id={s.kelas_id} />
                                                        </span>
                                                        {(s.marhalah || s.marhalah_id) && (
                                                            <span className="text-[11px] font-medium text-slate-400">
                                                                <MarhalahLabel text={s.marhalah} id={s.marhalah_id} />
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <input 
                                                        type="text" 
                                                        value={data.materi_juz}
                                                        onChange={(e) => handleMateriChange(s.id, e.target.value)}
                                                        placeholder="Cth: 1-5, 30" 
                                                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex px-3 py-1.5 rounded-lg font-bold text-[13px] ${data.nilai_akhir !== null ? 'bg-slate-100 border border-slate-200 text-slate-700' : 'text-slate-400 bg-slate-50 border border-slate-200/80'}`}>
                                                        {data.nilai_akhir !== null ? data.nilai_akhir : '-'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-600 font-bold text-[11px] rounded-md">
                                                        {getPredikat(data.nilai_akhir, globalPredikatNilai)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button 
                                                            onClick={() => handleOpenInputNilai(s.id, false)}
                                                            className="text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center transition-colors active:bg-slate-300 focus:ring-4 focus:ring-slate-100 whitespace-nowrap"
                                                        >
                                                            Input Nilai
                                                        </button>
                                                        {examAttempts.some((a: any) => Number(a.santri_id) === Number(s.id)) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setHistorySantriId(s.id)}
                                                                className="p-2 text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors"
                                                                title="Lihat Riwayat Attempt Ujian & Remedial"
                                                            >
                                                                <History size={14} />
                                                                <span className="text-[10px]">
                                                                    #{examAttempts.filter((a: any) => Number(a.santri_id) === Number(s.id)).length}
                                                                </span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-slate-500 font-medium">
                                            Tidak ada data santri
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-6 pb-6">
                            <button 
                                onClick={() => setCurrentPageNum(p => Math.max(0, p - 1))}
                                disabled={currentPageNum === 0}
                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Sebelumnya
                            </button>
                            <span className="text-sm font-bold text-slate-700 px-4">
                                Halaman {currentPageNum + 1} dari {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPageNum(p => Math.min(totalPages - 1, p + 1))}
                                disabled={currentPageNum === totalPages - 1}
                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    )}
                </div>
            ) : activeTab === 'remedial' ? (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col relative z-[0]">
                    <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white relative">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">
                                Daftar Santri Remedial & Pencatatan Attempt Baru
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Setiap input remedial menyimpan Attempt baru (<span className="font-mono">exam_attempts</span>) tanpa menimpa histori nilai Attempt #1.
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600 border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 border-b border-r border-slate-200/80 font-bold w-16 text-center">No</th>
                                    <th className="px-6 py-4 border-b border-r border-slate-200/80 font-bold w-28 text-center">ID Santri</th>
                                    <th className="px-6 py-4 border-b border-r border-slate-200/80 font-bold min-w-[200px] text-left">Nama Santri</th>
                                    <th className="px-6 py-4 border-b border-r border-slate-200/80 font-bold min-w-[120px] text-left">Marhalah / Kelas</th>
                                    <th className="px-6 py-4 border-b border-r border-slate-200/80 font-bold min-w-[180px] text-left">Juz yang Rasib</th>
                                    <th className="px-6 py-4 border-b border-r border-slate-200/80 font-bold w-32 text-center">Nilai</th>
                                    <th className="px-6 py-4 border-b border-r border-slate-200/80 font-bold w-36 text-center">Jumlah Juz Rasib</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-48 text-center">Aksi Remedial</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {remedialData.length > 0 ? (
                                    remedialData.map((item, idx) => {
                                        const n = item.rasibJuzList.length;
                                        const studentAttempts = examAttempts.filter((a: any) => Number(a.santri_id) === Number(item.santri.id));
                                        return (
                                            <React.Fragment key={item.santri.id}>
                                                {item.rasibJuzList.map((r, rIdx) => (
                                                    <tr key={`${item.santri.id}-${rIdx}`} className="hover:bg-slate-50 transition-colors">
                                                        {rIdx === 0 && (
                                                            <>
                                                                <td 
                                                                    rowSpan={n} 
                                                                    className="px-6 py-4 text-center font-bold text-slate-400 align-middle border-b border-r border-slate-200/80 bg-white"
                                                                >
                                                                    {idx + 1}
                                                                </td>
                                                                <td 
                                                                    rowSpan={n} 
                                                                    className="px-6 py-4 text-center font-medium text-slate-500 align-middle border-b border-r border-slate-200/80 bg-white"
                                                                >
                                                                    {item.santri.nis || item.santri.id}
                                                                </td>
                                                                <td 
                                                                    rowSpan={n} 
                                                                    className="px-6 py-4 font-bold text-slate-800 align-middle border-b border-r border-slate-200/80 bg-white"
                                                                >
                                                                    <div>{item.santri.nama}</div>
                                                                    {studentAttempts.length > 0 && (
                                                                        <div className="mt-1">
                                                                            <StatusBadge label={`ATTEMPT #${studentAttempts.length}`} tone="warning" />
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td 
                                                                    rowSpan={n} 
                                                                    className="px-6 py-4 align-middle border-b border-r border-slate-200/80 bg-white"
                                                                >
                                                                    <div className="flex flex-col gap-1 items-start">
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-slate-100 text-slate-700 whitespace-nowrap">
                                                                            <KelasLabel text={item.santri.kelas} id={item.santri.kelas_id} />
                                                                        </span>
                                                                        {(item.santri.marhalah || item.santri.marhalah_id) && (
                                                                            <span className="text-[11px] font-medium text-slate-400">
                                                                                <MarhalahLabel text={item.santri.marhalah} id={item.santri.marhalah_id} />
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </>
                                                        )}
                                                        <td className="px-6 py-3 text-left font-semibold text-slate-700 align-middle border-b border-r border-slate-200/80">
                                                            {r.juz}
                                                        </td>
                                                        <td className="px-6 py-3 text-center align-middle border-b border-r border-slate-200/80">
                                                            <span className="inline-flex px-3 py-1.5 rounded-lg font-bold text-[13px] bg-red-50 text-red-700 border border-red-200">
                                                                {r.score}
                                                            </span>
                                                        </td>
                                                        {rIdx === 0 && (
                                                            <>
                                                                <td 
                                                                    rowSpan={n} 
                                                                    className="px-6 py-4 text-center align-middle border-b border-r border-slate-200/80 bg-white"
                                                                >
                                                                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                                                                        {n} Juz
                                                                    </span>
                                                                </td>
                                                                <td 
                                                                    rowSpan={n} 
                                                                    className="px-6 py-4 text-center align-middle border-b border-slate-200/80 bg-white"
                                                                >
                                                                    <div className="flex items-center justify-center gap-1.5">
                                                                        <button 
                                                                            onClick={() => handleOpenInputNilai(item.santri.id, true)}
                                                                            className="text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center transition-colors whitespace-nowrap"
                                                                        >
                                                                            Input Remedial
                                                                        </button>
                                                                        {studentAttempts.length > 0 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setHistorySantriId(item.santri.id)}
                                                                                className="p-2 text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl text-xs font-bold"
                                                                                title="Lihat Riwayat Attempt"
                                                                            >
                                                                                <History size={14} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center">
                                            <div className="max-w-sm mx-auto flex flex-col items-center">
                                                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                                                    <CheckCircle size={26} />
                                                </div>
                                                <h4 className="text-base font-bold text-slate-800 mb-1">Semua Nilai Tuntas!</h4>
                                                <p className="text-xs text-slate-500">
                                                    Tidak ada santri dengan nilai ujian semester di bawah KKM ({kkmThreshold}).
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col relative z-[0]">
                    <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white relative">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">
                                Catatan Wali Kelas
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Catatan evaluasi perkembangan santri yang otomatis dimuat pada lembar raport.
                            </p>
                        </div>
                        <button 
                            onClick={handleSaveAll}
                            disabled={isSaving}
                            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm active:bg-blue-800 focus:ring-4 focus:ring-blue-500/20 disabled:opacity-50"
                        >
                            <Save size={16} strokeWidth={2.5}/>
                            {isSaving ? 'Menyimpan...' : 'Simpan Semua Catatan'}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-4 border-b border-slate-200/80 font-bold w-14 text-center">No</th>
                                    <th className="px-4 py-4 border-b border-slate-200/80 font-bold w-48 text-left">Nama Santri</th>
                                    <th className="px-4 py-4 border-b border-slate-200/80 font-bold w-36 text-left">Marhalah / Kelas</th>
                                    <th className="px-6 py-4 border-b border-slate-200/80 font-bold text-left">Catatan Wali Kelas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredSantri.length > 0 ? (
                                    filteredSantri.map((s, idx) => {
                                        const data = localData[s.id] || { catatan: '' };
                                        return (
                                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-4 text-center font-bold text-slate-400 align-top pt-5">{currentPageNum * rowsPerPage + idx + 1}</td>
                                                <td className="px-4 py-4 align-top pt-5">
                                                    <div className="font-bold text-slate-800 leading-snug">{s.nama}</div>
                                                    <div className="text-[11px] text-slate-400 mt-0.5">NIS: {s.nis || s.id}</div>
                                                </td>
                                                <td className="px-4 py-4 align-top pt-5">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-slate-100 text-slate-700 whitespace-nowrap">
                                                            <KelasLabel text={s.kelas} id={s.kelas_id} />
                                                        </span>
                                                        {(s.marhalah || s.marhalah_id) && (
                                                            <span className="text-[11px] font-medium text-slate-400">
                                                                <MarhalahLabel text={s.marhalah} id={s.marhalah_id} />
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <textarea 
                                                        value={data.catatan || ''}
                                                        onChange={(e) => handleCatatanChange(s.id, e.target.value)}
                                                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-sm text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white resize-y min-h-[70px]"
                                                        rows={2}
                                                        placeholder="Tulis catatan perkembangan santri..."
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500 font-medium">
                                            Tidak ada data santri
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-6 pb-6">
                            <button 
                                onClick={() => setCurrentPageNum(p => Math.max(0, p - 1))}
                                disabled={currentPageNum === 0}
                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Sebelumnya
                            </button>
                            <span className="text-sm font-bold text-slate-700 px-4">
                                Halaman {currentPageNum + 1} dari {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPageNum(p => Math.min(totalPages - 1, p + 1))}
                                disabled={currentPageNum === totalPages - 1}
                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    )}
                </div>
            )}

            {editingSantri && editingSantriData && (
                <Modal
                    isOpen={!!editingSantri}
                    onClose={() => setEditingSantri(null)}
                    title={isRemedialAttempt ? 'Input Nilai Remedial Ujian Semester (Attempt Baru)' : 'Input Nilai Ujian Semester'}
                    maxWidth="2xl"
                >
                    <div className="space-y-5">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <div className="text-base font-bold text-slate-800">{editingSantriData.nama}</div>
                                <div className="text-sm font-medium text-slate-500 mt-0.5">Materi: Juz {localData[editingSantri].materi_juz}</div>
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isRemedialAttempt}
                                    onChange={(e) => setIsRemedialAttempt(e.target.checked)}
                                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span>Catat sebagai Attempt Remedial</span>
                            </label>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                                Catatan Penguji / Alasan Remedial (Tercatat di exam_attempts)
                            </label>
                            <input
                                type="text"
                                value={attemptNote}
                                onChange={(e) => setAttemptNote(e.target.value)}
                                placeholder={isRemedialAttempt ? 'Contoh: Perbaikan ujian Juz yang rasib setelah pembinaan...' : 'Catatan pelaksanaan ujian (opsional)...'}
                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>

                        <div className="border border-slate-200/80 rounded-xl">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold sticky top-[-24px] z-10 shadow-sm shadow-slate-200/50">
                                    <tr>
                                        <th className="px-6 py-3.5 border-b border-slate-200/80 text-center w-24">Juz</th>
                                        <th className="px-6 py-3.5 border-b border-slate-200/80 text-center w-28">Custom</th>
                                        <th className="px-6 py-3.5 border-b border-slate-200/80 text-center w-1/4">Khoto Kabir</th>
                                        <th className="px-6 py-3.5 border-b border-slate-200/80 text-center w-1/4">Khoto Shogir</th>
                                        <th className="px-6 py-3.5 border-b border-slate-200/80 text-center w-48">Nilai Juz</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {editingJuzList.map((juz) => {
                                        const shogir = modalData.shogir[juz] || 0;
                                        const kabir = modalData.kabir[juz] || 0;
                                        const isCustom = modalData.isCustom[juz] || false;
                                        const customNilai = modalData.customNilai[juz] || 0;
                                        const juzScore = isCustom ? customNilai : calculateJuzScore(shogir, kabir, settingsObj);
                                        
                                        return (
                                            <tr key={juz} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-3.5 text-center font-bold text-slate-700 bg-slate-50/30 text-[14px]">{juz}</td>
                                                <td className="px-6 py-3.5 text-center align-middle">
                                                    <input 
                                                        type="checkbox"
                                                        checked={isCustom}
                                                        onChange={(e) => handleCustomCheckbox(juz, e.target.checked)}
                                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-[18px] h-[18px] mx-auto block"
                                                        title="Gunakan nilai custom"
                                                    />
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={kabir === 0 ? '' : kabir}
                                                        onChange={(e) => handleModalChange(juz, 'kabir', e.target.value)}
                                                        disabled={isCustom}
                                                        className="w-full text-center border border-slate-200/80 rounded-xl px-3 py-2 text-[14px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white disabled:opacity-50"
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={shogir === 0 ? '' : shogir}
                                                        onChange={(e) => handleModalChange(juz, 'shogir', e.target.value)}
                                                        disabled={isCustom}
                                                        className="w-full text-center border border-slate-200/80 rounded-xl px-3 py-2 text-[14px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white disabled:opacity-50"
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="px-6 py-3.5 text-center bg-slate-50/30">
                                                    {isCustom ? (
                                                        <input 
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="any"
                                                            value={modalData.customNilai[juz] ?? 0}
                                                            onChange={(e) => handleModalChange(juz, 'customNilai', e.target.value)}
                                                            className="w-full text-center border border-slate-200/80 rounded-xl px-3 py-2 text-[14px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all mx-auto block focus:bg-white"
                                                        />
                                                    ) : (
                                                        <span className="font-mono text-base font-bold text-slate-700">{juzScore}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-between items-center pt-5 border-t border-slate-200/80">
                            <div className="font-bold text-slate-800 text-base flex flex-col">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Nilai Akhir</span>
                                <span className="text-2xl text-slate-800">{nilaiAkhirModal}</span>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setEditingSantri(null)} className="px-5 py-2.5 text-slate-600 font-bold bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-[13px] transition-all">
                                    Batal
                                </button>
                                <button onClick={handleSaveModal} disabled={isSavingModal} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-[13px] hover:bg-blue-700 shadow-sm transition-all focus:ring-4 focus:ring-blue-500/20 flex items-center disabled:opacity-50">
                                    <Save size={16} className="mr-2" /> {isSavingModal ? 'Menyimpan...' : (isRemedialAttempt ? 'Simpan Attempt Remedial' : 'Simpan Nilai')}
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Riwayat Attempt Ujian & Remedial */}
            {historySantriId && (
                <Modal
                    isOpen={!!historySantriId}
                    onClose={() => setHistorySantriId(null)}
                    title={`Riwayat Attempt Ujian & Remedial — ${santri.find(s => s.id === historySantriId)?.nama || ''}`}
                    maxWidth="2xl"
                >
                    <div className="space-y-4">
                        <p className="text-xs text-slate-500">
                            Histori seluruh percobaan ujian semester utama dan remedial (<span className="font-mono">exam_attempts</span>) yang tidak pernah ditimpa.
                        </p>
                        <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                            {examAttempts
                                .filter((a: any) => Number(a.santri_id) === Number(historySantriId))
                                .map((att: any) => (
                                    <div key={att.id} className="p-4 bg-white hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-900">
                                                    Attempt #{att.attempt_no}
                                                </span>
                                                <StatusBadge
                                                    label={att.is_remedial ? 'REMEDIAL' : 'UJIAN UTAMA'}
                                                    tone={att.is_remedial ? 'warning' : 'primary'}
                                                />
                                                <span className="text-xs font-mono text-slate-500">
                                                    Materi: Juz {att.materi_juz || '-'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-600 mt-1">{att.notes || '-'}</p>
                                            <div className="text-[11px] font-mono text-slate-400 mt-1">
                                                {att.created_at ? new Date(att.created_at).toLocaleString('id-ID') : '-'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-extrabold font-mono text-slate-900">
                                                {att.final_score ?? '-'}
                                            </div>
                                            <div className="text-[11px] font-bold text-slate-500">
                                                {att.predikat || '-'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setHistorySantriId(null)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
export default UjianSemesterPage;