import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { Marhalah, Santri } from '../../types';
import { Plus, Trash, Upload, Download, Search, Edit, FileText, FileSpreadsheet, ChevronRight, Send, Link as LinkIcon, ListFilter, ArrowUpDown } from 'lucide-react';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabaseClient';
import { StatusBadge } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';

const SantriPage: React.FC = () => {
    const { studentId } = useParams<{ studentId?: string }>();
    const navigate = useNavigate();

    const handleWA = (phone: string) => {
        const clean = phone.replace(/\D/g, '');
        const final = clean.startsWith('0') ? '62' + clean.slice(1) : clean;
        window.open(`https://wa.me/${final}`, '_blank');
    };

    const { allSantri, santri, halaqah, setoranHarian, fetchData, loading, error, getOrgId, masterKelas, globalMarhalahs, masterMarhalahs, masterKelasRelasi } = useSupabaseData();
    const { selectedAcademicYear, academicYears } = useAcademicYear();
    
    // State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingPerson, setEditingPerson] = useState<Santri | null>(null);
    const [detailSantri, setDetailSantri] = useState<Santri | null>(null);
    const [studentEnrollmentHistory, setStudentEnrollmentHistory] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        nama: '', kode: '', marhalah: '', 
        kelas: '',
        nama_wali: '', no_hp_wali: '', status: 'active', telegram_chat_id: ''
    });

    // Filters
    const [filterMarhalah, setFilterMarhalah] = useState<string | 'all'>('all');
    const [filterKelas, setFilterKelas] = useState<string | 'all'>('all');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('active');
    const [filterUnenrolledOnly, setFilterUnenrolledOnly] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                return null; // Reset sort
            }
            return { key, direction: 'asc' };
        });
    };

    const getSortIcon = (key: string) => {
        if (sortConfig?.key === key) {
            return <ArrowUpDown size={12} className="text-blue-500 opacity-100 transition-opacity" />;
        }
        return <ArrowUpDown size={12} className="opacity-40 group-hover:opacity-100 transition-opacity" />;
    };
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;

    // Derived Data (Identitas Master Santri vs Enrollment Tahun Ajaran Aktif)
    const activeSantri = useMemo(() => {
        return allSantri;
    }, [allSantri]);

    const enrolledIdSet = useMemo(() => {
        const ids = new Set<number>();
        (santri || []).forEach((s) => {
            if (s.kelas && s.kelas !== '-') {
                ids.add(s.id);
            }
        });
        return ids;
    }, [santri]);

    const unenrolledCount = useMemo(() => {
        return activeSantri.filter((s) => (s.status || 'active') === 'active' && !enrolledIdSet.has(s.id)).length;
    }, [activeSantri, enrolledIdSet]);

    const openDetailTimeline = async (person: Santri) => {
        setDetailSantri(person);
        try {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { data } = await (supabase.from('student_classes' as any) as any)
                .select('*')
                .eq('organization_id', orgId)
                .eq('santri_id', person.id)
                .order('academic_year_id', { ascending: false });
            setStudentEnrollmentHistory(data || []);
        } catch {
            setStudentEnrollmentHistory([]);
        }
    };

    useEffect(() => {
        if (studentId && allSantri && allSantri.length > 0) {
            const target = allSantri.find((s) => String(s.id) === String(studentId));
            if (target && detailSantri?.id !== target.id) {
                openDetailTimeline(target);
            }
        }
    }, [studentId, allSantri]);

    const availableFilterKelas = useMemo(() => {
        if (filterMarhalah === 'all') return [];
        const targetMarhalah = masterMarhalahs?.find((m: any) => m.nama === filterMarhalah);
        if (targetMarhalah) {
            const relasiClasses = masterKelasRelasi
                ?.filter((k: any) => k.marhalah_id === targetMarhalah.id)
                .map((k: any) => k.nama_kelas);
            if (relasiClasses && relasiClasses.length > 0) return Array.from(new Set(relasiClasses));
        }
        return Array.from(new Set(masterKelas?.filter(m => m.marhalah === filterMarhalah).map(m => m.nama_kelas) || []));
    }, [filterMarhalah, masterMarhalahs, masterKelasRelasi, masterKelas]);

    const availableFormKelas = useMemo(() => {
        if (!formData.marhalah) return [];
        const targetMarhalah = masterMarhalahs?.find((m: any) => m.nama === formData.marhalah);
        if (targetMarhalah) {
            const relasiClasses = masterKelasRelasi
                ?.filter((k: any) => k.marhalah_id === targetMarhalah.id)
                .map((k: any) => k.nama_kelas);
            if (relasiClasses && relasiClasses.length > 0) return Array.from(new Set(relasiClasses));
        }
        return Array.from(new Set(masterKelas?.filter(m => m.marhalah === formData.marhalah).map(m => m.nama_kelas) || []));
    }, [formData.marhalah, masterMarhalahs, masterKelasRelasi, masterKelas]);

    const filteredData = useMemo(() => {
        let result = activeSantri.filter(item => {
            if (filterUnenrolledOnly && enrolledIdSet.has(item.id)) return false;
            if (filterMarhalah !== 'all' && item.marhalah !== filterMarhalah) return false;
            if (filterKelas !== 'all' && item.kelas !== filterKelas) return false;
            if (filterSearch && !item.nama.toLowerCase().includes(filterSearch.toLowerCase()) && item.id.toString() !== filterSearch.trim()) return false;
            if (filterStatus !== 'all' && (item.status || 'active') !== filterStatus) return false;
            return true;
        });

        if (sortConfig) {
            result.sort((a: any, b: any) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === 'marhalah_kelas') {
                    const mIdxA = globalMarhalahs.indexOf(a.marhalah);
                    const mIdxB = globalMarhalahs.indexOf(b.marhalah);
                    if (mIdxA !== mIdxB) return sortConfig.direction === 'asc' ? mIdxA - mIdxB : mIdxB - mIdxA;
                    aVal = a.kelas;
                    bVal = b.kelas;
                } else if (sortConfig.key === 'wali_kontak') {
                    aVal = a.nama_wali || '';
                    bVal = b.nama_wali || '';
                }

                if (aVal == null) aVal = '';
                if (bVal == null) bVal = '';

                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal, undefined, {numeric: true}) : bVal.localeCompare(aVal, undefined, {numeric: true});
                }
                
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            result.sort((a, b) => {
                const mIdxA = globalMarhalahs.indexOf(a.marhalah);
                const mIdxB = globalMarhalahs.indexOf(b.marhalah);
                if (mIdxA !== mIdxB) return mIdxA - mIdxB;
                if (a.kelas !== b.kelas) return (a.kelas || '').localeCompare(b.kelas || '', undefined, { numeric: true });
                return (a.nama || '').localeCompare(b.nama || '');
            });
        }

        return result;
    }, [activeSantri, filterUnenrolledOnly, enrolledIdSet, filterMarhalah, filterKelas, filterSearch, filterStatus, globalMarhalahs, sortConfig]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    // Actions
    const openModal = (person: Santri | null) => {
        setEditingPerson(person);
        
        if (person) {
            setFormData({
                nama: person.nama,
                kode: person.kode || '',
                marhalah: person.marhalah,
                kelas: person.kelas,
                nama_wali: person.nama_wali || '',
                no_hp_wali: person.no_hp_wali || '',
                status: person.status || 'active',
                telegram_chat_id: person.telegram_chat_id || ''
            });
        } else {
            const initialMarhalah = masterMarhalahs?.length > 0 ? masterMarhalahs[0].nama : (globalMarhalahs?.[0] || 'Mutawassithah');
            const targetMarhalah = masterMarhalahs?.find((m: any) => m.nama === initialMarhalah);
            let initialClasses = targetMarhalah
                ? masterKelasRelasi?.filter((k: any) => k.marhalah_id === targetMarhalah.id).map((k: any) => k.nama_kelas)
                : [];
            if (!initialClasses || initialClasses.length === 0) {
                initialClasses = masterKelas?.filter(m => m.marhalah === initialMarhalah).map(m => m.nama_kelas) || [];
            }
            setFormData({
                nama: '', 
                kode: '', 
                marhalah: initialMarhalah,
                kelas: initialClasses[0] || '',
                nama_wali: '', 
                no_hp_wali: '', 
                status: 'active',
                telegram_chat_id: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.nama) {
            NotificationStore.addNotification("Nama wajib diisi", "error");
            return;
        }
        
        const finalKelas = formData.kelas;
        if (!finalKelas) {
            NotificationStore.addNotification("Kelas wajib diisi", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const orgId = await getOrgId();
            
            const m_id = masterMarhalahs?.find((m: any) => m.nama === formData.marhalah)?.id || null;
            const k_id = masterKelasRelasi?.find((k: any) => k.nama_kelas === finalKelas && (!m_id || k.marhalah_id === m_id))?.id || null;

            const legacyEnumList = ['Mutawassithah', 'Aliyah', 'Jamiah'];
            const safeLegacyMarhalah = legacyEnumList.includes(formData.marhalah) ? formData.marhalah : 'Mutawassithah';

            const payload: any = {
                marhalah_id: m_id,
                kelas_id: k_id,
                organization_id: orgId,
                nama: formData.nama,
                marhalah: formData.marhalah,
                kelas: finalKelas,
                kode: formData.kode || null,
                nama_wali: formData.nama_wali || null,
                no_hp_wali: formData.no_hp_wali || null,
                telegram_chat_id: formData.telegram_chat_id || null,
                status: formData.status
            };

            let santriId = editingPerson?.id;

            if (editingPerson) {
                delete payload.organization_id;
                let { error } = await supabase.from('santri').update(payload).eq('id', editingPerson.id).eq('organization_id', orgId);
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await supabase.from('santri').update(payload).eq('id', editingPerson.id).eq('organization_id', orgId);
                    error = res.error;
                }
                if (error) throw error;
            } else {
                let { data, error } = await supabase.from('santri').insert(payload).select().single();
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await supabase.from('santri').insert(payload).select().single();
                    data = res.data;
                    error = res.error;
                }
                if (error) throw error;
                santriId = data?.id;
            }

            // Also update/insert into student_classes for the active academic year
            if (santriId && selectedAcademicYear) {
                const classPayload: any = {
                    organization_id: orgId,
                    academic_year_id: selectedAcademicYear.id,
                    santri_id: santriId,
                    marhalah_id: m_id,
                    kelas_id: k_id,
                    marhalah: formData.marhalah,
                    kelas: finalKelas
                };
                
                // Check if exists
                const { data: existingClass } = await (supabase.from('student_classes' as any) as any)
                    .select('id')
                    .eq('organization_id', orgId)
                    .eq('academic_year_id', selectedAcademicYear.id)
                    .eq('santri_id', santriId)
                    .maybeSingle();

                if (existingClass) {
                    let { error } = await (supabase.from('student_classes' as any) as any).update({
                        marhalah_id: m_id,
                        kelas_id: k_id,
                        marhalah: formData.marhalah,
                        kelas: finalKelas
                    }).eq('id', existingClass.id).eq('organization_id', orgId);
                    if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                        await (supabase.from('student_classes' as any) as any).update({
                            marhalah_id: m_id,
                            kelas_id: k_id,
                            marhalah: safeLegacyMarhalah,
                            kelas: finalKelas
                        }).eq('id', existingClass.id).eq('organization_id', orgId);
                    }
                } else {
                    let { error } = await (supabase.from('student_classes' as any) as any).insert(classPayload);
                    if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                        classPayload.marhalah = safeLegacyMarhalah;
                        await (supabase.from('student_classes' as any) as any).insert(classPayload);
                    }
                }

                // Dual-write ke tabel kanonikal student_enrollments (Fase 3 & Fase 6 Blueprint)
                try {
                    await (supabase.from('student_enrollments' as any) as any).upsert(
                        {
                            organization_id: orgId,
                            student_id: santriId,
                            academic_year_id: selectedAcademicYear.id,
                            marhalah_id: m_id,
                            kelas_id: k_id,
                            status: formData.status === 'active' ? 'active' : 'withdrawn',
                            enrolled_at: new Date().toISOString().split('T')[0],
                        },
                        { onConflict: 'organization_id,student_id,academic_year_id' }
                    );
                } catch {}
            }

            await fetchData();
            setIsModalOpen(false);
            NotificationStore.addNotification(`Berhasil ${editingPerson ? 'memperbarui' : 'menambahkan'} data santri & enrollment ${formData.nama}!`, 'success');
        } catch (e: any) {
            NotificationStore.addNotification(`Error: ${e.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const orgId = await getOrgId();
            const { error } = await supabase.from('santri').delete().eq('id', id).eq('organization_id', orgId);
            if (error) {
                const { error: softErr } = await supabase
                    .from('santri')
                    .update({ status: 'non-aktif' })
                    .eq('id', id)
                    .eq('organization_id', orgId);
                if (softErr) throw error;
                NotificationStore.addNotification('Santri memiliki riwayat akademik aktif; status santri telah diubah menjadi Non-Aktif agar histori nilai/absensi tidak hilang.', 'info');
            } else {
                NotificationStore.addNotification('Data santri berhasil dihapus.', 'success');
            }
            await fetchData();
        } catch (e: any) {
            NotificationStore.addNotification(`Error: ${e.message}`, 'error');
        }
    };

    // Import/Export Logic
    const handleDownloadTemplate = () => {
        // Sample data for Template sheet
        const sampleMarhalah = masterMarhalahs?.[0];
        const sampleKelas = masterKelasRelasi?.find((k: any) => !sampleMarhalah || k.marhalah_id === sampleMarhalah.id);

        const dummyData = [
            {
                'Nama Santri': 'Abdullah Pratama',
                'ID Marhalah': sampleMarhalah ? sampleMarhalah.id : 1,
                'Nama Marhalah': sampleMarhalah ? sampleMarhalah.nama : 'Ulya',
                'ID Kelas': sampleKelas ? sampleKelas.id : 101,
                'Nama Kelas': sampleKelas ? sampleKelas.nama_kelas : '10-A',
                'NIS / Kode': 'S001',
                'Nama Wali': 'Fulan Ahmad',
                'No HP Wali': '08123456789'
            },
            {
                'Nama Santri': 'Zaid bin Tsabit',
                'ID Marhalah': sampleMarhalah ? sampleMarhalah.id : 1,
                'Nama Marhalah': sampleMarhalah ? sampleMarhalah.nama : 'Ulya',
                'ID Kelas': sampleKelas ? sampleKelas.id : 101,
                'Nama Kelas': sampleKelas ? sampleKelas.nama_kelas : '10-A',
                'NIS / Kode': 'S002',
                'Nama Wali': 'Tsabit',
                'No HP Wali': '08129876543'
            }
        ];

        // Guide / Reference data for Sheet 2
        const guideMarhalahRows = (masterMarhalahs || []).map((m: any) => ({
            'Tipe': 'Marhalah',
            'ID': m.id,
            'Nama': m.nama,
            'Keterangan': 'Gunakan ID atau Nama ini di kolom Marhalah'
        }));

        const guideKelasRows = (masterKelasRelasi || []).map((k: any) => {
            const m = masterMarhalahs?.find((mar: any) => mar.id === k.marhalah_id);
            return {
                'Tipe': 'Kelas',
                'ID': k.id,
                'Nama': k.nama_kelas,
                'Keterangan': `Kelas untuk Marhalah: ${m ? m.nama : 'Semua'}`
            };
        });

        const guideData = [...guideMarhalahRows, ...guideKelasRows];

        // Build Excel Workbook with 2 Sheets
        const wb = XLSX.utils.book_new();

        const wsTemplate = XLSX.utils.json_to_sheet(dummyData);
        wsTemplate['!cols'] = [
            { wch: 25 }, // Nama Santri
            { wch: 14 }, // ID Marhalah
            { wch: 18 }, // Nama Marhalah
            { wch: 12 }, // ID Kelas
            { wch: 16 }, // Nama Kelas
            { wch: 14 }, // NIS / Kode
            { wch: 22 }, // Nama Wali
            { wch: 16 }  // No HP Wali
        ];
        XLSX.utils.book_append_sheet(wb, wsTemplate, 'Data Santri');

        const wsGuide = XLSX.utils.json_to_sheet(guideData.length > 0 ? guideData : [
            { 'Tipe': 'Info', 'ID': '-', 'Nama': '-', 'Keterangan': 'Belum ada data master marhalah/kelas di Pengaturan.' }
        ]);
        wsGuide['!cols'] = [
            { wch: 12 },
            { wch: 10 },
            { wch: 22 },
            { wch: 45 }
        ];
        XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Master ID');

        XLSX.writeFile(wb, 'template_import_santri.xlsx');
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const orgId = await getOrgId();
            const csvData = await parseSpreadsheet(file);
            if (!csvData || csvData.length === 0) {
                NotificationStore.addNotification('File kosong atau format tidak sesuai.', 'error');
                return;
            }

            let success = 0;
            const errors: string[] = [];

            for (let i = 0; i < csvData.length; i++) {
                const row = csvData[i];
                const rowNum = i + 2; // header is row 1, data starts row 2

                const nama = (row['nama santri'] || row.nama || '').toString().trim();
                if (!nama) continue; // skip empty rows

                // 1. Resolve Marhalah (Check ID first, then Nama)
                const rawMId = row['id marhalah'] || row.marhalah_id || row['id_marhalah'];
                const rawMNama = (row['nama marhalah'] || row.marhalah || '').toString().trim();

                let resolvedMarhalah: any = null;

                if (rawMId !== undefined && rawMId !== null && String(rawMId).trim() !== '') {
                    const parsedMId = Number(rawMId);
                    resolvedMarhalah = masterMarhalahs?.find((m: any) => m.id === parsedMId);
                }

                if (!resolvedMarhalah && rawMNama) {
                    resolvedMarhalah = masterMarhalahs?.find((m: any) => 
                        m.nama.trim().toLowerCase() === rawMNama.toLowerCase()
                    );
                }

                if (!resolvedMarhalah) {
                    const displayM = rawMNama || rawMId || 'Kosong';
                    errors.push(`Baris ${rowNum} (${nama}): Marhalah '${displayM}' tidak terdaftar di Master Marhalah. Harap pilih Marhalah yang terdaftar di Pengaturan.`);
                    continue;
                }

                // 2. Resolve Kelas (Check ID first, then Nama matched with resolvedMarhalah)
                const rawKId = row['id kelas'] || row.kelas_id || row['id_kelas'];
                const rawKNama = (row['nama kelas'] || row.kelas || '').toString().trim();

                let resolvedKelas: any = null;

                if (rawKId !== undefined && rawKId !== null && String(rawKId).trim() !== '') {
                    const parsedKId = Number(rawKId);
                    resolvedKelas = masterKelasRelasi?.find((k: any) => k.id === parsedKId);
                }

                if (!resolvedKelas && rawKNama) {
                    // Find class by name and ensure it belongs to the matched marhalah
                    resolvedKelas = masterKelasRelasi?.find((k: any) => 
                        k.nama_kelas.trim().toLowerCase() === rawKNama.toLowerCase() &&
                        (!k.marhalah_id || k.marhalah_id === resolvedMarhalah.id)
                    );
                }

                if (!resolvedKelas) {
                    const displayK = rawKNama || rawKId || 'Kosong';
                    errors.push(`Baris ${rowNum} (${nama}): Kelas '${displayK}' tidak valid atau tidak terdaftar pada Marhalah '${resolvedMarhalah.nama}'.`);
                    continue;
                }

                // 3. Prepare payload with guaranteed IDs and verified names
                const m_id = resolvedMarhalah.id;
                const m_nama = resolvedMarhalah.nama;
                const k_id = resolvedKelas.id;
                const k_nama = resolvedKelas.nama_kelas;

                const legacyEnumList = ['Mutawassithah', 'Aliyah', 'Jamiah'];
                const safeLegacyMarhalah = legacyEnumList.includes(m_nama) ? m_nama : 'Mutawassithah';

                const payload: any = {
                    organization_id: orgId,
                    nama: nama,
                    marhalah: m_nama,
                    kelas: k_nama,
                    marhalah_id: m_id,
                    kelas_id: k_id,
                    kode: (row['nis / kode'] || row.nis || row.kode || '')?.toString().trim() || null,
                    nama_wali: (row['nama wali'] || row.nama_wali || '')?.toString().trim() || null,
                    no_hp_wali: (row['no hp wali'] || row.no_hp_wali || '')?.toString().trim() || null,
                    status: 'active'
                };
                
                let { data: newSantri, error } = await supabase.from('santri').insert(payload).select().single();
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await supabase.from('santri').insert(payload).select().single();
                    newSantri = res.data;
                    error = res.error;
                }

                if (error) {
                    console.error("Import error line", rowNum, error);
                    errors.push(`Baris ${rowNum} (${nama}): Gagal simpan ke database (${error.message})`);
                } else {
                    success++;
                    if (selectedAcademicYear && newSantri) {
                        const classPayload: any = {
                            organization_id: orgId,
                            academic_year_id: selectedAcademicYear.id,
                            santri_id: newSantri.id,
                            marhalah_id: m_id,
                            kelas_id: k_id,
                            marhalah: m_nama,
                            kelas: k_nama
                        };
                        let { error: classErr } = await (supabase.from('student_classes' as any) as any).insert(classPayload);
                        if (classErr && (classErr.message?.toLowerCase().includes('enum') || classErr.code === '22P02')) {
                            classPayload.marhalah = safeLegacyMarhalah;
                            await (supabase.from('student_classes' as any) as any).insert(classPayload);
                        }
                        try {
                            await (supabase.from('student_enrollments' as any) as any).upsert(
                                {
                                    organization_id: orgId,
                                    student_id: newSantri.id,
                                    academic_year_id: selectedAcademicYear.id,
                                    marhalah_id: m_id,
                                    kelas_id: k_id,
                                    status: 'active',
                                    enrolled_at: new Date().toISOString().split('T')[0],
                                },
                                { onConflict: 'organization_id,student_id,academic_year_id' }
                            );
                        } catch {}
                    }
                }
            }

            await fetchData();
            
            let resultMessage = `Hasil Import Santri: Berhasil ${success} santri, Gagal/Ditolak ${errors.length} baris.`;
            if (errors.length > 0) {
                resultMessage += ` Detail: ` + errors.slice(0, 3).join('; ');
            }
            NotificationStore.addNotification(resultMessage, errors.length > 0 ? 'info' : 'success');
        } catch (e: any) {
            NotificationStore.addNotification(`Import gagal: ${e.message}`, 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleExportPDF = () => {
        // Mengubah kolom Kode menjadi ID
        const columns = ['ID', 'Nama', 'Marhalah', 'Kelas', 'Wali', 'No HP'];
        const rows = filteredData.map(s => [
            s.id, s.nama, s.marhalah, s.kelas, s.nama_wali || '-', s.no_hp_wali || '-'
        ]);
        exportToPDF('Data Santri', columns, rows, 'Data_Santri');
    };

    if (loading) return <p>Loading...</p>;
    if (error) return <p className="text-error">{error}</p>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4 mt-2">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <StatusBadge label="IDENTITAS INDUK & ENROLLMENT TAHUNAN" tone="primary" />
                        {selectedAcademicYear && (
                            <StatusBadge label={`TA ${selectedAcademicYear.name}`} tone="success" />
                        )}
                    </div>
                    <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
                        Data Santri & Enrollment
                    </h1>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Identitas induk santri terpisah dari penempatan kelas tahunan (`student_enrollments`). Klik nama santri untuk melihat linimasa progres & riwayat kelas.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv,.xlsx,.xls" className="hidden" />
                    
                    <ActionDropdown label="Export Data" icon={<Download size={14}/>}>
                        <button onClick={() => exportToExcel(filteredData, 'Data_Santri')} className="flex items-center w-full px-5 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                            <FileSpreadsheet size={16} className="mr-3 text-green-600"/> Export Excel
                        </button>
                        <button onClick={handleExportPDF} className="flex items-center w-full px-5 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100">
                            <FileText size={16} className="mr-3 text-red-600"/> Export PDF
                        </button>
                    </ActionDropdown>
                    
                    <ActionDropdown label="Import Data" icon={<Upload size={14}/>}>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-5 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                            <FileSpreadsheet size={16} className="mr-3 text-green-600"/> Upload File Excel/CSV
                        </button>
                        <button onClick={handleDownloadTemplate} className="flex items-center w-full px-5 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100">
                            <Download size={16} className="mr-3 text-blue-600"/> Download Template
                        </button>
                    </ActionDropdown>
                    
                    <button 
                        onClick={() => openModal(null)} 
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-5 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all hover:bg-blue-700 hover:-translate-y-0.5 gap-2"
                    >
                        <Plus size={16} strokeWidth={2.5}/> Tambah Data
                    </button>
                </div>
            </div>

            {/* Banner Kesiapan Enrollment Tahun Ajaran Aktif */}
            <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${unenrolledCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'}`}>
                <div className="flex items-center gap-3">
                    <StatusBadge
                        label={unenrolledCount > 0 ? `${unenrolledCount} BELUM TER-ENROLL` : 'ENROLLMENT LENGKAP'}
                        tone={unenrolledCount > 0 ? 'warning' : 'success'}
                    />
                    <span className="text-xs font-medium">
                        {unenrolledCount > 0
                            ? `Terdapat ${unenrolledCount} santri aktif yang belum memiliki penempatan kelas pada Tahun Ajaran ${selectedAcademicYear?.name || 'ini'}.`
                            : `Seluruh ${enrolledIdSet.size} santri aktif telah memiliki penempatan kelas pada Tahun Ajaran ${selectedAcademicYear?.name || 'ini'}.`}
                    </span>
                </div>
                {unenrolledCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setFilterUnenrolledOnly((prev) => !prev)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            filterUnenrolledOnly
                                ? 'bg-amber-900 text-white border-amber-900'
                                : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                        }`}
                    >
                        {filterUnenrolledOnly ? 'Tampilkan Semua Santri' : 'Filter Belum Ter-enroll'}
                    </button>
                )}
            </div>

            {/* Content Wrap */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {/* Filters */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex flex-col md:flex-row gap-5 items-center justify-between">
                        <div className="w-full md:w-1/3 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Cari nama / ID santri..."
                                value={filterSearch} 
                                onChange={e => setFilterSearch(e.target.value)} 
                                className="w-full pl-11 pr-4 h-11 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-[13px] font-semibold transition-all shadow-sm placeholder:text-slate-400"
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                            <div className="relative flex-shrink-0 group flex items-center">
                                <div className="relative">
                                    <select 
                                        value={filterMarhalah} 
                                        onChange={e => {setFilterMarhalah(e.target.value as any); setFilterKelas('all')}}
                                        className="w-full sm:w-[180px] h-11 pl-4 pr-10 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-[13px] font-semibold text-slate-700 transition-all shadow-sm appearance-none cursor-pointer hover:border-slate-300"
                                    >
                                        <option value="all">Semua Marhalah</option>
                                        {masterMarhalahs.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronRight size={16} className="rotate-90"/>
                                    </div>
                                </div>
                            </div>
                            <div className="relative flex-shrink-0 group flex items-center">
                                <div className="relative">
                                    <select 
                                        value={filterKelas} 
                                        onChange={e => setFilterKelas(e.target.value)} 
                                        disabled={filterMarhalah === 'all'} 
                                        className="w-full sm:w-[150px] h-11 pl-4 pr-10 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-[13px] font-semibold text-slate-700 transition-all shadow-sm appearance-none cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none hover:border-slate-300"
                                    >
                                        <option value="all">Semua Kelas</option>
                                        {filterMarhalah !== 'all' && availableFilterKelas.map(k => <option key={k} value={k}>{k}</option>)}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronRight size={16} className="rotate-90"/>
                                    </div>
                                </div>
                            </div>

                            <div className="relative flex-shrink-0 group flex items-center">
                                <div className="relative">
                                    <select 
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value)}
                                        className="w-full sm:w-[150px] h-11 pl-4 pr-10 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-[13px] font-semibold text-slate-700 transition-all shadow-sm appearance-none cursor-pointer hover:border-slate-300"
                                    >
                                        <option value="active">Aktif</option>
                                        <option value="inactive">Tidak Aktif</option>
                                        <option value="all">Semua Status</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronRight size={16} className="rotate-90"/>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto bg-white min-h-[400px] hide-scrollbar">
                                        <table className="w-full min-w-max text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200/60">
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 w-12 text-center">No</th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 w-16 text-center border-l border-slate-100"><div onClick={() => handleSort('id')} className="flex items-center justify-center gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>ID</span>{getSortIcon('id')}</div></th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 min-w-[200px] border-l border-slate-100"><div onClick={() => handleSort('nama')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>Nama Santri</span>{getSortIcon('nama')}</div></th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 min-w-[140px]"><div onClick={() => handleSort('marhalah_kelas')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>Marhalah & Kelas</span>{getSortIcon('marhalah_kelas')}</div></th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 text-center w-24"><div onClick={() => handleSort('status')} className="flex items-center gap-1.5 justify-center group cursor-pointer hover:text-slate-600 transition-colors"><span>Status Santri</span>{getSortIcon('status')}</div></th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 min-w-[160px]"><div onClick={() => handleSort('nama_wali')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>Nama Wali</span>{getSortIcon('nama_wali')}</div></th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 min-w-[140px]"><div onClick={() => handleSort('no_hp_wali')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>No HP Wali</span>{getSortIcon('no_hp_wali')}</div></th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 text-center min-w-[140px]"><div onClick={() => handleSort('telegram_chat_id')} className="flex items-center gap-1.5 justify-center group cursor-pointer hover:text-slate-600 transition-colors"><span>ID Chat Telegram</span>{getSortIcon('telegram_chat_id')}</div></th>
                                <th className="px-5 py-3 text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 text-right w-24">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/80">
                            {paginatedData.map((s, idx) => (
                                <tr key={s.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4 text-[12px] font-medium text-slate-500 text-center">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-[12px] font-medium text-slate-400 text-center group-hover:text-blue-500 transition-colors">#{s.id}</td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 cursor-pointer" onClick={() => openDetailTimeline(s)}>
                                        <div className="flex items-center gap-4">
                                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shadow-sm">
                                                <span className="text-[12px] font-extrabold text-blue-600">
                                                    {s.nama.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{s.nama}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {s.kode && <span className="text-[11px] font-medium text-slate-500">NIS: {s.kode}</span>}
                                                    {!enrolledIdSet.has(s.id) && (
                                                        <StatusBadge label="BELUM ENROLL TA AKTIF" tone="warning" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80">
                                        <div className="flex flex-col gap-1">
                                            <span className="inline-flex self-start items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-widest"><MarhalahLabel text={s.marhalah} id={s.marhalah_id} /></span>
                                            <span className="text-[13px] font-bold text-slate-700">Kelas <KelasLabel text={s.kelas} id={s.kelas_id} /></span>
                                        </div>
                                    </td>
                                    
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${(s.status || 'active') === 'active' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                                            {(s.status || 'active') === 'active' ? 'Aktif' : 'Tidak Aktif'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80">
                                        {s.nama_wali ? (
                                            <span className="text-[13px] font-bold text-slate-700">{s.nama_wali}</span>
                                        ) : (
                                            <span className="text-[12px] italic text-slate-400 font-medium">Belum ada data</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80">
                                        {s.no_hp_wali ? (
                                            <button onClick={(e) => { e.stopPropagation(); handleWA(s.no_hp_wali!); }} className="inline-flex items-center text-[11px] font-bold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-md hover:bg-green-100 transition-colors tracking-wide border border-green-200/60 shadow-sm">
                                                <Send size={12} className="mr-1.5" strokeWidth={2.5}/> {s.no_hp_wali}
                                            </button>
                                        ) : (
                                            <span className="text-[12px] italic text-slate-400 font-medium">Belum ada data</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-center" onClick={(e) => e.stopPropagation()}>
                                        {s.telegram_chat_id ? (
                                            <span className="text-[13px] font-semibold text-slate-700">
                                                {s.telegram_chat_id}
                                            </span>
                                        ) : (
                                            <span className="text-[12px] italic text-slate-400 font-medium">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-right">
                                        <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openDetailTimeline(s)}
                                                className="px-2.5 h-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-200 text-[11px] font-bold transition-all shadow-sm"
                                                title="Lihat Linimasa & Riwayat Enrollment"
                                            >
                                                Linimasa
                                            </button>
                                            <button onClick={() => openModal(s)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm">
                                                <Edit size={14} strokeWidth={2.5}/>
                                            </button>
                                            <button onClick={() => handleDelete(s.id)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                                                <Trash size={14} strokeWidth={2.5}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="text-center py-16 text-[13px] text-slate-500 font-medium">
                                        Tidak ada data yang ditemukan.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center bg-slate-50/50 border-t border-slate-100 p-5 px-6">
                        <p className="text-[13px] font-medium text-slate-500">
                            Menampilkan <span className="font-bold text-slate-700">{((currentPage - 1) * itemsPerPage) + 1}</span> - <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> dari <span className="font-bold text-slate-700">{filteredData.length}</span> data
                        </p>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 border border-slate-200/80 bg-white rounded-xl text-[13px] font-bold disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all focus:ring-4 focus:ring-slate-100 shadow-sm"
                            >
                                Sebelumnya
                            </button>
                            <span className="px-4 py-2 text-[13px] font-bold text-slate-700 bg-white border border-slate-200/80 rounded-xl shadow-sm flex items-center justify-center min-w-[3rem]">
                                {currentPage} / {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 border border-slate-200/80 bg-white rounded-xl text-[13px] font-bold disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all focus:ring-4 focus:ring-slate-100 shadow-sm"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPerson ? "Edit Santri" : "Tambah Santri"}>
                <div className="space-y-5">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Kode / NIS</label>
                            <input type="text" placeholder="Masukkan NIS" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.kode} onChange={e => setFormData({...formData, kode: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nama Lengkap <span className="text-red-500">*</span></label>
                            <input type="text" placeholder="Nama Lengkap" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Marhalah <span className="text-red-500">*</span></label>
                                <select 
                                    className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer" 
                                    value={formData.marhalah} 
                                    onChange={e => {
                                        const newMarhalah = e.target.value;
                                        const targetM = masterMarhalahs?.find((m: any) => m.nama === newMarhalah);
                                        let availableForNew = targetM
                                            ? masterKelasRelasi?.filter((k: any) => k.marhalah_id === targetM.id).map((k: any) => k.nama_kelas)
                                            : [];
                                        if (!availableForNew || availableForNew.length === 0) {
                                            availableForNew = masterKelas?.filter(m => m.marhalah === newMarhalah).map(m => m.nama_kelas) || [];
                                        }
                                        setFormData({
                                            ...formData, 
                                            marhalah: newMarhalah, 
                                            kelas: availableForNew[0] || ''
                                        });
                                    }}
                                >
                                    {masterMarhalahs?.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Kelas <span className="text-red-500">*</span></label>
                                <select 
                                    className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer" 
                                    value={formData.kelas} 
                                    onChange={e => setFormData({...formData, kelas: e.target.value})}
                                >
                                    {availableFormKelas.length === 0 && <option value="">Tidak ada kelas (atur di Pengaturan)</option>}
                                    {availableFormKelas.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div className="border-t border-slate-200/80 pt-5 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                            <p className="text-[12px] font-extrabold text-slate-700 uppercase tracking-wider">Data Wali</p>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nama Wali</label>
                            <input type="text" placeholder="Nama Wali Santri" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.nama_wali} onChange={e => setFormData({...formData, nama_wali: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">No HP / WhatsApp</label>
                            <input type="text" placeholder="08xxxxxxxxxx" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.no_hp_wali} onChange={e => setFormData({...formData, no_hp_wali: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Telegram Chat ID</label>
                            <input type="text" placeholder="Contoh: 123456789" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.telegram_chat_id} onChange={e => setFormData({...formData, telegram_chat_id: e.target.value})} />
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-4 bg-orange-500 rounded-full"></div>
                            <p className="text-[12px] font-extrabold text-slate-700 uppercase tracking-wider">Status Santri</p>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Status <span className="text-red-500">*</span></label>
                            <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer appearance-none" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                                <option value="active">Aktif</option>
                                <option value="inactive">Tidak Aktif</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="flex justify-end pt-6 gap-3 border-t border-slate-200/80">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-all shadow-[0_2px_12px_rgba(37,99,235,0.25)] focus:ring-4 focus:ring-blue-500/20 flex items-center justify-center min-w-[120px]">
                            {isSubmitting ? (
                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div> Menyimpan...</>
                            ) : 'Simpan Data'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal Linimasa Progres & Riwayat Enrollment Santri */}
            <Modal
                isOpen={Boolean(detailSantri)}
                onClose={() => {
                    setDetailSantri(null);
                    if (studentId) navigate('/app/students', { replace: true });
                }}
                title={`Profil Induk & Linimasa Santri — ${detailSantri?.nama || ''}`}
            >
                {detailSantri && (
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-slate-900">{detailSantri.nama}</div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    ID #{detailSantri.id} • NIS: {detailSantri.kode || '-'} • Wali: {detailSantri.nama_wali || '-'}
                                </div>
                            </div>
                            <StatusBadge
                                label={(detailSantri.status || 'active') === 'active' ? 'SANTRI AKTIF' : 'NON-AKTIF'}
                                tone={(detailSantri.status || 'active') === 'active' ? 'success' : 'neutral'}
                            />
                        </div>

                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                                1. Riwayat Enrollment Tahunan (Penempatan Kelas)
                            </h4>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                                        <tr>
                                            <th className="px-3.5 py-2">Tahun Ajaran</th>
                                            <th className="px-3.5 py-2">Marhalah</th>
                                            <th className="px-3.5 py-2">Kelas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {studentEnrollmentHistory.map((row: any) => {
                                            const ayObj = (academicYears || []).find((a) => a.id === row.academic_year_id);
                                            return (
                                                <tr key={row.id || row.academic_year_id}>
                                                    <td className="px-3.5 py-2 font-semibold text-slate-800">
                                                        {ayObj?.name || `TA #${row.academic_year_id}`}
                                                    </td>
                                                    <td className="px-3.5 py-2 text-slate-600">{row.marhalah}</td>
                                                    <td className="px-3.5 py-2 font-bold text-blue-700">Kelas {row.kelas}</td>
                                                </tr>
                                            );
                                        })}
                                        {studentEnrollmentHistory.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-3.5 py-4 text-center text-slate-400">
                                                    Penempatan aktif saat ini: {detailSantri.marhalah} — Kelas {detailSantri.kelas}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                                2. Keanggotaan Halaqah & Ringkasan Setoran
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                                    <div className="text-[11px] font-semibold text-slate-500 uppercase">Halaqah Binaan</div>
                                    <div className="text-xs font-bold text-slate-900 mt-1">
                                        {(halaqah || [])
                                            .filter((h) => (h.active_santri || h.santri).some((st) => st.id === detailSantri.id))
                                            .map((h) => `${h.nama} (${h.musammi?.nama || '-'})`)
                                            .join(', ') || 'Belum tergabung di halaqah aktif'}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                                    <div className="text-[11px] font-semibold text-slate-500 uppercase">Transaksi Setoran Tercatat</div>
                                    <div className="text-xs font-bold text-slate-900 mt-1">
                                        {(setoranHarian || []).filter((st: any) => st.santri_id === detailSantri.id).length} kali setoran pada periode aktif
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={() => {
                                    const target = detailSantri;
                                    setDetailSantri(null);
                                    if (studentId) navigate('/app/students', { replace: true });
                                    openModal(target);
                                }}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                            >
                                Edit Santri / Penempatan Kelas
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDetailSantri(null);
                                    if (studentId) navigate('/app/students', { replace: true });
                                }}
                                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default SantriPage;
