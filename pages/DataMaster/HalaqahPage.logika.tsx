// Dipecah otomatis dari HalaqahPage.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen HalaqahPage.
// Ubah perilaku di sini; tampilan ada di HalaqahPage.tsx.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import SantriMultiSelect from '../../components/SantriMultiSelect';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { HalaqahType, Marhalah, Waktu, Halaqah, Santri } from '../../types';
import {   Plus, Trash, Users, Edit, ArrowLeft, X, Search, Upload, Download, FileSpreadsheet, FileText, Save, CheckSquare, Square, Clock, ChevronDown, Hash, Check, ChevronRight, RefreshCw , Calendar  } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { StatusBadge, LoadingState } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';
import { WaktuDropdown, SearchableMusammiSelect } from './HalaqahPage.pilihan';
export * from './HalaqahPage.pilihan';

export function useHalaqahPageLogika() {
    const location = useLocation();
    const { halaqahId } = useParams<{ halaqahId?: string }>();
    const { halaqah, musammi, santri, addHalaqah, deleteHalaqah, deleteHalaqahBatch, restoreHalaqah, updateHalaqah, addSantriToHalaqah, keluarkanSantri, mutasiSantri, assignHalaqahMusammi, fetchData, loading, error, getOrgId, globalMarhalahs, globalJenisHalaqah, globalWaktuHalaqah, masterMarhalahs, masterKelasRelasi } = useSupabaseData();
    const { selectedAcademicYear } = useAcademicYear();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // State
    const [activeViewTab, setActiveViewTab] = useState<'groups' | 'schedule'>(() =>
        location.pathname.includes('/schedule') ? 'schedule' : 'groups'
    );
    const [selectedHalaqah, setSelectedHalaqah] = useState<Halaqah | null>(null);
    const [modalType, setModalType] = useState<'create' | 'edit' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (location.pathname.includes('/schedule')) {
            setActiveViewTab('schedule');
        }
    }, [location.pathname]);

    useEffect(() => {
        if (halaqahId && halaqah.length > 0) {
            const target = halaqah.find((h) => String(h.id) === String(halaqahId));
            if (target) setSelectedHalaqah(target);
        }
    }, [halaqahId, halaqah]);
    
    // Manage Status State
    const [manageStatusModalOpen, setManageStatusModalOpen] = useState(false);
    const [manageStatusType, setManageStatusType] = useState<'mutasi' | 'keluar'>('mutasi');
    const [manageSantriId, setManageSantriId] = useState<number | null>(null);
    const [manageTargetHalaqahId, setManageTargetHalaqahId] = useState<string>('');
    const [manageDate, setManageDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Detail Tab State & Historical Roster Date Filter (Fase 4 Section 4)
    const [showRiwayat, setShowRiwayat] = useState(false);
    const [rosterAsOfDate, setRosterAsOfDate] = useState<string>('');

    // Musammi Assignment Modal State (Primary & Substitute - Fase 4 Section 5)
    const [musammiModalOpen, setMusammiModalOpen] = useState(false);
    const [musammiAssignType, setMusammiAssignType] = useState<'primary' | 'substitute'>('substitute');
    const [musammiAssignId, setMusammiAssignId] = useState<string>('');
    const [musammiValidFrom, setMusammiValidFrom] = useState<string>(new Date().toISOString().split('T')[0]);
    const [musammiValidTo, setMusammiValidTo] = useState<string>('');
    const [musammiAssignNotes, setMusammiAssignNotes] = useState<string>('');

    // Bulk Selection & Pagination State
    const [selectedHalaqahIds, setSelectedHalaqahIds] = useState<number[]>([]);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 25;

    // Archive filter
    const [filterStatus, setFilterStatus] = useState<'Aktif' | 'Diarsipkan' | 'Semua'>('Aktif');

    // Form
    const [newHalaqahName, setNewHalaqahName] = useState('');
    const [noUrut, setNoUrut] = useState<number>(999);
    const [selectedMusammiId, setSelectedMusammiId] = useState('');
    const [selectedJenis, setSelectedJenis] = useState<string>('');
    const [selectedMarhalah, setSelectedMarhalah] = useState<string>('');
    const [selectedWaktu, setSelectedWaktu] = useState<string[]>([]); 
    const [selectedSantriIds, setSelectedSantriIds] = useState<number[]>([]);
    
    // Custom Type
    const [isCustomJenis, setIsCustomJenis] = useState(false);
    const [customJenisName, setCustomJenisName] = useState('');

    // Filters
    const [filterJenis, setFilterJenis] = useState<string>('all');
    const [filterMarhalah, setFilterMarhalah] = useState<string | 'all'>('all');
    const [filterSearch, setFilterSearch] = useState('');

    const availableTypes = useMemo(() => {
        const types = new Set<string>([...globalJenisHalaqah]);
        halaqah.forEach(h => { if(h.jenis) types.add(h.jenis); });
        return Array.from(types).sort();
    }, [halaqah, globalJenisHalaqah]);

    // Deteksi Bentrok Jadwal Otomatis (Musammi & Santri di Waktu Sesi yang Sama)
    const scheduleAnalysis = useMemo(() => {
        const activeHalaqahs = halaqah.filter((h) => h.is_active !== false);
        const timeSlots = globalWaktuHalaqah.length > 0 ? globalWaktuHalaqah : ['Shubuh', 'Dhuha', 'Ashar', 'Maghrib', 'Isya'];

        const musammiConflicts: { waktu: string; musammiName: string; halaqahNames: string[] }[] = [];
        const santriConflicts: { waktu: string; santriName: string; halaqahNames: string[] }[] = [];
        const bySlot: Record<string, Halaqah[]> = {};

        timeSlots.forEach((slot) => {
            const groupsInSlot = activeHalaqahs.filter((h) => (h.waktu || []).includes(slot as Waktu));
            bySlot[slot] = groupsInSlot;

            // Cek bentrok Musammi
            const musammiMap = new Map<number, { name: string; groups: string[] }>();
            // Cek bentrok Santri
            const santriMap = new Map<number, { name: string; groups: string[] }>();

            groupsInSlot.forEach((g) => {
                if (g.musammi?.id) {
                    const existing = musammiMap.get(g.musammi.id) || { name: g.musammi.nama, groups: [] };
                    if (!existing.groups.includes(g.nama)) existing.groups.push(g.nama);
                    musammiMap.set(g.musammi.id, existing);
                }
                (g.substitute_musammi || []).forEach((sub) => {
                    if (sub?.id) {
                        const existingSub = musammiMap.get(sub.id) || { name: `${sub.nama} (Pengganti)`, groups: [] };
                        if (!existingSub.groups.includes(g.nama)) existingSub.groups.push(g.nama);
                        musammiMap.set(sub.id, existingSub);
                    }
                });
                (g.active_santri || g.santri || []).forEach((s) => {
                    const existingS = santriMap.get(s.id) || { name: s.nama, groups: [] };
                    if (!existingS.groups.includes(g.nama)) existingS.groups.push(g.nama);
                    santriMap.set(s.id, existingS);
                });
            });

            musammiMap.forEach((val) => {
                if (val.groups.length > 1) {
                    musammiConflicts.push({ waktu: slot, musammiName: val.name, halaqahNames: val.groups });
                }
            });
            santriMap.forEach((val) => {
                if (val.groups.length > 1) {
                    santriConflicts.push({ waktu: slot, santriName: val.name, halaqahNames: val.groups });
                }
            });
        });

        return {
            timeSlots,
            bySlot,
            musammiConflicts,
            santriConflicts,
            totalConflicts: musammiConflicts.length + santriConflicts.length,
        };
    }, [halaqah, globalWaktuHalaqah]);

    // Initial value setting for create flow
    useEffect(() => {
        if (modalType === 'create') {
            setSelectedMarhalah(globalMarhalahs[0] || '');
            setSelectedJenis(availableTypes[0] || '');
            if (globalWaktuHalaqah.length > 0) {
                // Determine implicit defaults based on time if possible, or just the first time
                setSelectedWaktu([globalWaktuHalaqah[0]]);
            }
        }
    }, [modalType, availableTypes, globalWaktuHalaqah]);

    const filteredHalaqah = useMemo(() => {
        return halaqah.filter(h => {
            if (filterStatus === 'Aktif' && h.is_active === false) return false;
            if (filterStatus === 'Diarsipkan' && h.is_active !== false) return false;
            if (filterJenis !== 'all' && h.jenis !== filterJenis) return false;
            if (filterMarhalah !== 'all') {
                const targetMarhalahId = masterMarhalahs?.find((m) => m.nama === filterMarhalah)?.id;
                if (h.marhalah !== filterMarhalah && h.marhalah_id !== targetMarhalahId) return false;
            }
            if (filterSearch && !h.nama.toLowerCase().includes(filterSearch.toLowerCase()) && !h.musammi.nama.toLowerCase().includes(filterSearch.toLowerCase())) return false;
            return true;
        }).sort((a,b) => {
            // Sort: No Urut (Primary) -> Jenis -> Marhalah -> Nama
            if ((a.no_urut || 999) !== (b.no_urut || 999)) return (a.no_urut || 999) - (b.no_urut || 999);
            if (a.jenis !== b.jenis) return (a.jenis || '').localeCompare(b.jenis || '');
            const marhalahOrder = globalMarhalahs;
            const mIdxA = marhalahOrder.indexOf(a.marhalah);
            const mIdxB = marhalahOrder.indexOf(b.marhalah);
            if (mIdxA !== mIdxB) return mIdxA - mIdxB;
            return (a.nama || '').localeCompare(b.nama || '');
        });
    }, [halaqah, filterJenis, filterMarhalah, filterSearch, filterStatus]);

    // Reset selection & page when filters change
    useEffect(() => {
        setSelectedHalaqahIds([]);
        setCurrentPage(1);
    }, [filterJenis, filterMarhalah, filterSearch, filterStatus]);

    const totalPages = Math.max(1, Math.ceil(filteredHalaqah.length / itemsPerPage));
    const paginatedHalaqah = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredHalaqah.slice(start, start + itemsPerPage);
    }, [filteredHalaqah, currentPage]);

    // Santri list for selection
    const availableSantri = useMemo(() => {
        const targetMarhalah = (modalType === 'edit' && selectedHalaqah) ? selectedMarhalah : selectedMarhalah;
        return santri.filter(s => s.marhalah === targetMarhalah);
    }, [santri, modalType, selectedMarhalah, selectedHalaqah]);

    // --- BULK ACTION HANDLERS ---
    
    const toggleSelectAll = () => {
        if (selectedHalaqahIds.length === filteredHalaqah.length && filteredHalaqah.length > 0) {
            setSelectedHalaqahIds([]);
        } else {
            setSelectedHalaqahIds(filteredHalaqah.map(h => h.id));
        }
    };

    const toggleSelectRow = (id: number) => {
        setSelectedHalaqahIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedHalaqahIds.length === 0) return;
        setIsSubmitting(true);
        try {
            await deleteHalaqahBatch(selectedHalaqahIds);
            setSelectedHalaqahIds([]);
            NotificationStore.addNotification("Data halaqah berhasil diarsipkan.", "success");
        } catch (e: any) {
            NotificationStore.addNotification("Gagal mengarsipkan beberapa data: " + e.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- EXISTING HANDLERS ---

    const openEditModal = () => {
        if (!selectedHalaqah) return;
        setNewHalaqahName(selectedHalaqah.nama);
        setNoUrut(selectedHalaqah.no_urut || 999);
        setSelectedMusammiId(String(selectedHalaqah.musammi.id));
        setSelectedJenis(selectedHalaqah.jenis);
        setSelectedMarhalah(selectedHalaqah.marhalah);
        setSelectedWaktu(selectedHalaqah.waktu || []); // Load existing times
        setSelectedSantriIds(selectedHalaqah.santri.map(s => s.id));
        setModalType('edit');
    };

    const toggleWaktuSelection = (w: Waktu) => {
        setSelectedWaktu(prev => 
            prev.includes(w) ? prev.filter(item => item !== w) : [...prev, w]
        );
    };

    const handleCreate = async () => {
        setIsSubmitting(true);
        try {
            if (!newHalaqahName) throw new Error("Nama wajib diisi");
            if (!selectedMusammiId) throw new Error("Pilih Musammi");
            if (selectedWaktu.length === 0) throw new Error("Pilih setidaknya satu waktu halaqah.");
            
            const today = new Date().toISOString().split('T')[0];
            // Removed mutasi checking for create to allow multiple halaqahs

            const finalJenis = isCustomJenis ? customJenisName : selectedJenis;

            const mutasiList: { santriId: number, oldHalaqahId: number, santriName: string, oldHalaqahName: string }[] = [];
            for (const santriId of selectedSantriIds) {
                for (const h of halaqah) {
                    // Check if santri is in another halaqah with the SAME jenis
                    if (h.jenis === finalJenis && (h.active_santri || h.santri).find(s => s.id === santriId)) {
                        const santriName = santri.find(s => s.id === santriId)?.nama || `ID ${santriId}`;
                        mutasiList.push({ santriId, oldHalaqahId: h.id, santriName, oldHalaqahName: h.nama });
                        break;
                    }
                }
            }

            if (mutasiList.length > 0) {
                NotificationStore.addNotification(`Memindahkan (mutasi) ${mutasiList.length} santri dari halaqah sebelumnya ke halaqah baru ini.`, 'info');
            }

            const santriObj = santri.filter(s => selectedSantriIds.includes(s.id));
            
            const m_id = masterMarhalahs?.find((m) => m.nama === selectedMarhalah)?.id || null;
            await addHalaqah({
                marhalah_id: m_id,
                nama: newHalaqahName,
                musammi_id: parseInt(selectedMusammiId),
                santri: santriObj,
                marhalah: selectedMarhalah,
                jenis: finalJenis,
                waktu: selectedWaktu,
                no_urut: noUrut
            });

            // Tutup keanggotaan lama untuk santri yang dimutasi ke halaqah baru ini (tanpa menelan error)
            const orgId = await getOrgId();
            for (const m of mutasiList) {
                const { error: hsmMutErr } = await (supabase as any)
                    .from('halaqah_student_memberships')
                    .update({
                        valid_to: today,
                        status: 'transferred',
                    })
                    .eq('organization_id', orgId)
                    .eq('halaqah_id', m.oldHalaqahId)
                    .eq('student_id', m.santriId)
                    .is('valid_to', null);
                if (hsmMutErr) throw hsmMutErr;

            }
            if (mutasiList.length > 0) {
                await fetchData();
            }
            setModalType(null);
            NotificationStore.addNotification("Berhasil membuat halaqah baru dan menambahkan anggota santri.", "success");
        } catch (e: any) { 
            console.error(e);
            if (e.message?.includes('duplicate key value') && e.message?.includes('halaqah_pkey')) {
                NotificationStore.addNotification("TERJADI ERROR SEQUENCE DATABASE (ID Konflik). Silakan jalankan script 'fix_id_sequences.sql' di SQL Editor Supabase.", "error");
            } else {
                NotificationStore.addNotification(e.message, "error"); 
            }
        }
        finally { setIsSubmitting(false); }
    };

    const handleUpdateHalaqahSubmit = async () => {
        if (!selectedHalaqah) return;
        setIsSubmitting(true);
        try {
            const finalJenis = isCustomJenis ? customJenisName : selectedJenis;
            if (selectedWaktu.length === 0) throw new Error("Pilih setidaknya satu waktu halaqah.");

            await updateHalaqah(selectedHalaqah.id, {
                nama: newHalaqahName,
                musammi_id: parseInt(selectedMusammiId, 10),
                marhalah: selectedMarhalah,
                jenis: finalJenis,
                waktu: selectedWaktu,
                no_urut: noUrut
            });

            const currentIds = (selectedHalaqah.active_santri || selectedHalaqah.santri).map(s => s.id);
            const newIds = selectedSantriIds;
            const toAdd = newIds.filter(id => !currentIds.includes(id));
            const toRemove = currentIds.filter(id => !newIds.includes(id));
            const today = new Date().toISOString().split('T')[0];

            if (toAdd.length > 0) {
                const directAddIds: number[] = [];
                for (const santriId of toAdd) {
                    let oldHalaqah: Halaqah | undefined;
                    for (const h of halaqah) {
                        if (h.id !== selectedHalaqah.id && h.jenis === finalJenis && (h.active_santri || h.santri).find(s => s.id === santriId)) {
                            oldHalaqah = h;
                            break;
                        }
                    }

                    if (oldHalaqah) {
                        await mutasiSantri(santriId, oldHalaqah.id, selectedHalaqah.id, today);
                    } else {
                        directAddIds.push(santriId);
                    }
                }
                if (directAddIds.length > 0) {
                    await addSantriToHalaqah(selectedHalaqah.id, directAddIds, today);
                }
            }

            if (toRemove.length > 0) {
                for (const santriId of toRemove) {
                    await keluarkanSantri(selectedHalaqah.id, santriId, today);
                }
            }

            await fetchData();
            setModalType(null);
            NotificationStore.addNotification("Berhasil menyimpan perubahan dan memperbarui data anggota santri.", "success");
        } catch (e: any) {
            NotificationStore.addNotification(e.message || "Gagal memperbarui data halaqah.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAssignMusammiSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedHalaqah || !musammiAssignId || !musammiValidFrom) {
            NotificationStore.addNotification("Pilih Musammi dan tanggal mulai berlaku.", "error");
            return;
        }
        if (musammiValidTo && musammiValidTo < musammiValidFrom) {
            NotificationStore.addNotification("Tanggal berakhir tidak boleh lebih awal dari tanggal mulai.", "error");
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await assignHalaqahMusammi({
                halaqahId: selectedHalaqah.id,
                musammiId: parseInt(musammiAssignId, 10),
                assignmentType: musammiAssignType,
                validFrom: musammiValidFrom,
                validTo: musammiValidTo || null,
                notes: musammiAssignNotes.trim() || null,
            });
            setMusammiModalOpen(false);
            if (res?.has_schedule_conflict && (res?.conflicts || []).length > 0) {
                const conflictNames = (res.conflicts || []).map((c) => c.halaqah_nama).join(', ');
                NotificationStore.addNotification(
                    `Penugasan Musammi disimpan, namun terdeteksi irisan jadwal dengan halaqah: ${conflictNames}.`,
                    'info'
                );
            } else {
                NotificationStore.addNotification(
                    `Penugasan Musammi ${musammiAssignType === 'primary' ? 'Utama' : 'Pengganti'} berhasil disimpan.`,
                    'success'
                );
            }
        } catch (err: any) {
            NotificationStore.addNotification(err.message || "Gagal menyimpan penugasan Musammi.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    React.useEffect(() => {
        if(selectedHalaqah) {
            const found = halaqah.find(h => h.id === selectedHalaqah.id);
            if(found) setSelectedHalaqah(found);
        }
    }, [halaqah]);

    const handleDelete = async (id: number) => {
        await deleteHalaqah(id);
        if(selectedHalaqah?.id === id) setSelectedHalaqah(null);
        NotificationStore.addNotification("Halaqah berhasil diarsipkan.", "info");
    };

    const handleRestore = async (id: number) => {
        await restoreHalaqah(id);
        if(selectedHalaqah?.id === id) setSelectedHalaqah(null);
        NotificationStore.addNotification("Halaqah berhasil dikembalikan menjadi aktif.", "success");
    };

    const openManageStatusModal = (santriId: number) => {
        setManageSantriId(santriId);
        setManageTargetHalaqahId('');
        setManageDate(new Date().toISOString().split('T')[0]);
        setManageStatusType('mutasi');
        setManageStatusModalOpen(true);
    };

    const handleManageStatusSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedHalaqah || !manageSantriId || !manageDate) {
            NotificationStore.addNotification("Harap lengkapi semua data.", "error");
            return;
        }

        if (manageStatusType === 'mutasi' && !manageTargetHalaqahId) {
            NotificationStore.addNotification("Pilih halaqah tujuan.", "error");
            return;
        }

        try {
            setIsSubmitting(true);
            if (manageStatusType === 'mutasi') {
                await mutasiSantri(manageSantriId, selectedHalaqah.id, parseInt(manageTargetHalaqahId), manageDate);
                NotificationStore.addNotification("Santri berhasil dipindahkan!", "success");
            } else {
                await keluarkanSantri(selectedHalaqah.id, manageSantriId, manageDate);
                NotificationStore.addNotification("Santri berhasil dikeluarkan dari halaqah.", "success");
            }
            await fetchData();
            setManageStatusModalOpen(false);
            setManageSantriId(null);
        } catch (err: any) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Import/Export Logic
    const handleDownloadTemplate = () => {
        const data = [
            {
                'ID Halaqah': '',
                'No Urut': '1',
                'Nama Halaqah': 'Halaqah 1',
                'Jenis': 'Halaqah Utama',
                'Marhalah': 'Mutawassithah',
                'Waktu': 'Shubuh, Ashar, Maghrib',
                'Peran': 'Musammi',
                'ID Anggota': '101',
                'Nama Anggota': 'Ustadz Fulan',
                'Kelas': ''
            },
            {
                'ID Halaqah': '',
                'No Urut': '1',
                'Nama Halaqah': 'Halaqah 1',
                'Jenis': 'Halaqah Utama',
                'Marhalah': 'Mutawassithah',
                'Waktu': 'Shubuh, Ashar, Maghrib',
                'Peran': 'Santri',
                'ID Anggota': '201',
                'Nama Anggota': 'Santri A',
                'Kelas': '1A'
            }
        ];
        exportToExcel(data, 'template_halaqah_baru');
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
            const orgId = await getOrgId();
            if (!selectedAcademicYear) {
                NotificationStore.addNotification("Pilih tahun ajaran terlebih dahulu", "error");
                return;
            }
            const csvData = await parseSpreadsheet(file);
            let createdHalaqahCount = 0; 
            let updatedHalaqahCount = 0;
            let addedSantriCount = 0;
            let errors: string[] = [];

            // 1. Group Data
            const groupedData: Record<string, {
                id?: number,
                no_urut: number,
                jenis: string,
                marhalah: string,
                waktuRaw: string[],
                musammi_id?: number,
                nama_musammi: string,
                nama_halaqah: string,
                santriList: { id?: number, nama: string, marhalah?: string, kelas?: string }[]
            }> = {};

            for (const row of csvData) {
                const importId = parseInt(row['id halaqah'] || row.id || row.id_halaqah) || undefined;
                const namaHalaqah = row['nama halaqah'] || row.nama_halaqah || row.nama;
                
                if (!namaHalaqah) continue;

                const jenis = row.jenis || row.jenis_halaqah || 'Halaqah Utama';
                const marhalah = row.marhalah || row.marhalah_halaqah || 'Mutawassithah';
                
                // Collect time columns: comma separated in new template, or multiple columns in old
                const waktuString = row.waktu || '';
                const waktuRawNew = waktuString ? String(waktuString).split(',').map((w: string) => w.trim()).filter(Boolean) : [];
                const waktuRawOld = [row.waktu1, row.waktu2, row.waktu3, row.waktu4, row.waktu5].filter(Boolean).map(w => String(w).trim());
                const waktuRaw = waktuRawNew.length > 0 ? waktuRawNew : waktuRawOld;
                
                const peran = (row.peran || '').toString().toLowerCase();
                const anggotaId = parseInt(row['id anggota'] || row.id_anggota) || undefined;
                const namaAnggota = row['nama anggota'] || row.nama_anggota;
                const kelas = row.kelas || row.kelas_santri;

                const musammiId = row.musammi_id ? parseInt(row.musammi_id) : (peran === 'musammi' ? anggotaId : undefined);
                const santriId = row.santri_id ? parseInt(row.santri_id) : (peran === 'santri' ? anggotaId : undefined);
                const musammiName = row.nama_musammi || (peran === 'musammi' ? namaAnggota : undefined) || 'Unknown';
                const santriName = row.nama_santri || (peran === 'santri' ? namaAnggota : undefined);
                const noUrut = parseInt(row['no urut'] || row.no_urut) || 999;
                const santriMarhalah = row.marhalah_santri || marhalah;

                const groupKey = importId ? `ID:${importId}` : `NAME:${namaHalaqah}`;

                if (!groupedData[groupKey]) {
                    groupedData[groupKey] = {
                        id: importId,
                        nama_halaqah: namaHalaqah,
                        no_urut: noUrut,
                        jenis: jenis,
                        marhalah: marhalah,
                        waktuRaw: waktuRaw,
                        musammi_id: musammiId,
                        nama_musammi: peran === 'musammi' ? namaAnggota : (row.nama_musammi || 'Unknown'),
                        santriList: []
                    };
                } else {
                    if (peran === 'musammi' || row.nama_musammi) {
                         groupedData[groupKey].nama_musammi = namaAnggota || row.nama_musammi;
                    }
                }
                
                if (santriName || (peran === 'santri' && namaAnggota)) {
                    const finalSantriName = santriName || namaAnggota;
                    if (finalSantriName) {
                        groupedData[groupKey].santriList.push({
                            id: santriId,
                            nama: finalSantriName,
                            marhalah: santriMarhalah,
                            kelas: kelas
                        });
                    }
                }
            }

            // 2. Process Groups
            for (const group of Object.values(groupedData)) {
                let targetMusammi;
                if (group.musammi_id) targetMusammi = musammi.find(m => m.id === group.musammi_id);
                if (!targetMusammi && group.nama_musammi) targetMusammi = musammi.find(m => m.nama.toLowerCase() === group.nama_musammi.toLowerCase());

                if (!targetMusammi) {
                    errors.push(`Musammi tidak ditemukan (ID: ${group.musammi_id || '-'}, Nama: ${group.nama_musammi}) di Halaqah: ${group.nama_halaqah}`);
                    continue;
                }

                // Determine Waktu from CSV or Fallback
                let waktu: Waktu[] = [];
                if (group.waktuRaw.length > 0) {
                    group.waktuRaw.forEach(raw => {
                        const r = raw.toLowerCase();
                        if (r.includes('shubuh')) waktu.push(Waktu.Shubuh);
                        if (r.includes('dhuha')) waktu.push(Waktu.Dhuha);
                        if (r.includes('ashar')) waktu.push(Waktu.Ashar);
                        if (r.includes('maghrib')) waktu.push(Waktu.Maghrib);
                        if (r.includes('isya')) waktu.push(Waktu.Isya);
                    });
                } else {
                    waktu = group.jenis.toLowerCase().includes('pagi') ? [Waktu.Dhuha] : [Waktu.Shubuh, Waktu.Ashar, Waktu.Isya];
                }
                
                if (waktu.length === 0) waktu = [Waktu.Shubuh, Waktu.Ashar, Waktu.Isya]; 
                
                // Remove duplicates
                waktu = Array.from(new Set(waktu));

                let targetHalaqahId: number | null = null;
                // ... (rest of the logic remains the same, just ensure targetHalaqahId is set)
                // Re-using the logic from before for simplicity in replacement
                if (group.id) {
                    const existingById = halaqah.find(h => h.id === group.id);
                    if (existingById) {
                        targetHalaqahId = existingById.id;
                        await supabase.from('halaqah').update({
                            nama: group.nama_halaqah,
                            musammi_id: targetMusammi.id,
                            marhalah: group.marhalah as Marhalah,
                            jenis: group.jenis,
                            waktu: waktu,
                            no_urut: group.no_urut,
                            academic_year_id: selectedAcademicYear?.id
                        }).eq('id', targetHalaqahId).eq('organization_id', orgId);
                        if (targetHalaqahId) updatedHalaqahCount++;
                    } else {
                        const existingByName = halaqah.find(h => h.nama.toLowerCase() === group.nama_halaqah.toLowerCase());
                        if (existingByName) {
                             targetHalaqahId = existingByName.id;
                             await supabase.from('halaqah').update({
                                musammi_id: targetMusammi.id,
                                marhalah: group.marhalah as Marhalah,
                                jenis: group.jenis,
                                waktu: waktu,
                                no_urut: group.no_urut,
                                academic_year_id: selectedAcademicYear?.id
                            }).eq('id', targetHalaqahId).eq('organization_id', orgId);
                            updatedHalaqahCount++;
                        } else {
                            const { data: newHalaqah, error: createError } = await supabase.from('halaqah').insert({
                                organization_id: orgId,
                                nama: group.nama_halaqah,
                                musammi_id: targetMusammi.id,
                                marhalah: group.marhalah as Marhalah,
                                jenis: group.jenis,
                                waktu: waktu,
                                no_urut: group.no_urut,
                                academic_year_id: selectedAcademicYear?.id
                            }).select().single();

                            if (createError || !newHalaqah) {
                                errors.push(`Gagal buat halaqah: ${group.nama_halaqah}`);
                                continue;
                            }
                            targetHalaqahId = newHalaqah.id;
                            createdHalaqahCount++;
                        }
                    }
                } else {
                    const existingHalaqah = halaqah.find(h => h.nama.toLowerCase() === group.nama_halaqah.toLowerCase());
                    if (existingHalaqah) {
                        targetHalaqahId = existingHalaqah.id;
                        await supabase.from('halaqah').update({
                            musammi_id: targetMusammi.id,
                            marhalah: group.marhalah as Marhalah,
                            jenis: group.jenis,
                            waktu: waktu,
                            no_urut: group.no_urut,
                            academic_year_id: selectedAcademicYear?.id
                        }).eq('id', targetHalaqahId).eq('organization_id', orgId);
                        updatedHalaqahCount++;
                    } else {
                        const { data: newHalaqah, error: createError } = await supabase.from('halaqah').insert({
                            organization_id: orgId,
                            nama: group.nama_halaqah,
                            musammi_id: targetMusammi.id,
                            marhalah: group.marhalah as Marhalah,
                            jenis: group.jenis,
                            waktu: waktu,
                            no_urut: group.no_urut,
                            academic_year_id: selectedAcademicYear?.id
                        }).select().single();
                        if (createError || !newHalaqah) continue;
                        targetHalaqahId = newHalaqah.id;
                        createdHalaqahCount++;
                    }
                }

                if (targetHalaqahId && group.santriList.length > 0) {
                    const santriToInsert = [];
                    for (const sData of group.santriList) {
                        let targetSantri = sData.id ? santri.find(s => s.id === sData.id) : undefined;
                        if (!targetSantri) targetSantri = santri.find(s => s.nama.toLowerCase() === sData.nama.toLowerCase());

                        // Fase 2: keanggotaan halaqah hanya di halaqah_student_memberships
                        const alreadyActive = halaqah
                            .find(h => h.id === targetHalaqahId)?.santri?.some(x => x.id === targetSantri?.id);
                        if (targetSantri && !alreadyActive) {
                            santriToInsert.push({
                                organization_id: orgId,
                                academic_year_id: selectedAcademicYear?.id || null,
                                halaqah_id: targetHalaqahId,
                                student_id: targetSantri.id,
                                valid_from: new Date().toISOString().slice(0, 10),
                                status: 'active'
                            });
                        }
                    }
                    if (santriToInsert.length > 0) {
                        const { error: linkError } = await (supabase as any).from('halaqah_student_memberships').insert(santriToInsert);
                        if (linkError) errors.push(`Halaqah ${group.nama_halaqah}: ${linkError.message}`);
                        else addedSantriCount += santriToInsert.length;
                    }
                }
            }

            await fetchData();
            let msg = `Import Selesai: Halaqah Baru ${createdHalaqahCount}, Updated ${updatedHalaqahCount}, Santri +${addedSantriCount}.`;
            if (errors.length > 0) msg += ` Error (${errors.length}): ` + errors.slice(0, 3).join('; ');
            NotificationStore.addNotification(msg, errors.length > 0 ? 'info' : 'success');

        } catch (e: any) { NotificationStore.addNotification(`Import gagal: ${e.message}`, 'error'); }
        finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const getDetailedExportData = () => {
        const rows: any[] = [];
        filteredHalaqah.forEach(h => {
            // Musammi
            rows.push({
                'ID': h.id,
                'Nama Halaqah': h.nama,
                'Jenis': h.jenis,
                'Marhalah': h.marhalah,
                'Waktu': h.waktu.join(', '),
                'Peran': 'Musammi',
                'Nama Anggota': h.musammi.nama,
                'Kelas': h.musammi.kelas
            });
            // Santri
            h.santri.forEach(s => {
                rows.push({
                    'ID': h.id,
                    'Nama Halaqah': h.nama,
                    'Jenis': h.jenis,
                    'Marhalah': h.marhalah,
                    'Waktu': h.waktu.join(', '),
                    'Peran': 'Santri',
                    'Nama Anggota': s.nama,
                    'Kelas': s.kelas
                });
            });
        });
        return rows;
    };

    const handleExportExcel = () => exportToExcel(getDetailedExportData(), 'Data_Halaqah_Lengkap');
    const handleExportPDF = () => {
        const data = getDetailedExportData();
        const columns = ['ID', 'Nama Halaqah', 'Waktu', 'Peran', 'Nama Anggota', 'Kelas'];
        const rows = data.map(d => [d['ID'], d['Nama Halaqah'], d['Waktu'], d['Peran'], d['Nama Anggota'], d['Kelas']]);
        exportToPDF("Data Halaqah Lengkap", columns, rows, "Data_Halaqah_Lengkap");
    };

    // Fase 8b: hook tidak boleh mengembalikan JSX langsung; komponen membaca __berhenti/__kembali
    if (loading) return { __berhenti: true, __kembali: <LoadingState label="Memuat data…" /> } as any;
    if (error) return { __berhenti: true, __kembali: <p className="text-error">{error}</p> } as any;

    // Common Form Content for both Add and Edit
    const renderFormContent = (isEdit: boolean) => (
        <div className="flex flex-col gap-5">
            {/* Section 1: Identitas */}
            <div className="bg-white p-1">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* No Urut (Small) & Nama Halaqah (Wide) */}
                    <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">No. Urut</label>
                        <div className="relative">
                            <Hash size={14} className="absolute left-3 top-2.5 text-slate-400" />
                            <input type="number" placeholder="999" className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all py-2 pl-9 pr-3" value={noUrut} onChange={e => setNoUrut(parseInt(e.target.value))} />
                        </div>
                    </div>
                    <div className="md:col-span-9">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nama Halaqah <span className="text-red-500">*</span></label>
                        <input type="text" placeholder="Contoh: Halaqah Abu Bakar" className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all py-2 px-3 placeholder:text-slate-300" value={newHalaqahName} onChange={e => setNewHalaqahName(e.target.value)} />
                    </div>

                    {/* Row 2: Jenis, Marhalah, Waktu */}
                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jenis Halaqah</label>
                        {isCustomJenis ? (
                            <div className="flex gap-2">
                                <input type="text" placeholder="Jenis Baru..." className="w-full border-slate-200 rounded-lg text-sm" value={customJenisName} onChange={e => setCustomJenisName(e.target.value)} autoFocus />
                                <button onClick={() => setIsCustomJenis(false)} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500"><X size={16}/></button>
                            </div>
                        ) : (
                            <select className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all py-2 px-3 bg-white" value={selectedJenis} onChange={e => e.target.value === 'NEW' ? setIsCustomJenis(true) : setSelectedJenis(e.target.value as any)}>
                                {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                <option value="NEW">+ Tambah Jenis Baru</option>
                            </select>
                        )}
                    </div>
                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Marhalah</label>
                        <select className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all py-2 px-3 bg-white" value={selectedMarhalah} onChange={e => setSelectedMarhalah(e.target.value as any)}>
                            {masterMarhalahs?.map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-4">
                        <WaktuDropdown selected={selectedWaktu} options={globalWaktuHalaqah} onChange={toggleWaktuSelection} />
                    </div>

                    {/* Row 3: Musammi */}
                    <div className="md:col-span-12">
                        <SearchableMusammiSelect 
                            musammiList={musammi} 
                            selectedId={selectedMusammiId} 
                            onChange={setSelectedMusammiId} 
                        />
                    </div>
                </div>
            </div>

            {/* Section 3: Members */}
            <div className="bg-white mt-2">
                <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-1">
                    <SantriMultiSelect 
                        santriList={availableSantri} 
                        selectedIds={selectedSantriIds} 
                        onToggle={id => setSelectedSantriIds(p => p.includes(id) ? p.filter(x => x!==id) : [...p, id])} 
                        label={`Anggota (${selectedMarhalah})`}
                    />
                </div>
                <p className="text-2xs text-slate-400 mt-2 px-1">*Centang nama santri untuk memasukkan ke dalam halaqah ini.</p>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                <button onClick={() => setModalType(null)} className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
                    Batal
                </button>
                <button 
                    onClick={isEdit ? handleUpdateHalaqahSubmit : handleCreate} 
                    disabled={isSubmitting} 
                    className="btn btn-primary"
                >
                    {isSubmitting ? 'Menyimpan...' : (isEdit ? <><Save size={16} className="mr-2"/> Simpan Perubahan</> : <><Plus size={16} className="mr-2"/> Buat Halaqah</>)}
                </button>
            </div>
        </div>
    );
  return { location, halaqahId, halaqah, musammi, santri, addHalaqah, deleteHalaqah, deleteHalaqahBatch, restoreHalaqah, updateHalaqah, addSantriToHalaqah, keluarkanSantri, mutasiSantri, assignHalaqahMusammi, fetchData, loading, error, getOrgId, globalMarhalahs, globalJenisHalaqah, globalWaktuHalaqah, masterMarhalahs, masterKelasRelasi, selectedAcademicYear, fileInputRef, activeViewTab, setActiveViewTab, selectedHalaqah, setSelectedHalaqah, modalType, setModalType, isSubmitting, setIsSubmitting, manageStatusModalOpen, setManageStatusModalOpen, manageStatusType, setManageStatusType, manageSantriId, setManageSantriId, manageTargetHalaqahId, setManageTargetHalaqahId, manageDate, setManageDate, showRiwayat, setShowRiwayat, rosterAsOfDate, setRosterAsOfDate, musammiModalOpen, setMusammiModalOpen, musammiAssignType, setMusammiAssignType, musammiAssignId, setMusammiAssignId, musammiValidFrom, setMusammiValidFrom, musammiValidTo, setMusammiValidTo, musammiAssignNotes, setMusammiAssignNotes, selectedHalaqahIds, setSelectedHalaqahIds, currentPage, setCurrentPage, itemsPerPage, filterStatus, setFilterStatus, newHalaqahName, setNewHalaqahName, noUrut, setNoUrut, selectedMusammiId, setSelectedMusammiId, selectedJenis, setSelectedJenis, selectedMarhalah, setSelectedMarhalah, selectedWaktu, setSelectedWaktu, selectedSantriIds, setSelectedSantriIds, isCustomJenis, setIsCustomJenis, customJenisName, setCustomJenisName, filterJenis, setFilterJenis, filterMarhalah, setFilterMarhalah, filterSearch, setFilterSearch, availableTypes, scheduleAnalysis, filteredHalaqah, totalPages, paginatedHalaqah, availableSantri, toggleSelectAll, toggleSelectRow, handleBulkDelete, openEditModal, toggleWaktuSelection, handleCreate, handleUpdateHalaqahSubmit, handleAssignMusammiSubmit, handleDelete, handleRestore, openManageStatusModal, handleManageStatusSubmit, handleDownloadTemplate, handleImportCSV, getDetailedExportData, handleExportExcel, handleExportPDF, renderFormContent };
}

export type HalaqahPageLogika = ReturnType<typeof useHalaqahPageLogika>;
