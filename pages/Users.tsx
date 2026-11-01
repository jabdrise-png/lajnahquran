
import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabaseClient';
import { createClient } from '@supabase/supabase-js'; 
import { Trash2, Search, ShieldCheck, Shield, Building, Plus, Edit, User, Mail, KeyRound, CheckCircle, Clock, Copy, Hash, Users as UsersIcon, BookOpen } from 'lucide-react';

interface UserProfile {
    id: string;
    full_name: string;
    email: string | null;
    role: string;
    organization_id: string;
    organizations: {
        name: string;
        id: string;
    } | null;
}

interface Organization {
    id: string;
    name: string;
}

const Users: React.FC = () => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null); // For editing
    
    // Form Data
    const [creationType, setCreationType] = useState<'new_org' | 'existing_org'>('new_org');
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        mahadName: '',
        targetOrgId: '', // For existing org
        role: 'admin' // default
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            let currentProfile = null;
            if (session) {
                const { data } = await supabase.from('profiles').select('id, role, organization_id').eq('id', session.user.id).single();
                currentProfile = data;
                setCurrentUser(data);
            }

            // Fetch Users
            let query = supabase
                .from('profiles')
                .select(`
                    id,
                    organization_id,
                    full_name,
                    email,
                    role,
                    organizations ( id, name )
                `)
                .order('role', { ascending: false });
                
            if (currentProfile && currentProfile.role !== 'super_admin') {
                query = query.eq('organization_id', currentProfile.organization_id);
            }

            const { data: userData, error: userError } = await query;

            if (userError) throw userError;
            
            // Manual sort to put 'pending' at top
            const sortedData = (userData as unknown as UserProfile[]).sort((a, b) => {
                if (a.role === 'pending' && b.role !== 'pending') return -1;
                if (a.role !== 'pending' && b.role === 'pending') return 1;
                return 0;
            });
            setUsers(sortedData);

            // Fetch Organizations (For Dropdown)
            const { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .select('id, name')
                .order('name');
            
            if (!orgError && orgData) {
                setOrganizations(orgData);
            }

        } catch (error: any) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleApproveUser = async (id: string, name: string) => {
        if(window.confirm(`Setujui pendaftaran "${name}"?\nUser ini akan mendapatkan akses sebagai Admin Ma'had.`)) {
            try {
                let query = supabase
                    .from('profiles')
                    .update({ role: 'admin' })
                    .eq('id', id);
                if (currentUser && currentUser.role !== 'super_admin' && currentUser.organization_id) {
                    query = query.eq('organization_id', currentUser.organization_id);
                }
                const { error } = await query;
                
                if (error) throw error;
                fetchData();
            } catch (e: any) {
                alert(`Gagal: ${e.message}`);
            }
        }
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if(window.confirm(`PERINGATAN: Anda yakin ingin menghapus user "${name}"?\nUser ini tidak akan bisa login lagi dan aksesnya akan dicabut.`)) {
            try {
                let query = supabase.from('profiles').delete().eq('id', id);
                if (currentUser && currentUser.role !== 'super_admin' && currentUser.organization_id) {
                    query = query.eq('organization_id', currentUser.organization_id);
                }
                const { error } = await query;
                if (error) throw error;
                alert(`User ${name} berhasil dihapus.`);
                fetchData();
            } catch (e: any) {
                alert(`Gagal menghapus: ${e.message}`);
            }
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('ID Organisasi disalin: ' + text);
    };

    const openAddModal = () => {
        setModalMode('add');
        if (currentUser?.role === 'super_admin') {
            setCreationType('new_org');
            setFormData({ email: '', password: '', fullName: '', mahadName: '', targetOrgId: '', role: 'admin' });
        } else {
            setCreationType('existing_org');
            setFormData({ email: '', password: '', fullName: '', mahadName: '', targetOrgId: currentUser?.organization_id || '', role: 'admin' });
        }
        setIsModalOpen(true);
    };

    const openEditModal = (user: UserProfile) => {
        setModalMode('edit');
        setCurrentUserId(user.id);
        setFormData({
            email: user.email || '',
            password: '', // Password unused in edit
            fullName: user.full_name || '',
            mahadName: user.organizations?.name || '',
            targetOrgId: user.organization_id || '',
            role: user.role || 'admin'
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        // Validation
        if (!formData.fullName) {
            alert("Nama Lengkap wajib diisi.");
            return;
        }
        
        if (modalMode === 'add') {
            if (!formData.email || !formData.password) {
                alert("Email dan Password wajib diisi untuk user baru.");
                return;
            }
            if (creationType === 'new_org' && !formData.mahadName) {
                alert("Nama Ma'had wajib diisi untuk pembuatan Ma'had baru.");
                return;
            }
            if (creationType === 'existing_org' && !formData.targetOrgId) {
                alert("Silakan pilih Ma'had yang sudah ada.");
                return;
            }
        } else {
            // Edit Mode Validation
            if (!formData.mahadName && modalMode === 'edit') {
                 alert("Nama Ma'had tidak boleh kosong.");
                 return;
            }
        }

        setIsSubmitting(true);

        try {
            if (modalMode === 'add') {
                // --- ADD NEW USER FLOW ---
                // PASTIKAN KEYS INI SAMA PERSIS DENGAN lib/supabaseClient.ts
                
                
                
                const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, {
                    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'temp-auth-key-' + Math.random().toString(36).substring(7) }
                }) as any;

                // Prepare Metadata
                const metaData: any = {
                    full_name: formData.fullName,
                    role: formData.role
                };

                if (creationType === 'new_org') {
                    metaData.mahad_name = formData.mahadName;
                } else {
                    // PENTING: Kirim string kosong jika targetOrgId undefined/null,
                    // tapi jika ada isinya, kirim sebagai string UUID.
                    metaData.target_organization_id = formData.targetOrgId || ''; 
                }

                // Create User in Auth
                const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                    email: formData.email,
                    password: formData.password,
                    options: { data: metaData }
                });

                if (authError) throw authError;
                if (!authData.user) throw new Error("Gagal membuat user auth.");

                // PENTING: Tunggu trigger database selesai memproses 'handle_new_user'
                // Karena proses ini async di sisi server database
                await new Promise(r => setTimeout(r, 2500));
                
                alert("User baru berhasil dibuat! Silakan cek tabel.");

            } else {
                // --- EDIT USER FLOW ---
                if (!currentUserId) return;
                const userToEdit = users.find(u => u.id === currentUserId);
                if (!userToEdit) return;

                // Update Profile
                let profileUpdateQuery = supabase
                    .from('profiles')
                    .update({ 
                        full_name: formData.fullName,
                        role: formData.role
                    })
                    .eq('id', currentUserId);
                if (currentUser && currentUser.role !== 'super_admin' && currentUser.organization_id) {
                    profileUpdateQuery = profileUpdateQuery.eq('organization_id', currentUser.organization_id);
                }
                const { error: profileError } = await profileUpdateQuery;

                if (profileError) throw profileError;

                // Update Org Name (Only if super_admin and org name actually changed)
                if (currentUser?.role === 'super_admin' && userToEdit.organization_id && formData.mahadName && formData.mahadName !== userToEdit.organizations?.name) {
                    const { error: orgError } = await supabase
                        .from('organizations')
                        .update({ name: formData.mahadName })
                        .eq('id', userToEdit.organization_id);
                    if (orgError) throw orgError;
                }
                
                alert("Data user berhasil diperbarui.");
            }

            setIsModalOpen(false);
            await fetchData(); // Force Refresh

        } catch (e: any) {
            console.error(e);
            alert(`Gagal: ${e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredUsers = users.filter(u => 
        (u.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.organizations?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <Card title={currentUser?.role === 'super_admin' ? "Manajemen Users (Super Admin)" : "Manajemen Users"}>
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <p className="text-sm text-slate-500">
                        Total {users.length} pengguna terdaftar.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Cari nama, email, atau ma'had..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm py-2"
                            />
                        </div>
                        {['super_admin', 'admin', 'admin_mahad'].includes(currentUser?.role) && (
                            <button 
                                onClick={openAddModal}
                                className="bg-secondary text-white font-semibold py-2 px-4 rounded-lg hover:bg-accent transition-colors flex items-center justify-center text-sm shadow-sm whitespace-nowrap"
                            >
                                <Plus size={18} className="mr-2" /> Tambah User Manual
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b">
                            <tr>
                                <th className="px-6 py-3">Nama Lengkap</th>
                                <th className="px-6 py-3">Email</th>
                                <th className="px-6 py-3">Role / Status</th>
                                <th className="px-6 py-3">Nama Ma'had & ID</th>
                                <th className="px-6 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Memuat data users...</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Tidak ada user ditemukan.</td></tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${user.role === 'pending' ? 'bg-yellow-50/50' : ''}`}>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {user.full_name || 'Tanpa Nama'}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">
                                            {user.email || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.role === 'super_admin' ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                                    <ShieldCheck size={12} className="mr-1"/> Super Admin
                                                </span>
                                            ) : user.role === 'pending' ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 animate-pulse">
                                                    <Clock size={12} className="mr-1"/> Menunggu Persetujuan
                                                </span>
                                            ) : user.role === 'musammi' ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                                    <UsersIcon size={12} className="mr-1"/> Musammi
                                                </span>
                                            ) : user.role === 'pengajar' ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                                    <BookOpen size={12} className="mr-1"/> Pengajar
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    <Shield size={12} className="mr-1"/> Admin Ma'had
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.organizations ? (
                                                <div>
                                                    <div className="flex items-center mb-1">
                                                        <Building size={14} className="mr-2 text-slate-400"/>
                                                        <span className="font-semibold text-slate-800">{user.organizations.name}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => copyToClipboard(user.organizations?.id || '')}
                                                        className="flex items-center text-xs text-slate-400 hover:text-secondary bg-slate-50 px-2 py-1 rounded border border-slate-100 hover:border-slate-300 transition-all"
                                                        title="Salin ID Organisasi"
                                                    >
                                                        <Hash size={10} className="mr-1"/>
                                                        <span className="font-mono">{user.organizations.id.slice(0, 8)}...</span>
                                                        <Copy size={10} className="ml-2"/>
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-red-400 italic">Tidak ada Org</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {user.role === 'pending' && (
                                                    <button 
                                                        onClick={() => handleApproveUser(user.id, user.full_name)}
                                                        className="bg-green-600 text-white hover:bg-green-700 transition-colors p-1.5 rounded-md text-xs font-bold flex items-center mr-2 shadow-sm"
                                                        title="Setujui User Ini"
                                                    >
                                                        <CheckCircle size={14} className="mr-1" /> Setujui
                                                    </button>
                                                )}
                                                
                                                <button 
                                                    onClick={() => openEditModal(user)}
                                                    className="text-slate-400 hover:text-secondary transition-colors p-1 rounded-full hover:bg-slate-100"
                                                    title="Edit User"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                
                                                {user.role !== 'super_admin' && (
                                                    <button 
                                                        onClick={() => handleDeleteUser(user.id, user.full_name)}
                                                        className="text-slate-400 hover:text-error transition-colors p-1 rounded-full hover:bg-red-50"
                                                        title="Hapus User"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                title={modalMode === 'add' ? "Tambah User Baru" : "Edit Data User"}
            >
                <div className="space-y-4">
                    {/* --- ADD MODE ONLY FIELDS --- */}
                    {modalMode === 'add' && (
                        <>
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email (Login)</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail size={16} className="text-slate-400"/></div>
                                        <input 
                                            type="email" 
                                            className="pl-10 block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                                            value={formData.email}
                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                            placeholder="email@contoh.com"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><KeyRound size={16} className="text-slate-400"/></div>
                                        <input 
                                            type="password" 
                                            className="pl-10 block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                                            value={formData.password}
                                            onChange={e => setFormData({...formData, password: e.target.value})}
                                            placeholder="Minimal 6 karakter"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* --- PILIHAN TIPE ORGANISASI --- */}
                            {currentUser?.role === 'super_admin' ? (
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                                    <label className="block text-sm font-bold text-slate-700">Tujuan Organisasi</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="creationType" 
                                                checked={creationType === 'new_org'} 
                                                onChange={() => setCreationType('new_org')} 
                                                className="h-4 w-4 text-secondary focus:ring-secondary border-gray-300"
                                            />
                                            <span className="ml-2 text-sm text-slate-700">Buat Ma'had Baru</span>
                                        </label>
                                        <label className="flex items-center cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="creationType" 
                                                checked={creationType === 'existing_org'} 
                                                onChange={() => setCreationType('existing_org')} 
                                                className="h-4 w-4 text-secondary focus:ring-secondary border-gray-300"
                                            />
                                            <span className="ml-2 text-sm text-slate-700">Pilih Ma'had Ada</span>
                                        </label>
                                    </div>

                                    {creationType === 'new_org' ? (
                                        <div className="mt-2">
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Nama Ma'had Baru</label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Building size={16} className="text-slate-400"/></div>
                                                <input 
                                                    type="text" 
                                                    className="pl-10 block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                                                    value={formData.mahadName}
                                                    onChange={e => setFormData({...formData, mahadName: e.target.value})}
                                                    placeholder="Contoh: Ma'had Al Faruq Cabang X"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-2">
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Pilih Ma'had</label>
                                            <select
                                                className="block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                                                value={formData.targetOrgId}
                                                onChange={e => setFormData({...formData, targetOrgId: e.target.value})}
                                            >
                                                <option value="">-- Pilih Organisasi --</option>
                                                {organizations.map(org => (
                                                    <option key={org.id} value={org.id}>{org.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Tujuan Organisasi</label>
                                    <div className="text-sm text-slate-600 font-medium">
                                        <Building size={14} className="inline mr-2 text-slate-400" />
                                        {currentUser?.organizations?.name || 'Ma\'had Anda'}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* --- EDIT MODE DISPLAY --- */}
                    {modalMode === 'edit' && (
                        <>
                            <div className="mb-2">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Email Akun</label>
                                <div className="p-2 bg-slate-100 rounded text-slate-600 text-sm font-mono">{formData.email}</div>
                            </div>
                            
                            {/* Org Name Editing is only allowed here, not switching orgs */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Ma'had</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Building size={16} className="text-slate-400"/></div>
                                    <input 
                                        type="text" 
                                        className="pl-10 block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                                        value={formData.mahadName}
                                        onChange={e => setFormData({...formData, mahadName: e.target.value})}
                                        disabled={currentUser?.role !== 'super_admin'}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- COMMON FIELDS --- */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap Admin</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User size={16} className="text-slate-400"/></div>
                            <input 
                                type="text" 
                                className="pl-10 block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                                value={formData.fullName}
                                onChange={e => setFormData({...formData, fullName: e.target.value})}
                                placeholder="Contoh: Ustadz Abdullah"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role / Peran</label>
                        <select 
                            className="block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                            value={formData.role}
                            onChange={e => setFormData({...formData, role: e.target.value})}
                        >
                            <option value="admin">Admin Ma'had</option>
                            <option value="pengajar">Pengajar (Wali Kelas)</option>
                            <option value="musammi">Grup/Instruktur (Musammi)</option>
                            <option value="pending">Pending (Menunggu Persetujuan)</option>
                            {currentUser?.role === 'super_admin' && (
                                <option value="super_admin">Super Admin</option>
                            )}
                        </select>
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <button 
                            onClick={() => setIsModalOpen(false)}
                            className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Batal
                        </button>
                        <button 
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="bg-secondary text-white font-semibold py-2 px-4 rounded-lg hover:bg-accent transition-colors disabled:bg-slate-400"
                        >
                            {isSubmitting ? 'Menyimpan...' : (modalMode === 'add' ? 'Buat User' : 'Simpan Perubahan')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Users;
