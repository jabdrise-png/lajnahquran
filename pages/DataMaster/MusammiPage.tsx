
import React, { useState, useRef, useMemo, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { Marhalah, Musammi } from '../../types';
import { Plus, Trash, Upload, Download, Search, Edit, FileSpreadsheet, FileText, ChevronRight } from 'lucide-react';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { PageHeader, StatusBadge, LoadingState } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';

const MusammiPage: React.FC = () => {
    const { musammi, santri, fetchData, loading, error, getOrgId, selectedAcademicYear, masterKelas, globalMarhalahs, masterMarhalahs, masterKelasRelasi } = useSupabaseData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingPerson, setEditingPerson] = useState<Musammi | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;
    const [formData, setFormData] = useState({
        santriId: '', nama: '', kode: '', marhalah: '' as string, 
        kelas: '', no_hp: '', isNew: false, user_id: '' as string | null
    });
    
    // Filters
    const [filterMarhalah, setFilterMarhalah] = useState<string | 'all'>('all');
    const [filterKelas, setFilterKelas] = useState<string | 'all'>('all');
    const [search, setSearch] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Auth Profiles for linking
    const [authProfiles, setAuthProfiles] = useState<any[]>([]);

    useEffect(() => {
        const fetchAuthProfiles = async () => {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('organization_id', orgId)
                .eq('role', 'musammi');
            if (data) setAuthProfiles(data);
        };
        fetchAuthProfiles();
    }, [getOrgId]);

    // Account Creation Modal State (Serverless /api/invitations)
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [accountData, setAccountData] = useState({
        email: '',
        password: '',
        full_name: '',
        musammi_id: ''
    });
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);

    const openAccountModal = (m: any | null = null) => {
        setAccountData({
            email: '',
            password: '',
            full_name: m ? m.nama : '',
            musammi_id: m ? m.id.toString() : ''
        });
        setIsAccountModalOpen(true);
    };

    const handleCreateAccount = async () => {
        if (!accountData.email || !accountData.full_name) {
            NotificationStore.addNotification('Email dan nama lengkap wajib diisi.', 'error');
            return;
        }
        if (accountData.password && accountData.password.trim().length > 0 && accountData.password.trim().length < 8) {
            NotificationStore.addNotification('Kode verifikasi minimal 8 karakter (atau kosongkan agar dibuat otomatis).', 'error');
            return;
        }

        const orgId = await getOrgId();
        if (!orgId) return;

        setIsCreatingAccount(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) {
                throw new Error('Sesi autentikasi Admin tidak ditemukan. Silakan muat ulang halaman.');
            }

            const resp = await fetch('/api/invitations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    email: accountData.email.trim(),
                    password: accountData.password.trim() || undefined,
                    fullName: accountData.full_name.trim(),
                    role: 'musammi',
                    organizationId: orgId.trim(),
                    musammiId: accountData.musammi_id ? parseInt(accountData.musammi_id, 10) : null
                })
            });

            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(json.error || `Gagal membuat undangan akun Musammi (HTTP ${resp.status}).`);
            }

            const inviteLink = json.inviteAcceptPath ? `${window.location.origin}${json.inviteAcceptPath}` : '';
            if (inviteLink && navigator.clipboard) {
                try {
                    await navigator.clipboard.writeText(inviteLink);
                } catch {}
            }

            NotificationStore.addNotification(
                `Undangan akun Musammi berhasil diterbitkan dan ditautkan!${inviteLink ? ' Tautan aktivasi /invite telah disalin ke clipboard.' : ''}`,
                'success'
            );
            setIsAccountModalOpen(false);
            
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('organization_id', orgId)
                .eq('role', 'musammi');
            if (data) setAuthProfiles(data);
            await fetchData();
        } catch (e: any) {
            console.error(e);
            NotificationStore.addNotification('Gagal membuat akun: ' + e.message, 'error');
        } finally {
            setIsCreatingAccount(false);
        }
    };

    // Custom Kelas State
    const [isCustomKelas, setIsCustomKelas] = useState(false);
    const [customKelas, setCustomKelas] = useState('');

    // Filters for Modal
    const [modalMarhalah, setModalMarhalah] = useState<string | 'all'>('all');
    const [modalKelas, setModalKelas] = useState<string | 'all'>('all');

    const availableFilterKelasList = useMemo(() => {
        if (filterMarhalah === 'all') return [];
        return masterKelas.filter(m => m.marhalah === filterMarhalah).map(m => m.nama_kelas);
    }, [filterMarhalah, masterKelas]);

    const availableModalFilterKelasList = useMemo(() => {
        if (modalMarhalah === 'all') return [];
        return masterKelas.filter(m => m.marhalah === modalMarhalah).map(m => m.nama_kelas);
    }, [modalMarhalah, masterKelas]);

    const availableFormKelasList = useMemo(() => {
        if (!formData.marhalah) return [];
        return masterKelas.filter(m => m.marhalah === formData.marhalah).map(m => m.nama_kelas);
    }, [formData.marhalah, masterKelas]);

    const filteredData = useMemo(() => {
        return musammi.filter(m => {
            if (filterMarhalah !== 'all' && m.marhalah !== filterMarhalah) return false;
            if (filterKelas !== 'all' && m.kelas !== filterKelas) return false;
            if (search && !m.nama.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        }).sort((a, b) => {
            const marhalahOrder = globalMarhalahs;
            const mIdxA = marhalahOrder.indexOf(a.marhalah);
            const mIdxB = marhalahOrder.indexOf(b.marhalah);
            if (mIdxA !== mIdxB) return mIdxA - mIdxB;
            if (a.kelas !== b.kelas) return (a.kelas || '').localeCompare(b.kelas || '', undefined, { numeric: true });
            return (a.nama || '').localeCompare(b.nama || '');
        });
    }, [musammi, filterMarhalah, filterKelas, search, globalMarhalahs]);

    const filteredSantri = useMemo(() => {
        return santri.filter(s => {
            if (s.kelas === '-') return false;
            if (modalMarhalah !== 'all' && s.marhalah !== modalMarhalah) return false;
            if (modalKelas !== 'all' && s.kelas !== modalKelas) return false;
            return true;
        });
    }, [santri, modalMarhalah, modalKelas]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    const openModal = (person: Musammi | null) => {
        setEditingPerson(person);
        setIsCustomKelas(false);
        setCustomKelas('');
        if (person) {
            const predefinedClasses = masterKelas.filter(m => m.marhalah === person.marhalah).map(m => m.nama_kelas);
            if (!predefinedClasses.includes(person.kelas)) {
                setIsCustomKelas(true);
                setCustomKelas(person.kelas);
            }
            setFormData({
                santriId: person.santri_id ? person.santri_id.toString() : 'null', nama: person.nama, kode: person.kode || '', marhalah: person.marhalah,
                kelas: person.kelas, no_hp: (person as any).no_hp || '', isNew: false, user_id: person.user_id || ''
            });
        } else {
            setFormData({
                santriId: 'null', nama: '', kode: '', marhalah: '',
                kelas: '', no_hp: '', isNew: true, user_id: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSantriSelect = (santriId: string) => {
        if (santriId === 'null') {
            setFormData({ ...formData, santriId: 'null', isNew: true, nama: '', no_hp: '', marhalah: '', kelas: '' });
        } else {
            const s = santri.find(s => s.id.toString() === santriId);
            if (s) {
                setFormData({ 
                    ...formData, santriId: santriId, isNew: false, 
                    nama: s.nama, marhalah: s.marhalah, kelas: s.kelas, no_hp: s.no_hp_wali || '' 
                });
            }
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const orgId = await getOrgId();
            if (!selectedAcademicYear) throw new Error("Tahun ajaran belum dipilih");
            
            const finalKelas = isCustomKelas ? customKelas : formData.kelas;
            
            const m_id = masterMarhalahs?.find((m) => m.nama === formData.marhalah)?.id || null;
            const k_id = masterKelasRelasi?.find((k) => k.nama_kelas === finalKelas && k.marhalah_id === m_id)?.id || null;

            const legacyEnumList = ['Mutawassithah', 'Aliyah', 'Jamiah'];
            const safeLegacyMarhalah = formData.marhalah && legacyEnumList.includes(formData.marhalah) ? formData.marhalah : (formData.marhalah ? 'Mutawassithah' : null);

            const payload: any = {
                santri_id: formData.santriId !== 'null' ? parseInt(formData.santriId) : null,
                marhalah_id: m_id,
                kelas_id: k_id,
                organization_id: orgId,
                academic_year_id: selectedAcademicYear.id,
                nama: formData.nama, 
                marhalah: formData.marhalah || null, 
                kelas: finalKelas || null,
                kode: formData.kode || null, no_hp: formData.no_hp || null,
                user_id: formData.user_id || null
            };
            let savedMusammiId = editingPerson?.id;
            if (editingPerson) {
                delete payload.organization_id;
                let { error } = await supabase.from('musammi').update(payload).eq('id', editingPerson.id).eq('organization_id', orgId);
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await supabase.from('musammi').update(payload).eq('id', editingPerson.id).eq('organization_id', orgId);
                    error = res.error;
                }
                if (error) throw error;
            } else {
                let { data, error } = await supabase.from('musammi').insert(payload).select().single();
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await supabase.from('musammi').insert(payload).select().single();
                    data = res.data;
                    error = res.error;
                }
                if (error) throw error;
                savedMusammiId = data?.id;
            }

            // Dual-write sinkronisasi ke tabel kanonikal musammi_staff (V2)
            if (savedMusammiId) {
                try {
                    await (supabase as any).from('musammi_staff').upsert(
                        {
                            organization_id: orgId,
                            legacy_musammi_id: savedMusammiId,
                            user_id: formData.user_id || null,
                            santri_id: formData.santriId !== 'null' ? parseInt(formData.santriId, 10) : null,
                            nama: formData.nama,
                            kode: formData.kode || null,
                            no_hp: formData.no_hp || null,
                            status: 'active',
                        },
                        { onConflict: 'organization_id,legacy_musammi_id' }
                    );
                } catch {}
            }

            await fetchData();
            setIsModalOpen(false);
            NotificationStore.addNotification('Data Musammi berhasil disimpan.', 'success');
        } catch (e: any) { NotificationStore.addNotification(e.message, 'error'); } 
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (id: number) => {
        const orgId = await getOrgId();
        if (!orgId) return;
        await supabase.from('musammi').delete().eq('id', id).eq('organization_id', orgId);
        await fetchData();
        setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        NotificationStore.addNotification('Data Musammi berhasil dihapus.', 'success');
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const orgId = await getOrgId();
        if (!orgId) return;
        await supabase.from('musammi').delete().in('id', selectedIds).eq('organization_id', orgId);
        await fetchData();
        setSelectedIds([]);
        NotificationStore.addNotification('Data Musammi terpilih berhasil dihapus.', 'success');
    };

    const toggleSelection = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(paginatedData.map(m => m.id));
        } else {
            setSelectedIds([]);
        }
    };

    // Import/Export
    const handleDownloadTemplate = () => {
        const headers = ['Tipe (Santri/Independen)', 'ID Santri', 'Nama Lengkap', 'Marhalah', 'Kelas', 'No HP', 'Kode'];
        const dummy1 = ['Independen', '', 'Ustadz Fulan', 'Aliyah', '3A', '08123456789', 'M001'];
        const dummy2 = ['Santri', '201', 'Ahmad Santri', '', '', '', 'M002'];
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), dummy1.join(','), dummy2.join(',')].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "template_musammi_baru.csv");
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
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
            let success = 0; let fail = 0;
            for (const row of csvData) {
                const tipe = String(row['tipe (santri/independen)'] || row.tipe || '').toLowerCase();
                const idSantri = parseInt(row['id santri'] || row.id_santri) || null;
                const nama = row['nama lengkap'] || row.nama;
                
                let finalNama = nama;
                let finalMarhalah = row.marhalah || null;
                let finalKelas = row.kelas?.toString() || null;
                let finalNoHp = row['no hp'] || row.no_hp?.toString() || null;

                if ((tipe === 'santri' || idSantri) && idSantri) {
                    const foundSantri = santri.find(s => s.id === idSantri);
                    if (foundSantri) {
                        finalNama = finalNama || foundSantri.nama;
                        finalMarhalah = finalMarhalah || foundSantri.marhalah;
                        finalKelas = finalKelas || foundSantri.kelas;
                        finalNoHp = finalNoHp || foundSantri.no_hp_wali || null;
                    }
                }

                if (!finalNama) continue;
                
                
                const m_nama = finalMarhalah || 'Belum Diisi';
                const k_nama = finalKelas || 'Belum Diisi';
                const m_id = masterMarhalahs?.find((m) => m.nama === m_nama)?.id || null;
                const k_id = masterKelasRelasi?.find((k) => k.nama_kelas === k_nama && k.marhalah_id === m_id)?.id || null;

                const payload = {
                    organization_id: orgId,
                    academic_year_id: selectedAcademicYear.id,
                    santri_id: idSantri,
                    nama: finalNama, 
                    marhalah: m_nama,
                    kelas: k_nama, 
                    kode: row.kode?.toString() || null, 
                    no_hp: finalNoHp,
                    marhalah_id: m_id,
                    kelas_id: k_id
                };
                const { error } = await supabase.from('musammi').insert(payload);
                if (error) {
                    console.error('Insert error:', error);
                    fail++;
                } else success++;
            }
            await fetchData();
            NotificationStore.addNotification(`Import selesai. Sukses: ${success}, Gagal: ${fail}`, fail > 0 ? 'info' : 'success');
        } catch (e: any) { NotificationStore.addNotification(`Import gagal: ${e.message}`, 'error'); }
        finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleExportPDF = () => {
        const columns = ['Kode', 'Nama', 'Marhalah', 'Kelas', 'No HP'];
        const rows = filteredData.map(m => [m.kode||'-', m.nama, m.marhalah, m.kelas, (m as any).no_hp||'-']);
        exportToPDF("Data Musammi", columns, rows, "Data_Musammi");
    };

    if (loading) return <LoadingState label="Memuat data…" />;
    if (error) return <p className="text-error">{error}</p>;

    return (
        <div className="space-y-5 pb-12 font-sans">
            <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv,.xlsx,.xls" className="hidden" />
            <PageHeader
                title="Data Musammi'"
                description="Daftar santri senior (Aliyah/Jamiah) yang bertugas menyimak hafalan."
                actions={
                    <>
                        {selectedIds.length > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                className="btn btn-danger justify-center"
                            >
                                <Trash size={16} strokeWidth={2.5}/> ({selectedIds.length})
                            </button>
                        )}
                        <ActionDropdown label="Ekspor">
                            <button onClick={() => exportToExcel(musammi, 'Data_Musammi')} className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left transition-colors">
                                <FileSpreadsheet size={15} className="mr-2 text-emerald-600"/> Ekspor Excel
                            </button>
                            <button onClick={handleExportPDF} className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100 transition-colors">
                                <FileText size={15} className="mr-2 text-red-600"/> Ekspor PDF
                            </button>
                        </ActionDropdown>

                        <ActionDropdown label="Impor">
                            <button onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left transition-colors">
                                <FileSpreadsheet size={15} className="mr-2 text-emerald-600"/> Unggah Excel/CSV
                            </button>
                            <button onClick={handleDownloadTemplate} className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100 transition-colors">
                                <Download size={15} className="mr-2 text-blue-600"/> Unduh Template
                            </button>
                        </ActionDropdown>

                        <button
                            onClick={() => openAccountModal(null)}
                            className="btn btn-secondary"
                        >
                            Akun Musammi
                        </button>
                        <button
                            onClick={() => openModal(null)}
                            className="btn btn-primary justify-center"
                        >
                            Tambah Data
                        </button>
                    </>
                }
            />

            {/* Content Wrap */}
            <div className="panel-filter">
              <div className="grid-filter sm:grid-cols-3 lg:grid-cols-3">
                <input
                  type="text"
                  placeholder="Cari nama musammi..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="kontrol kontrol-cari"
                />
                <select
                  value={filterMarhalah}
                  onChange={e => {setFilterMarhalah(e.target.value as any); setFilterKelas('all')}}
                  className="kontrol"
                >
                  <option value="all">Semua Marhalah</option>
                  {masterMarhalahs?.map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select
                  value={filterKelas}
                  onChange={e => setFilterKelas(e.target.value)}
                  disabled={filterMarhalah === 'all'}
                  className="kontrol"
                >
                  <option value="all">Semua Kelas</option>
                  {filterMarhalah !== 'all' && availableFilterKelasList.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
            <div className="wadah-tabel">
                <div className="min-h-[400px] hide-scrollbar overflow-x-auto">
                    <table className="tabel tabel-kartu">
                        <thead>
                            <tr>
                                <th className="w-[50px]">
                                    <input 
                                        type="checkbox" 
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        checked={selectedIds.length > 0 && selectedIds.length === paginatedData.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="w-[60px] text-center">
                                    No
                                </th>
                                <th className="min-w-[200px]">Nama Musammi</th>
                                <th>Marhalah & Kelas</th>
                                <th>No HP</th>
                                <th>Status akun</th>
                                <th className="text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((m, index) => {
                                const linkedProfile = authProfiles.find((p) => p.id === m.user_id);
                                return (
                                <tr key={m.id} className={`hover:bg-blue-50/30 transition-colors group ${selectedIds.includes(m.id) ? 'bg-blue-50/50' : ''}`}>
                                    <td>
                                        <input 
                                            type="checkbox" 
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={selectedIds.includes(m.id)}
                                            onChange={() => toggleSelection(m.id)}
                                        />
                                    </td>
                                    <td data-label="No" className="text-center text-sm font-medium text-slate-500">
                                        {(currentPage - 1) * itemsPerPage + index + 1}
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/60 shadow-sm relative overflow-hidden group-hover:border-blue-200 group-hover:bg-blue-50 transition-colors">
                                                <span className="text-xs font-bold text-slate-600 group-hover:text-blue-600 transition-colors">
                                                    {m.nama.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{m.nama}</p>
                                                {m.santri_id && (
                                                    <span className="text-2xs font-semibold text-blue-600">Santri Senior (#{m.santri_id})</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Marhalah & kelas">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-slate-700"><MarhalahLabel text={m.marhalah} id={m.marhalah_id} /></span>
                                            <span className="text-xs text-slate-500 font-semibold">Kelas <KelasLabel text={m.kelas} id={m.kelas_id} /></span>
                                        </div>
                                    </td>
                                    <td data-label="No HP" className="text-sm font-medium text-slate-600">
                                        {(m as any).no_hp || '-'}
                                    </td>
                                    <td data-label="Status akun">
                                        {m.user_id ? (
                                            <div className="flex flex-col gap-0.5">
                                                <StatusBadge label="TERTAUT AKUN" tone="success" />
                                                {linkedProfile?.email && (
                                                    <span className="text-2xs text-slate-500">{linkedProfile.email}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <StatusBadge label="BELUM ADA AKUN" tone="neutral" />
                                                <button
                                                    type="button"
                                                    onClick={() => openAccountModal(m)}
                                                    className="text-2xs font-semibold text-blue-600 hover:underline"
                                                >
                                                    + Buat Akun
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                    <td data-label="Aksi" className="text-right">
                                        <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex justify-end gap-2">
                                            <button onClick={() => openModal(m)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm">
                                                <Edit size={14} strokeWidth={2.5}/>
                                            </button>
                                            <button onClick={() => handleDelete(m.id)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-red-500 hover:text-white transition-all shadow-sm">
                                                <Trash size={14} strokeWidth={2.5}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-16 text-sm text-slate-500 font-medium">
                                        Tidak ada data yang ditemukan.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center bg-slate-50 border-t border-slate-100 p-4">
                        <p className="text-xs font-medium text-slate-500">
                            Menampilkan <span className="font-bold text-slate-700">{((currentPage - 1) * itemsPerPage) + 1}</span> - <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> dari <span className="font-bold text-slate-700">{filteredData.length}</span> data
                        </p>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="btn btn-secondary btn-sm"
                            >
                                Sebelumnya
                            </button>
                            <span className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 rounded-md">
                                {currentPage} / {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="btn btn-secondary btn-sm"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPerson ? "Edit Data Musammi" : "Tambah Musammi Baru"}>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Marhalah</label>
                            <select className="kontrol" value={modalMarhalah} onChange={e => setModalMarhalah(e.target.value as any)}>
                                <option value="all">Semua</option>
                                {masterMarhalahs?.map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Kelas</label>
                            <select className="kontrol" value={modalKelas} onChange={e => setModalKelas(e.target.value)}>
                                <option value="all">Semua</option>
                                {modalMarhalah !== 'all' && availableModalFilterKelasList.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pilih Santri (Tautkan Data)</label>
                        <select className="w-full border-slate-300 rounded-md text-sm" value={formData.santriId} onChange={e => handleSantriSelect(e.target.value)}>
                            <option value="null" className="font-bold text-blue-600">Bukan Santri (Input Manual / Independen)</option>
                            <option value="" disabled>-- Pilih Santri --</option>
                            {filteredSantri.map(s => <option key={s.id} value={s.id}>{s.nama} ({s.kelas})</option>)}
                        </select>
                        {editingPerson && <p className="text-2xs text-amber-600 mt-1">Jika Musammi ini adalah Santri, pastikan data Santrinya dipilih di atas agar rekap absen terintegrasi.</p>}
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nama Lengkap</label>
                        <input type="text" placeholder="Nama Lengkap" className="w-full border-slate-300 rounded-md text-sm" value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} disabled={!editingPerson && formData.santriId !== 'null'} />
                    </div>
                    
                    {(formData.santriId === 'null' || editingPerson) && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Marhalah</label>
                                <select 
                                    className="w-full border-slate-300 rounded-md text-sm" 
                                    value={formData.marhalah || ''} 
                                    onChange={e => {
                                        setFormData({...formData, marhalah: e.target.value, kelas: ''});
                                        setIsCustomKelas(false);
                                    }}
                                >
                                    <option value="">-- Pilih --</option>
                                    {masterMarhalahs?.map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                                    <option value="Lainnya">Lainnya...</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Kelas</label>
                                {isCustomKelas ? (
                                    <input 
                                        type="text" 
                                        placeholder="Ketik Kelas..." 
                                        className="w-full border-slate-300 rounded-md text-sm" 
                                        value={customKelas} 
                                        onChange={e => setCustomKelas(e.target.value)} 
                                    />
                                ) : (
                                    <select 
                                        className="w-full border-slate-300 rounded-md text-sm" 
                                        value={formData.kelas || ''} 
                                        onChange={e => {
                                            if (e.target.value === 'custom') {
                                                setIsCustomKelas(true);
                                                setCustomKelas('');
                                            } else {
                                                setFormData({...formData, kelas: e.target.value});
                                            }
                                        }}
                                    >
                                        <option value="">-- Pilih --</option>
                                        {masterKelas.filter(m => formData.marhalah && m.marhalah === formData.marhalah).map(k => <option key={k.nama_kelas} value={k.nama_kelas}>{k.nama_kelas}</option>)}
                                        <option value="custom">-- Ketik Manual --</option>
                                    </select>
                                )}
                            </div>
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">No HP</label>
                        <input type="text" placeholder="08..." className="w-full border-slate-300 rounded-md text-sm" value={formData.no_hp} onChange={e => setFormData({...formData, no_hp: e.target.value})} disabled={!editingPerson && formData.santriId !== 'null' && formData.no_hp !== ''} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Akun Login Terkait (Opsional)</label>
                        <select className="w-full border-slate-300 rounded-md text-sm" value={formData.user_id || ''} onChange={e => setFormData({...formData, user_id: e.target.value || null})}>
                            <option value="">-- Tidak dikaitkan --</option>
                            {authProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>)}
                        </select>
                        <p className="text-2xs text-slate-400 mt-1">Mengaitkan profil musammi dengan akun pengguna akan membatasi akses tampilan mereka sesuai dengan kelompok halaqah yang mereka pandu.</p>
                    </div>
                    <div className="flex justify-end pt-5 gap-3 border-t">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button onClick={handleSubmit} disabled={isSubmitting} className="btn btn-primary">{isSubmitting ? 'Menyimpan...' : 'Simpan'}</button>
                    </div>
                </div>
            </Modal>
            
            <Modal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} title="Buat Akun Akses Musammi">
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 mb-2">
                        Akun ini digunakan oleh musammi untuk masuk ke aplikasi, melihat daftar halaqah mereka, dan memberikan evaluasi hafalan ke santri.
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-red-500">*</span></label>
                        <input
                            type="email"
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.email}
                            onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                            placeholder="nama@email.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kode Verifikasi Awal (Opsional)</label>
                        <input
                            type="password"
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.password}
                            onChange={(e) => setAccountData({ ...accountData, password: e.target.value })}
                            placeholder="Kosongkan untuk kode kriptografis otomatis (min. 8 karakter)"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.full_name}
                            onChange={(e) => setAccountData({ ...accountData, full_name: e.target.value })}
                        />
                    </div>
                    <div className="pt-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kaitkan dengan Profil Musammi</label>
                        <select
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.musammi_id}
                            onChange={(e) => setAccountData({ ...accountData, musammi_id: e.target.value })}
                        >
                            <option value="">-- Buat akun saja (bisa dikaitkan nanti) --</option>
                            {musammi.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.nama} - {m.marhalah}
                                </option>
                            ))}
                        </select>
                        {accountData.musammi_id && (
                            <p className="text-xs text-emerald-600 mt-2 flex items-center">
                                Profil {musammi.find(m => m.id.toString() === accountData.musammi_id)?.nama} akan langsung dikaitkan.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end pt-5 gap-3 border-t">
                        <button onClick={() => setIsAccountModalOpen(false)} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button onClick={handleCreateAccount} disabled={isCreatingAccount} className="btn btn-primary">{isCreatingAccount ? 'Membuat Akun...' : 'Buat Akun'}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default MusammiPage;
