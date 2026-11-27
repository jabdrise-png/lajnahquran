// Dipecah otomatis dari SantriPage.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen SantriPage.
// Ubah perilaku di sini; tampilan ada di SantriPage.tsx.
import { tampilKode } from '../../lib/telegramPesan';
import { PeringatanLangganan } from '../../components/LanggananLembaga';
import { arahSantri } from '../../lib/arahHafalan';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import { useSupabaseData, useRiwayat } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { Marhalah, Santri } from '../../types';
import { Plus, Trash, Upload, Download, Search, Edit, FileText, FileSpreadsheet, ChevronRight, Send, Link as LinkIcon, ListFilter, ArrowUpDown } from 'lucide-react';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { StatusBadge, LoadingState } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';


/** Terima tanggal "2012-05-01", "01/05/2012", atau angka tanggal Excel. */
export const normalizeTanggal = (v: any): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const t = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export function useSantriPageLogika() {
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
    useRiwayat({ aktif: Boolean(detailSantri) }); // Fase 7: jumlah setoran di detail santri butuh riwayat
    const [studentEnrollmentHistory, setStudentEnrollmentHistory] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        nama: '', kode: '', marhalah: '', 
        kelas: '',
        nama_wali: '', no_hp_wali: '', status: 'active', telegram_chat_id: '',
        tanggal_lahir: '', asal: '', arah_hafalan: 'maju'
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
            // Fase 2: riwayat kelas hanya dari student_enrollments
            const { data: v2Data, error: v2Err } = await (supabase.from('student_enrollments' as any) as any)
                .select('*')
                .eq('organization_id', orgId)
                .eq('student_id', person.id)
                .order('academic_year_id', { ascending: false });
            if (v2Err) throw v2Err;

            const mergedByAy = new Map<number, any>();
            (v2Data || []).forEach((row) => {
                const ayId = Number(row.academic_year_id);
                const prev = mergedByAy.get(ayId);
                const mObj = (masterMarhalahs || []).find((m) => Number(m.id) === Number(row.master_marhalah_id));
                const kObj = (masterKelasRelasi || []).find((k) => Number(k.id) === Number(row.master_kelas_id));
                mergedByAy.set(ayId, {
                    ...prev,
                    ...row,
                    marhalah: row.marhalah || mObj?.nama || prev?.marhalah || person.marhalah,
                    kelas: row.kelas || kObj?.nama_kelas || prev?.kelas || person.kelas,
                    status: row.status || row.enrollment_status || 'active',
                });
            });

            setStudentEnrollmentHistory(
                Array.from(mergedByAy.values()).sort((a, b) => Number(b.academic_year_id) - Number(a.academic_year_id))
            );
        } catch (err: any) {
            NotificationStore.addNotification(`Gagal memuat riwayat enrollment: ${err.message}`, 'error');
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
        const targetMarhalah = masterMarhalahs?.find((m) => m.nama === filterMarhalah);
        if (targetMarhalah) {
            const relasiClasses = masterKelasRelasi
                ?.filter((k) => k.marhalah_id === targetMarhalah.id)
                .map((k) => k.nama_kelas);
            if (relasiClasses && relasiClasses.length > 0) return Array.from(new Set(relasiClasses));
        }
        return Array.from(new Set(masterKelas?.filter(m => m.marhalah === filterMarhalah).map(m => m.nama_kelas) || []));
    }, [filterMarhalah, masterMarhalahs, masterKelasRelasi, masterKelas]);

    const availableFormKelas = useMemo(() => {
        if (!formData.marhalah) return [];
        const targetMarhalah = masterMarhalahs?.find((m) => m.nama === formData.marhalah);
        if (targetMarhalah) {
            const relasiClasses = masterKelasRelasi
                ?.filter((k) => k.marhalah_id === targetMarhalah.id)
                .map((k) => k.nama_kelas);
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
            result.sort((a, b) => {
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
                telegram_chat_id: person.telegram_chat_id || '',
                tanggal_lahir: (person as any).tanggal_lahir || '',
                asal: (person as any).asal || '',
                arah_hafalan: arahSantri(person.arah_hafalan)
            });
        } else {
            const initialMarhalah = masterMarhalahs?.length > 0 ? masterMarhalahs[0].nama : (globalMarhalahs?.[0] || 'Mutawassithah');
            const targetMarhalah = masterMarhalahs?.find((m) => m.nama === initialMarhalah);
            let initialClasses = targetMarhalah
                ? masterKelasRelasi?.filter((k) => k.marhalah_id === targetMarhalah.id).map((k) => k.nama_kelas)
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
                telegram_chat_id: '',
                tanggal_lahir: '',
                asal: '',
                arah_hafalan: 'maju'
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.nama) {
            NotificationStore.addNotification("Nama wajib diisi", "error");
            return;
        }
        // Fase 2: NIS wajib (juga dijaga database)
        if (!formData.kode.trim()) {
            NotificationStore.addNotification("NIS wajib diisi", "error");
            return;
        }
        if (formData.tanggal_lahir && formData.tanggal_lahir > new Date().toISOString().slice(0, 10)) {
            NotificationStore.addNotification("Tanggal lahir tidak boleh di masa depan", "error");
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
            
            const m_id = masterMarhalahs?.find((m) => m.nama === formData.marhalah)?.id || null;
            const k_id = masterKelasRelasi?.find((k) => k.nama_kelas === finalKelas && (!m_id || k.marhalah_id === m_id))?.id || null;

            const legacyEnumList = ['Mutawassithah', 'Aliyah', 'Jamiah'];
            const safeLegacyMarhalah = legacyEnumList.includes(formData.marhalah) ? formData.marhalah : 'Mutawassithah';

            const payload: any = {
                marhalah_id: m_id,
                kelas_id: k_id,
                organization_id: orgId,
                nama: formData.nama,
                marhalah: formData.marhalah,
                kelas: finalKelas,
                kode: formData.kode.trim(),
                nama_wali: formData.nama_wali || null,
                no_hp_wali: formData.no_hp_wali || null,
                telegram_chat_id: formData.telegram_chat_id || null,
                status: formData.status,
                tanggal_lahir: formData.tanggal_lahir || null,
                asal: formData.asal.trim() || null,
                arah_hafalan: arahSantri(formData.arah_hafalan)
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

            // Penulisan kanonikal ke student_enrollments V2 (sinkron otomatis ke student_classes)
            if (santriId && selectedAcademicYear) {
                const enrollmentStatus = formData.status === 'active' ? 'active' : 'withdrawn';
                const { error: enrollErr } = await (supabase.from('student_enrollments' as any) as any).upsert(
                    {
                        organization_id: orgId,
                        student_id: santriId,
                        santri_id: santriId,
                        academic_year_id: selectedAcademicYear.id,
                        master_marhalah_id: m_id || null,
                        master_kelas_id: k_id || null,
                        marhalah: formData.marhalah,
                        kelas: finalKelas,
                        status: enrollmentStatus,
                        enrollment_status: enrollmentStatus,
                        enrolled_at: new Date().toISOString().split('T')[0],
                        left_at: enrollmentStatus === 'active' ? null : new Date().toISOString().split('T')[0],
                    },
                    { onConflict: 'organization_id,student_id,academic_year_id' }
                );
                if (enrollErr) throw enrollErr;
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
        const sampleKelas = masterKelasRelasi?.find((k) => !sampleMarhalah || k.marhalah_id === sampleMarhalah.id);

        const dummyData = [
            {
                'Nama Santri': 'Abdullah Pratama',
                'ID Marhalah': sampleMarhalah ? sampleMarhalah.id : 1,
                'Nama Marhalah': sampleMarhalah ? sampleMarhalah.nama : 'Ulya',
                'ID Kelas': sampleKelas ? sampleKelas.id : 101,
                'Nama Kelas': sampleKelas ? sampleKelas.nama_kelas : '10-A',
                'NIS / Kode': 'S001',
                'Tanggal Lahir': '2012-05-01',
                'Asal': 'Bogor',
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
                'Tanggal Lahir': '2011-11-20',
                'Asal': 'Bandung',
                'Nama Wali': 'Tsabit',
                'No HP Wali': '08129876543'
            }
        ];

        // Guide / Reference data for Sheet 2
        const guideMarhalahRows = (masterMarhalahs || []).map((m) => ({
            'Tipe': 'Marhalah',
            'ID': m.id,
            'Nama': m.nama,
            'Keterangan': 'Gunakan ID atau Nama ini di kolom Marhalah'
        }));

        const guideKelasRows = (masterKelasRelasi || []).map((k) => {
            const m = masterMarhalahs?.find((mar) => mar.id === k.marhalah_id);
            return {
                'Tipe': 'Kelas',
                'ID': k.id,
                'Nama': k.nama_kelas,
                'Keterangan': `Kelas untuk Marhalah: ${m ? m.nama : 'Semua'}`
            };
        });

        const guideData = [...guideMarhalahRows, ...guideKelasRows];

        // Fase 7: template 2 lembar dengan exceljs (dimuat saat dipakai)
        import('../../lib/excel').then(({ unduhExcel }) => unduhExcel([
            { nama: 'Data Santri', data: dummyData, lebar: [25, 14, 18, 12, 16, 14, 22, 16] },
            {
                nama: 'Panduan Master ID',
                data: guideData.length > 0 ? guideData : [
                    { 'Tipe': 'Info', 'ID': '-', 'Nama': '-', 'Keterangan': 'Belum ada data master marhalah/kelas di Pengaturan.' }
                ],
                lebar: [12, 10, 22, 45],
            },
        ], 'template_import_santri.xlsx')).catch(() => NotificationStore.addNotification('Gagal membuat template Excel.', 'error'));
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
                    resolvedMarhalah = masterMarhalahs?.find((m) => m.id === parsedMId);
                }

                if (!resolvedMarhalah && rawMNama) {
                    resolvedMarhalah = masterMarhalahs?.find((m) => 
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
                    resolvedKelas = masterKelasRelasi?.find((k) => k.id === parsedKId);
                }

                if (!resolvedKelas && rawKNama) {
                    // Find class by name and ensure it belongs to the matched marhalah
                    resolvedKelas = masterKelasRelasi?.find((k) => 
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
                    tanggal_lahir: normalizeTanggal(row['tanggal lahir'] || row.tanggal_lahir) || null,
                    asal: (row['asal'] || row.asal || '')?.toString().trim() || null,
                    status: 'active'
                };
                if (!payload.kode) {
                    errors.push(`Baris ${rowNum} (${nama}): NIS wajib diisi.`);
                    continue;
                }
                
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
                        const { error: enrollErr } = await (supabase.from('student_enrollments' as any) as any).upsert(
                            {
                                organization_id: orgId,
                                student_id: newSantri.id,
                                santri_id: newSantri.id,
                                academic_year_id: selectedAcademicYear.id,
                                master_marhalah_id: m_id || null,
                                master_kelas_id: k_id || null,
                                marhalah: m_nama,
                                kelas: k_nama,
                                status: 'active',
                                enrollment_status: 'active',
                                enrolled_at: new Date().toISOString().split('T')[0],
                            },
                            { onConflict: 'organization_id,student_id,academic_year_id' }
                        );
                        if (enrollErr) {
                            errors.push(`Baris ${rowNum} (${nama}): Gagal membuat enrollment (${enrollErr.message})`);
                        }
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
  return { studentId, navigate, handleWA, allSantri, santri, halaqah, setoranHarian, fetchData, loading, error, getOrgId, masterKelas, globalMarhalahs, masterMarhalahs, masterKelasRelasi, selectedAcademicYear, academicYears, isModalOpen, setIsModalOpen, isSubmitting, setIsSubmitting, editingPerson, setEditingPerson, detailSantri, setDetailSantri, studentEnrollmentHistory, setStudentEnrollmentHistory, formData, setFormData, filterMarhalah, setFilterMarhalah, filterKelas, setFilterKelas, filterSearch, setFilterSearch, filterStatus, setFilterStatus, filterUnenrolledOnly, setFilterUnenrolledOnly, sortConfig, setSortConfig, handleSort, getSortIcon, fileInputRef, currentPage, setCurrentPage, itemsPerPage, activeSantri, enrolledIdSet, unenrolledCount, openDetailTimeline, availableFilterKelas, availableFormKelas, filteredData, paginatedData, totalPages, openModal, handleSubmit, handleDelete, handleDownloadTemplate, handleImportCSV, handleExportPDF };
}

export type SantriPageLogika = ReturnType<typeof useSantriPageLogika>;
