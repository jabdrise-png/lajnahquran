
import React, { useState, useMemo, useRef, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import SantriMultiSelect from '../../components/SantriMultiSelect';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { HalaqahType, Marhalah, Waktu, Halaqah, Santri } from '../../types';
// removed constant import
import {   Plus, Trash, Users, Edit, ArrowLeft, X, Search, Upload, Download, FileSpreadsheet, FileText, Save, CheckSquare, Square, Clock, ChevronDown, Hash, Check, ChevronRight, RefreshCw , Calendar  } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { StatusBadge } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';

// --- CUSTOM COMPONENTS FOR MODAL ---

const WaktuDropdown = ({ selected, options, onChange }: { selected: string[], options: string[], onChange: (w: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const displayValue = selected.length === 0 
        ? 'Pilih Waktu' 
        : selected.length === options.length 
            ? 'Semua Waktu' 
            : `${selected.length} dipilih`;

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Waktu Halaqah</label>
            <button 
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white hover:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all text-slate-700"
            >
                <span className={selected.length === 0 ? "text-slate-400" : "font-medium"}>{displayValue}</span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-1 max-h-60 overflow-y-auto">
                        {options.map(w => {
                            const isSelected = selected.includes(w);
                            return (
                                <div 
                                    key={w} 
                                    onClick={() => onChange(w)}
                                    className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer rounded-md"
                                >
                                    <div className={`w-4 h-4 border rounded mr-3 flex items-center justify-center transition-colors ${isSelected ? 'bg-secondary border-secondary' : 'border-slate-300'}`}>
                                        {isSelected && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="text-sm text-slate-700">{w}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const SearchableMusammiSelect = ({ 
    musammiList, 
    selectedId, 
    onChange 
}: { 
    musammiList: any[], 
    selectedId: string, 
    onChange: (id: string) => void 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Get selected object to display name if ID matches
    const selectedObj = musammiList.find(m => String(m.id) === selectedId);

    // Initial search text based on selected ID
    useEffect(() => {
        if (!isOpen && selectedObj) {
            setSearch(selectedObj.nama);
        } else if (!isOpen && !selectedId) {
            setSearch('');
        }
    }, [selectedId, isOpen, selectedObj]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset search text to selected item name on close
                if (selectedObj) setSearch(selectedObj.nama);
                else setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedObj]);

    const filteredList = musammiList.filter(m => 
        m.nama.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Pilih Musammi</label>
            <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    placeholder="Cari nama musammi..."
                    className="w-full border border-slate-200 rounded-lg text-sm pl-9 pr-8 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-slate-400"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                    onFocus={(e) => { setIsOpen(true); e.target.select(); }}
                />
                {selectedId && !isOpen && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onChange(''); setSearch(''); }}
                        className="absolute right-2 top-2 text-slate-400 hover:text-red-500"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                    {filteredList.length > 0 ? filteredList.map(m => (
                        <div 
                            key={m.id}
                            onClick={() => { onChange(String(m.id)); setIsOpen(false); setSearch(m.nama); }}
                            className={`px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0 ${String(m.id) === selectedId ? 'bg-blue-50' : ''}`}
                        >
                            <div>
                                <p className="text-sm font-medium text-slate-800 uppercase">{m.nama}</p>
                                <p className="text-[10px] text-slate-500"><MarhalahLabel text={m.marhalah} id={m.marhalah_id} /></p>
                            </div>
                            {String(m.id) === selectedId && <Check size={16} className="text-secondary"/>}
                        </div>
                    )) : (
                        <div className="p-4 text-center text-sm text-slate-400">Tidak ditemukan.</div>
                    )}
                </div>
            )}
        </div>
    );
};


const HalaqahPage: React.FC = () => {
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
                const targetMarhalahId = masterMarhalahs?.find((m: any) => m.nama === filterMarhalah)?.id;
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
            
            const m_id = masterMarhalahs?.find((m: any) => m.nama === selectedMarhalah)?.id || null;
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

                const { error: legMutErr } = await (supabase as any)
                    .from('halaqah_santri')
                    .update({
                        end_date: today,
                        status: 'Mutasi',
                    })
                    .eq('organization_id', orgId)
                    .eq('halaqah_id', m.oldHalaqahId)
                    .eq('santri_id', m.santriId)
                    .is('end_date', null);
                if (legMutErr) throw legMutErr;
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
            NotificationStore.addNotification("Berhasil menyimpan perubahan dan memperbarui data anggota santri secara atomik.", "success");
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
                const conflictNames = (res.conflicts || []).map((c: any) => c.halaqah_nama).join(', ');
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

                        if (targetSantri) {
                            santriToInsert.push({
                                organization_id: orgId,
                                halaqah_id: targetHalaqahId,
                                santri_id: targetSantri.id
                            });
                        }
                    }
                    if (santriToInsert.length > 0) {
                        const { error: linkError } = await supabase.from('halaqah_santri').upsert(santriToInsert, { onConflict: 'halaqah_id, santri_id' });
                        if (!linkError) addedSantriCount += santriToInsert.length;
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

    if (loading) return <p>Loading...</p>;
    if (error) return <p className="text-error">{error}</p>;

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
                            {masterMarhalahs?.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map((m: any) => <option key={m} value={m}>{m}</option>)}
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
                <p className="text-[10px] text-slate-400 mt-2 px-1">*Centang nama santri untuk memasukkan ke dalam halaqah ini.</p>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                <button onClick={() => setModalType(null)} className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
                    Batal
                </button>
                <button 
                    onClick={isEdit ? handleUpdateHalaqahSubmit : handleCreate} 
                    disabled={isSubmitting} 
                    className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'Menyimpan...' : (isEdit ? <><Save size={16} className="mr-2"/> Simpan Perubahan</> : <><Plus size={16} className="mr-2"/> Buat Halaqah</>)}
                </button>
            </div>
        </div>
    );

    // --- MAIN RENDER ---
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4 mt-2">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <StatusBadge label="KELOMPOK HALAQAH & DETEKSI JADWAL" tone="primary" />
                        {scheduleAnalysis.totalConflicts > 0 ? (
                            <StatusBadge label={`${scheduleAnalysis.totalConflicts} BENTROK JADWAL`} tone="danger" />
                        ) : (
                            <StatusBadge label="JADWAL BEBAS BENTROK" tone="success" />
                        )}
                    </div>
                    <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
                        Kelompok Halaqah & Matriks Jadwal
                    </h1>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Kelola kelompok halaqah, penugasan Musammi, riwayat mutasi anggota, dan deteksi bentrok waktu sesi otomatis.
                    </p>
                </div>
            </div>

            {!selectedHalaqah && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2">
                    <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setActiveViewTab('groups')}
                            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                activeViewTab === 'groups'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            1. Daftar Kelompok Halaqah ({filteredHalaqah.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveViewTab('schedule')}
                            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                activeViewTab === 'schedule'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            2. Matriks Jadwal & Deteksi Bentrok ({scheduleAnalysis.totalConflicts} Konflik)
                        </button>
                    </div>
                    {scheduleAnalysis.totalConflicts > 0 && activeViewTab === 'groups' && (
                        <button
                            type="button"
                            onClick={() => setActiveViewTab('schedule')}
                            className="px-3 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100"
                        >
                            Lihat {scheduleAnalysis.totalConflicts} Bentrok Waktu Sesi →
                        </button>
                    )}
                </div>
            )}

            {selectedHalaqah ? (
                // DETAIL VIEW
                <div className="space-y-6">
                    <button onClick={() => setSelectedHalaqah(null)} className="inline-flex items-center h-9 px-4 rounded-lg bg-white border border-slate-200/80 text-[12px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors mb-2">
                        <ArrowLeft size={16} className="mr-2" /> Kembali ke Daftar
                    </button>

                    {/* Detail Card ... standard card style */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="flex flex-col md:flex-row justify-between items-start px-6 py-5 border-b border-slate-100 bg-slate-50/30">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">
                                    {selectedHalaqah.nama}
                                    {selectedHalaqah.is_active === false && (
                                        <span className="ml-3 text-[11px] font-bold tracking-wider uppercase bg-amber-100 text-amber-700 px-2 py-1 rounded-md border border-amber-200 align-middle">Diarsipkan</span>
                                    )}
                                </h2>
                                <div className="flex items-center text-sm text-slate-500 mt-2 space-x-3 flex-wrap gap-y-2">
                                    <span className="flex items-center font-mono text-xs bg-slate-200/50 px-2 rounded-md">#{selectedHalaqah.id}</span>
                                    <span className="flex items-center font-semibold text-slate-700"><Users size={14} className="mr-1.5"/> Utama: {selectedHalaqah.musammi.nama}</span>
                                    {(selectedHalaqah.substitute_musammi || []).length > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold">
                                            Pengganti: {(selectedHalaqah.substitute_musammi || []).map((m) => m.nama).join(', ')}
                                        </span>
                                    )}
                                    <span>•</span><span><MarhalahLabel text={selectedHalaqah.marhalah} id={selectedHalaqah.marhalah_id} /></span>
                                    <span>•</span><span>{selectedHalaqah.jenis}</span>
                                    <span>•</span><span>No. {selectedHalaqah.no_urut || '-'}</span>
                                    <span>•</span><span className="flex items-center text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-md"><Clock size={12} className="mr-1.5"/> {selectedHalaqah.waktu.join(', ')}</span>
                                    {selectedHalaqah.created_at && (
                                        <>
                                            <span>•</span>
                                            <span className="flex items-center text-slate-500 font-medium">
                                                <Calendar size={12} className="mr-1.5" /> Dibuat: {format(new Date(selectedHalaqah.created_at), 'dd MMM yyyy', { locale: localeId })}
                                            </span>
                                        </>
                                    )}
                                    {selectedHalaqah.is_active === false && selectedHalaqah.updated_at && (
                                        <>
                                            <span>•</span>
                                            <span className="flex items-center text-amber-600 font-medium">
                                                <Calendar size={12} className="mr-1.5" /> Diarsipkan: {format(new Date(selectedHalaqah.updated_at), 'dd MMM yyyy', { locale: localeId })}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
                                {selectedHalaqah.is_active === false ? (
                                    <button onClick={() => handleRestore(selectedHalaqah.id)} className="h-9 px-4 rounded-lg bg-emerald-50 text-emerald-600 text-[12px] font-semibold hover:bg-emerald-100 transition-colors flex items-center">
                                        <RefreshCw size={14} className="mr-2" strokeWidth={2.5}/> Kembalikan Halaqah
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMusammiAssignType('substitute');
                                                setMusammiAssignId('');
                                                setMusammiValidFrom(new Date().toISOString().split('T')[0]);
                                                setMusammiValidTo('');
                                                setMusammiAssignNotes('');
                                                setMusammiModalOpen(true);
                                            }}
                                            className="h-9 px-3.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[12px] font-semibold hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                                        >
                                            <Users size={14} /> Penugasan Musammi (Utama / Pengganti)
                                        </button>
                                        <button onClick={() => handleDelete(selectedHalaqah.id)} className="h-9 px-4 rounded-lg bg-rose-50 text-rose-600 text-[12px] font-semibold hover:bg-rose-100 transition-colors flex items-center">
                                            <Trash size={14} className="mr-2" strokeWidth={2.5}/> Arsipkan Halaqah
                                        </button>
                                        <button onClick={openEditModal} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 transition-all flex items-center gap-2">
                                            <Edit size={14} strokeWidth={2.5} /> Edit Data
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Panel Penugasan Musammi Kanonikal V2 (Primary & Substitute) */}
                        {(selectedHalaqah.musammi_assignments || []).length > 0 && (
                            <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-bold text-slate-600 uppercase tracking-wider">Penugasan Musammi V2:</span>
                                    {(selectedHalaqah.musammi_assignments || [])
                                        .filter((a) => a.is_active)
                                        .map((a, idx) => (
                                            <span
                                                key={a.id || idx}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-semibold ${
                                                    a.assignment_type === 'primary'
                                                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                                                        : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                                }`}
                                            >
                                                <span>{a.assignment_type === 'primary' ? 'Utama' : 'Pengganti'}:</span>
                                                <span className="font-bold">{a.musammi?.nama || `#${a.musammi_id}`}</span>
                                                <span className="font-mono text-[10px] opacity-75">
                                                    ({a.valid_from}{a.valid_to ? ` s/d ${a.valid_to}` : ''})
                                                </span>
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}

                        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-[14px] font-bold text-slate-800">
                                    {rosterAsOfDate
                                        ? `Rekonstruksi Roster Historis per Tanggal ${rosterAsOfDate}`
                                        : `Anggota Aktif (${selectedHalaqah.active_santri?.length || selectedHalaqah.santri.length})`}
                                </h3>
                                <p className="text-[11px] text-slate-500">
                                    Berdasarkan rentang efektif <span className="font-mono">valid_from</span> & <span className="font-mono">valid_to</span> pada <span className="font-mono">halaqah_student_memberships</span>.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-slate-600">Tinjau Roster per Tanggal:</label>
                                <input
                                    type="date"
                                    value={rosterAsOfDate}
                                    onChange={(e) => setRosterAsOfDate(e.target.value)}
                                    className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 bg-white"
                                />
                                {rosterAsOfDate && (
                                    <button
                                        type="button"
                                        onClick={() => setRosterAsOfDate('')}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                                    >
                                        Reset ke Hari Ini
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="overflow-x-auto min-h-[300px]">
                            {(() => {
                                const displayMembers: Santri[] = rosterAsOfDate
                                    ? (selectedHalaqah.history || [])
                                          .filter(
                                              (h) =>
                                                  h.start_date <= rosterAsOfDate &&
                                                  (!h.end_date || h.end_date >= rosterAsOfDate) &&
                                                  h.santri
                                          )
                                          .map((h) => h.santri!)
                                    : selectedHalaqah.active_santri || selectedHalaqah.santri;
                                const uniqueMembers: Santri[] = Array.from(
                                    new Map<number, Santri>(displayMembers.map((m) => [m.id, m])).values()
                                ).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

                                return (
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50 border-b border-slate-200/60">
                                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 w-12 text-center">No.</th>
                                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80 w-16 text-center">ID</th>
                                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Nama Santri</th>
                                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Kelas</th>
                                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80 text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100/80">
                                            {uniqueMembers.map((s, idx) => (
                                                <tr key={s.id} className="hover:bg-blue-50/30 transition-colors group">
                                                    <td className="px-6 py-4 text-[12px] font-bold text-slate-500 text-center">{idx + 1}</td>
                                                    <td className="px-6 py-4 border-l border-slate-100/80 text-[12px] font-mono font-medium text-slate-400 text-center">#{s.id}</td>
                                                    <td className="px-6 py-4 border-l border-slate-100/80 text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{s.nama}</td>
                                                    <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-bold text-slate-600 tracking-widest uppercase"><KelasLabel text={s.kelas} id={s.kelas_id} /></td>
                                                    <td className="px-6 py-4 border-l border-slate-100/80 text-right">
                                                        {!rosterAsOfDate && (
                                                            <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex justify-end">
                                                                <button title="Mutasi / Keluarkan Santri" onClick={() => openManageStatusModal(s.id)} className="h-9 px-3 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-amber-500 hover:text-white transition-all shadow-sm text-[12px] font-semibold gap-1.5">
                                                                    <RefreshCw size={14} strokeWidth={2.5}/> Kelola Status
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {uniqueMembers.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-16 text-[13px] text-slate-500 font-medium">
                                                        {rosterAsOfDate
                                                            ? `Tidak ada anggota halaqah yang tercatat aktif pada tanggal ${rosterAsOfDate}.`
                                                            : 'Belum ada anggota aktif.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                );
                            })()}
                            
                            <div className="p-6 border-t border-slate-100">
                                <button
                                    onClick={() => setShowRiwayat(!showRiwayat)}
                                    className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
                                >
                                    {showRiwayat ? 'Tutup Riwayat Anggota' : `Lihat riwayat anggota keluar/mutasi (${(selectedHalaqah.history || []).filter(h => h.status !== 'Aktif').length})`}
                                </button>
                            </div>

                            {showRiwayat && (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-200/60">
                                            <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 w-12 text-center">No.</th>
                                            <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Nama Santri</th>
                                            <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Tgl Masuk (valid_from)</th>
                                            <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Tgl Keluar (valid_to)</th>
                                            <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/80">
                                        {(selectedHalaqah.history || []).filter(h => h.status !== 'Aktif').sort((a,b) => new Date(b.end_date || '').getTime() - new Date(a.end_date || '').getTime()).map((h, idx) => (
                                            <tr key={`${h.santri_id}-${h.start_date}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 text-[12px] font-bold text-slate-500 text-center">{idx + 1}</td>
                                                <td className="px-6 py-4 border-l border-slate-100/80 text-[14px] font-bold text-slate-800">{h.santri?.nama || '-'}</td>
                                                <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-mono font-semibold text-slate-600">{h.start_date}</td>
                                                <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-mono font-semibold text-slate-600">{h.end_date || '-'}</td>
                                                <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-bold text-slate-500">
                                                    <span className="bg-slate-100 px-2.5 py-1 rounded-md">{h.status}</span>
                                                </td>
                                            </tr>
                                        ))}
                                        {(selectedHalaqah.history || []).filter(h => h.status !== 'Aktif').length === 0 && <tr><td colSpan={5} className="text-center py-16 text-[13px] text-slate-500 font-medium">Belum ada riwayat anggota yang keluar/pindah.</td></tr>}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                    
                    {/* EDIT MODAL */}
                    <Modal isOpen={modalType === 'edit'} onClose={() => setModalType(null)} title="Edit Data Halaqah">
                        {renderFormContent(true)}
                    </Modal>

                    {/* MODAL PENUGASAN MUSAMMI UTAMA / PENGGANTI (FASE 4 SECTION 5) */}
                    <Modal
                        isOpen={musammiModalOpen}
                        onClose={() => setMusammiModalOpen(false)}
                        title={`Penugasan Musammi Halaqah — ${selectedHalaqah.nama}`}
                    >
                        <form onSubmit={handleAssignMusammiSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                    Tipe Penugasan (assignment_type)
                                </label>
                                <select
                                    value={musammiAssignType}
                                    onChange={(e) => setMusammiAssignType(e.target.value as 'primary' | 'substitute')}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-semibold text-slate-800"
                                >
                                    <option value="primary">Musammi Utama (Primary — Menggantikan Musammi Utama Sebelumnya)</option>
                                    <option value="substitute">Musammi Pengganti / Badal (Substitute — Sementara)</option>
                                </select>
                            </div>

                            <SearchableMusammiSelect
                                musammiList={musammi}
                                selectedId={musammiAssignId}
                                onChange={setMusammiAssignId}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                        Berlaku Mulai (valid_from) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={musammiValidFrom}
                                        onChange={(e) => setMusammiValidFrom(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                        Berlaku Sampai (valid_to)
                                    </label>
                                    <input
                                        type="date"
                                        value={musammiValidTo}
                                        onChange={(e) => setMusammiValidTo(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                    Catatan Penugasan
                                </label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Badal selama Musammi utama bertugas keluar kota..."
                                    value={musammiAssignNotes}
                                    onChange={(e) => setMusammiAssignNotes(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setMusammiModalOpen(false)}
                                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !musammiAssignId}
                                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Menyimpan...' : 'Simpan Penugasan'}
                                </button>
                            </div>
                        </form>
                    </Modal>
                </div>
            ) : activeViewTab === 'schedule' ? (
                <div className="space-y-4">
                    {/* Panel Deteksi Bentrok Jadwal */}
                    <div className={`p-5 rounded-xl border ${scheduleAnalysis.totalConflicts > 0 ? 'bg-red-50/70 border-red-200' : 'bg-emerald-50/60 border-emerald-200'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                    Audit Deteksi Bentrok Jadwal Sesi Halaqah
                                </h3>
                                <p className="text-xs text-slate-600 mt-0.5">
                                    Memeriksa apakah ada Musammi atau Santri yang terdaftar pada lebih dari 1 halaqah aktif di waktu sesi yang sama.
                                </p>
                            </div>
                            <StatusBadge
                                label={
                                    scheduleAnalysis.totalConflicts > 0
                                        ? `${scheduleAnalysis.totalConflicts} KONFLIK DITEMUKAN`
                                        : '0 KONFLIK JADWAL'
                                }
                                tone={scheduleAnalysis.totalConflicts > 0 ? 'danger' : 'success'}
                            />
                        </div>

                        {scheduleAnalysis.totalConflicts > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                {scheduleAnalysis.musammiConflicts.map((c, idx) => (
                                    <div key={`mc-${idx}`} className="p-3 rounded-lg bg-white border border-red-200 text-xs">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-red-700">Bentrok Musammi • Waktu {c.waktu}</span>
                                            <StatusBadge label="DOUBLE-BOOKED" tone="danger" />
                                        </div>
                                        <p className="text-slate-800 font-semibold">{c.musammiName}</p>
                                        <p className="text-slate-500 mt-0.5">
                                            Terdaftar di: <span className="font-medium text-slate-700">{c.halaqahNames.join(', ')}</span>
                                        </p>
                                    </div>
                                ))}
                                {scheduleAnalysis.santriConflicts.map((c, idx) => (
                                    <div key={`sc-${idx}`} className="p-3 rounded-lg bg-white border border-amber-200 text-xs">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-amber-800">Bentrok Santri • Waktu {c.waktu}</span>
                                            <StatusBadge label="BENTROK ANGGOTA" tone="warning" />
                                        </div>
                                        <p className="text-slate-800 font-semibold">{c.santriName}</p>
                                        <p className="text-slate-500 mt-0.5">
                                            Terdaftar di: <span className="font-medium text-slate-700">{c.halaqahNames.join(', ')}</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Matriks Jadwal Harian per Waktu Sesi */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {scheduleAnalysis.timeSlots.map((slot) => {
                            const slotGroups = scheduleAnalysis.bySlot[slot] || [];
                            return (
                                <div key={slot} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                            Sesi {slot}
                                        </span>
                                        <StatusBadge label={`${slotGroups.length} HALAQAH`} tone="primary" />
                                    </div>
                                    <div className="divide-y divide-slate-200 flex-1">
                                        {slotGroups.map((g) => (
                                            <div
                                                key={g.id}
                                                onClick={() => setSelectedHalaqah(g)}
                                                className="px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold text-slate-900">{g.nama}</span>
                                                    <span className="text-[11px] font-medium text-slate-500">
                                                        {(g.active_santri || g.santri || []).length} santri
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-slate-600 mt-0.5">
                                                    Musammi: <span className="font-semibold">{g.musammi?.nama || '-'}</span> • {g.marhalah}
                                                </div>
                                            </div>
                                        ))}
                                        {slotGroups.length === 0 && (
                                            <div className="px-4 py-8 text-center text-xs text-slate-400">
                                                Tidak ada halaqah terjadwal pada waktu {slot}.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                // LIST VIEW
                <>
                    <div className="flex flex-col sm:flex-row gap-3 justify-end mt-2 md:-mt-20 z-10 relative pointer-events-none">
                        <div className="pointer-events-auto flex flex-col sm:flex-row gap-3">
                            {selectedHalaqahIds.length > 0 && (
                                <button 
                                    onClick={handleBulkDelete} 
                                    disabled={isSubmitting}
                                    className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-50 px-4 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-100 gap-2 border border-rose-200"
                                >
                                    <Trash size={16} strokeWidth={2.5}/> Arsipkan {selectedHalaqahIds.length} Terpilih
                                </button>
                            )}

                            <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv,.xlsx,.xls" className="hidden" />
                            
                            <ActionDropdown label="Export" icon={<Download size={14}/>}>
                                <button onClick={handleExportExcel} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                    <FileSpreadsheet size={14} className="mr-2 text-green-600"/> Export Excel Lengkap
                                </button>
                                <button onClick={handleExportPDF} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                                    <FileText size={14} className="mr-2 text-red-600"/> Export PDF Lengkap
                                </button>
                            </ActionDropdown>
                            
                            <ActionDropdown label="Import" icon={<Upload size={14}/>}>
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                    <FileSpreadsheet size={14} className="mr-2 text-green-600"/> Upload File
                                </button>
                                <button onClick={handleDownloadTemplate} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                                    <Download size={14} className="mr-2 text-blue-600"/> Unduh Templat
                                </button>
                            </ActionDropdown>
                            
                            <button 
                                onClick={() => { setModalType('create'); setNewHalaqahName(''); setNoUrut(999); setSelectedSantriIds([]); setSelectedWaktu([Waktu.Shubuh, Waktu.Ashar, Waktu.Isya]); setSelectedMusammiId(''); }} 
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-5 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all hover:bg-blue-700 hover:-translate-y-0.5 gap-2"
                            >
                                <Plus size={16} strokeWidth={2.5}/> Buat Baru
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        {/* Filters */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50/30">
                            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="w-full md:w-1/3 relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input 
                                        type="text" 
                                        placeholder="Cari halaqah atau musammi..."
                                        value={filterSearch} 
                                        onChange={e => setFilterSearch(e.target.value)} 
                                        className="w-full pl-10 pr-4 h-10 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] transition-all shadow-[0_2px_4px_rgba(0,0,0,0.02)] placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                                    <div className="relative flex-shrink-0 group flex items-center">
                                        <div className="relative">
                                            <select 
                                                value={filterJenis} onChange={e => setFilterJenis(e.target.value as any)}
                                                className="w-full sm:w-[160px] h-10 pl-4 pr-10 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-[12px] font-medium text-slate-700 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)] appearance-none cursor-pointer hover:border-slate-300"
                                            >
                                                <option value="all">Semua Jenis</option>{availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ChevronDown size={14}/></div>
                                        </div>
                                    </div>
                                    <div className="relative flex-shrink-0 group flex items-center">
                                        <div className="relative">
                                            <select 
                                                value={filterMarhalah} onChange={e => setFilterMarhalah(e.target.value as any)}
                                                className="w-full sm:w-[160px] h-10 pl-4 pr-10 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-[12px] font-medium text-slate-700 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)] appearance-none cursor-pointer hover:border-slate-300"
                                            >
                                                <option value="all">Semua Marhalah</option>{masterMarhalahs?.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map((m: any) => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ChevronDown size={14}/></div>
                                        </div>
                                    </div>
                                    <div className="relative flex-shrink-0 group min-w-[140px]">
                                        <div className="relative">
                                            <select 
                                                value={filterStatus}
                                                onChange={(e) => setFilterStatus(e.target.value as any)}
                                                className="w-full appearance-none bg-slate-50 border border-slate-200/80 text-slate-700 text-[12px] font-semibold rounded-lg pl-3 pr-8 py-2.5 outline-none hover:bg-slate-100/50 hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                                            >
                                                <option value="Aktif">Status: Aktif</option>
                                                <option value="Diarsipkan">Status: Diarsipkan</option>
                                                <option value="Semua">Status: Semua</option>
                                            </select>
                                            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ChevronDown size={14}/></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-200/60">
                                        <th className="px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-slate-400 w-12 text-center border-r border-slate-100">
                                            <button onClick={toggleSelectAll} className="text-slate-400 hover:text-blue-600 transition-colors">
                                                {selectedHalaqahIds.length === filteredHalaqah.length && filteredHalaqah.length > 0 
                                                    ? <CheckSquare size={16} className="text-blue-600"/> 
                                                    : <Square size={16}/>
                                                }
                                            </button>
                                        </th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 w-16 text-center">No/ID</th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Nama Halaqah & Jenis</th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Musammi'</th>
                                        <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Waktu</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80">
                                    {paginatedHalaqah.map(h => {
                                        const isSelected = selectedHalaqahIds.includes(h.id);
                                        return (
                                            <tr key={h.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/50' : ''}`} onClick={() => { setSelectedHalaqah(h); setShowRiwayat(false); setRosterAsOfDate(''); }}>
                                                <td className="px-6 py-4 border-r border-slate-100/80 text-center" onClick={(e) => { e.stopPropagation(); toggleSelectRow(h.id); }}>
                                                    {isSelected ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16} className="text-slate-300 group-hover:text-slate-400"/>}
                                                </td>
                                                <td className="px-6 py-4 text-[11px] font-mono font-bold text-slate-400 text-center flex flex-col">
                                                    <span className="text-[13px] text-slate-700">{h.no_urut || '-'}</span>
                                                    <span className="text-[10px] font-normal opacity-70">#{h.id}</span>
                                                </td>
                                                <td className="px-6 py-4 border-l border-slate-100/80">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{h.nama}</span>
                                                            {h.is_active === false && (
                                                                <span className="text-[9px] font-bold tracking-wider uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">Arsip</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] font-bold tracking-wider uppercase text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200">{h.jenis}</span>
                                                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest"><MarhalahLabel text={h.marhalah} id={h.marhalah_id} /></span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-bold text-slate-700">
                                                    <div>{h.musammi.nama}</div>
                                                    {(h.substitute_musammi || []).length > 0 && (
                                                        <div className="text-[11px] font-semibold text-indigo-600 mt-0.5">
                                                            Pengganti: {(h.substitute_musammi || []).map((s) => s.nama).join(', ')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 border-l border-slate-100/80 text-[12px] font-medium text-slate-500 max-w-[150px] truncate" title={h.waktu.join(', ')}>
                                                    <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1 rounded-md w-fit border border-slate-200/60 font-semibold shadow-sm">
                                                        <Clock size={12}/> {h.waktu.join(', ')}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredHalaqah.length === 0 && <tr><td colSpan={5} className="text-center py-16 text-[13px] text-slate-500 font-medium">Tidak ada data ditemukan.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        {filteredHalaqah.length > itemsPerPage && (
                            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-600">
                                <span>
                                    Menampilkan <span className="font-bold">{paginatedHalaqah.length}</span> dari <span className="font-bold">{filteredHalaqah.length}</span> kelompok halaqah
                                </span>
                                <div className="inline-flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        className="px-3 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold"
                                    >
                                        Sebelumnya
                                    </button>
                                    <span className="font-mono">
                                        Hal {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        className="px-3 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold"
                                    >
                                        Berikutnya
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Create Modal */}
                    <Modal isOpen={modalType === 'create'} onClose={() => setModalType(null)} title="Buat Halaqah Baru">
                        {renderFormContent(false)}
                    </Modal>
                </>
            )}

            {/* Manage Status Modal */}
            <Modal isOpen={manageStatusModalOpen} onClose={() => setManageStatusModalOpen(false)} title="Kelola Status Santri">
                <form onSubmit={handleManageStatusSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Pilih Aksi</label>
                        <div className="relative">
                            <select 
                                value={manageStatusType}
                                onChange={(e) => setManageStatusType(e.target.value as 'mutasi' | 'keluar')}
                                className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-[13px] font-medium text-slate-700 transition-all appearance-none"
                            >
                                <option value="mutasi">Pindah Halaqah</option>
                                <option value="keluar">Keluar / Berhenti</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tanggal Berubah <span className="text-red-500">*</span></label>
                        <input 
                            type="date"
                            value={manageDate}
                            onChange={(e) => setManageDate(e.target.value)}
                            className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-[13px] font-medium text-slate-700 transition-all"
                            required
                        />
                    </div>

                    {manageStatusType === 'mutasi' && (
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Halaqah Tujuan <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <select 
                                    value={manageTargetHalaqahId}
                                    onChange={(e) => setManageTargetHalaqahId(e.target.value)}
                                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-[13px] font-medium text-slate-700 transition-all appearance-none"
                                    required={manageStatusType === 'mutasi'}
                                >
                                    <option value="" disabled>Pilih Halaqah Tujuan...</option>
                                    {halaqah.filter(h => h.id !== selectedHalaqah?.id).map(h => (
                                        <option key={h.id} value={h.id}>{h.nama} - {h.jenis} ({h.musammi.nama})</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <ChevronDown size={16} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100">
                        <button type="button" onClick={() => setManageStatusModalOpen(false)} className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-[13px] font-bold hover:bg-slate-50 transition-colors">Batal</button>
                        <button type="submit" disabled={isSubmitting || (manageStatusType === 'mutasi' && !manageTargetHalaqahId)} className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-all">
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Status'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default HalaqahPage;
