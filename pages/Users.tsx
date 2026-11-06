import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { supabase } from '../lib/supabaseClient';
import { Trash2, Search, Building, Plus, Edit, User, Mail, KeyRound, CheckCircle, Copy, Hash } from 'lucide-react';
import { NotificationStore } from '../lib/NotificationStore';
import { ConfirmDialog } from '../components/ui/SaaSPrimitives';
import { resolveTenantContext } from '../lib/permissions';

interface UserProfile {
    id: string;
    full_name: string;
    email: string | null;
    role: string;
    grant_id?: string | null;
    grant_status?: 'active' | 'invited' | 'suspended' | 'revoked' | 'expired';
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
    const [confirmApproveTarget, setConfirmApproveTarget] = useState<{ id: string; name: string } | null>(null);
    const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{ id: string; name: string; status?: string; grantId?: string | null } | null>(null);
    const [lastIssuedInvite, setLastIssuedInvite] = useState<{ email: string; invitePath: string; temporaryPassword?: string | null } | null>(null);
    
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
            const ctx = await resolveTenantContext(supabase);
            let currentProfile: any = null;
            if (ctx.userId && ctx.isAuthorized) {
                currentProfile = {
                    id: ctx.userId,
                    role: ctx.isSuperAdmin ? 'super_admin' : ctx.effectiveRole,
                    organization_id: ctx.organizationId,
                };
                setCurrentUser(currentProfile);
            } else {
                setCurrentUser(null);
                setUsers([]);
                setLoading(false);
                return;
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
                
            if (currentProfile && currentProfile.role !== 'super_admin' && currentProfile.role !== 'superadmin') {
                query = query.eq('organization_id', currentProfile.organization_id);
            }

            const { data: userData, error: userError } = await query;

            if (userError) throw userError;

            // Ambil status access_grants otoritatif
            let grantsMap = new Map<string, { id: string; role: string; status: string; expires_at?: string | null }>();
            try {
                let gQuery = (supabase as any)
                    .from('access_grants')
                    .select('id, user_id, organization_id, role, status, expires_at');
                if (currentProfile && currentProfile.role !== 'super_admin' && currentProfile.role !== 'superadmin' && currentProfile.organization_id) {
                    gQuery = gQuery.eq('organization_id', currentProfile.organization_id);
                }
                const { data: gRows } = await gQuery;
                if (Array.isArray(gRows)) {
                    for (const g of gRows as any[]) {
                        const key = `${g.user_id}:${g.organization_id || 'global'}`;
                        grantsMap.set(key, g);
                        if (!grantsMap.has(g.user_id)) {
                            grantsMap.set(g.user_id, g);
                        }
                    }
                }
            } catch {
                // fallback jika tabel access_grants belum ada
            }

            const enrichedUsers = ((userData as unknown as UserProfile[]) || []).map((u) => {
                const g = grantsMap.get(`${u.id}:${u.organization_id || 'global'}`) || grantsMap.get(u.id);
                let grantStatus: UserProfile['grant_status'] =
                    u.role === 'pending' ? 'invited' : 'active';
                if (g) {
                    const isExp = g.expires_at && new Date(g.expires_at).getTime() <= Date.now();
                    grantStatus = isExp && g.status === 'invited' ? 'expired' : (g.status as any);
                }
                return {
                    ...u,
                    role: g?.role === 'superadmin' ? 'super_admin' : g?.role || u.role,
                    grant_id: g?.id || null,
                    grant_status: grantStatus,
                };
            });

            // Manual sort to put 'pending' / 'invited' at top
            const sortedData = enrichedUsers.sort((a, b) => {
                const aPending = a.role === 'pending' || a.grant_status === 'invited';
                const bPending = b.role === 'pending' || b.grant_status === 'invited';
                if (aPending && !bPending) return -1;
                if (!aPending && bPending) return 1;
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

    const handleApproveUser = (id: string, name: string) => {
        setConfirmApproveTarget({ id, name });
    };

    const executeApproveUser = async () => {
        if (!confirmApproveTarget) return;
        const { id, name } = confirmApproveTarget;
        setConfirmApproveTarget(null);
        try {
            const targetUser = users.find((u) => u.id === id);
            const isSuperCaller = currentUser?.role === 'super_admin' || currentUser?.role === 'superadmin';
            const approvedRole = isSuperCaller ? 'admin' : 'musammi';
            const targetOrgId = isSuperCaller
                ? targetUser?.organization_id
                : currentUser?.organization_id;

            if (!targetOrgId) {
                throw new Error('Organisasi pengguna tidak valid.');
            }

            // Gunakan fungsi server-side khusus rpc_manage_access_grant yang memverifikasi aktor
            const { error: rpcError } = await (supabase as any).rpc('rpc_manage_access_grant', {
                p_grant_id: null,
                p_target_user_id: id,
                p_organization_id: targetOrgId,
                p_role: approvedRole,
                p_status: 'active',
                p_reason: `Aktivasi akun oleh ${isSuperCaller ? 'Superadmin' : 'Admin Lembaga'}`,
            });

            if (rpcError) {
                throw rpcError;
            }

            NotificationStore.addNotification(
                `Pengguna ${name} telah diaktifkan sebagai ${approvedRole === 'admin' ? 'Admin Lembaga' : 'Musammi'}.`,
                'success'
            );
            fetchData();
        } catch (e: any) {
            NotificationStore.addNotification(`Gagal: ${e.message}`, 'error');
        }
    };

    const handleDeleteUser = (user: UserProfile) => {
        setConfirmDeleteTarget({
            id: user.id,
            name: user.full_name,
            status: user.grant_status,
            grantId: user.grant_id || null,
        });
    };

    const executeDeleteUser = async () => {
        if (!confirmDeleteTarget) return;
        const { id, name, status, grantId } = confirmDeleteTarget;
        setConfirmDeleteTarget(null);
        try {
            const targetUser = users.find((u) => u.id === id);
            const isSuperCaller = currentUser?.role === 'super_admin' || currentUser?.role === 'superadmin';
            const targetOrgId = isSuperCaller ? targetUser?.organization_id : currentUser?.organization_id;

            // FASE 2 INVARIANT: Jangan pernah melakukan DELETE pada tabel profiles agar histori akademik & audit log tetap utuh.
            // Gunakan rpc_revoke_invitation (untuk status invited) atau rpc_manage_access_grant (status = 'revoked').
            if (status === 'invited') {
                const { error: revErr } = await (supabase as any).rpc('rpc_revoke_invitation', {
                    p_invitation_id: null,
                    p_grant_id: grantId || null,
                    p_reason: `Undangan ${name} dibatalkan melalui Manajemen Users`,
                });
                if (revErr) throw revErr;
            } else {
                const targetRole =
                    targetUser?.role === 'super_admin' || targetUser?.role === 'superadmin'
                        ? 'superadmin'
                        : targetUser?.role === 'admin'
                        ? 'admin'
                        : 'musammi';
                const { error: rpcErr } = await (supabase as any).rpc('rpc_manage_access_grant', {
                    p_grant_id: grantId || null,
                    p_target_user_id: id,
                    p_organization_id: targetRole === 'superadmin' ? null : targetOrgId,
                    p_role: targetRole,
                    p_status: 'revoked',
                    p_reason: `Pencabutan hak akses pengguna (${name}) tanpa menghapus histori`,
                });
                if (rpcErr) throw rpcErr;
            }

            NotificationStore.addNotification(
                `Hak akses ${name} berhasil dicabut (REVOKED). Data historis tetap terjaga.`,
                'success'
            );
            fetchData();
        } catch (e: any) {
            NotificationStore.addNotification(`Gagal mencabut akses: ${e.message}`, 'error');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        NotificationStore.addNotification('ID Organisasi disalin: ' + text, 'info');
    };

    const openAddModal = () => {
        setModalMode('add');
        if (currentUser?.role === 'super_admin' || currentUser?.role === 'superadmin') {
            setCreationType('new_org');
            setFormData({ email: '', password: '', fullName: '', mahadName: '', targetOrgId: '', role: 'admin' });
        } else {
            setCreationType('existing_org');
            setFormData({ email: '', password: '', fullName: '', mahadName: '', targetOrgId: currentUser?.organization_id || '', role: 'musammi' });
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
            role: user.role || 'musammi'
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        // Validation
        if (!formData.fullName) {
            NotificationStore.addNotification("Nama Lengkap wajib diisi.", "error");
            return;
        }
        
        if (modalMode === 'add') {
            if (!formData.email) {
                NotificationStore.addNotification("Email wajib diisi untuk user baru.", "error");
                return;
            }
            if (formData.password && formData.password.trim().length > 0 && formData.password.trim().length < 8) {
                NotificationStore.addNotification("Password minimal 8 karakter (atau kosongkan untuk sandi sementara otomatis).", "error");
                return;
            }
            if (creationType === 'new_org' && !formData.mahadName) {
                NotificationStore.addNotification("Nama Ma'had wajib diisi untuk pembuatan Ma'had baru.", "error");
                return;
            }
            if (creationType === 'existing_org' && !formData.targetOrgId) {
                NotificationStore.addNotification("Silakan pilih Ma'had yang sudah ada.", "error");
                return;
            }
        } else {
            // Edit Mode Validation
            if (!formData.mahadName && modalMode === 'edit') {
                 NotificationStore.addNotification("Nama Ma'had tidak boleh kosong.", "error");
                 return;
            }
        }

        setIsSubmitting(true);

        try {
            if (modalMode === 'add') {
                // --- ADD NEW USER FLOW (Murni Serverless /api/invitations tanpa signUp anonim + setTimeout di browser) ---
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;

                if (!token) {
                    throw new Error('Sesi autentikasi tidak ditemukan. Silakan muat ulang halaman dan login kembali.');
                }

                let targetOrganizationId = formData.targetOrgId || currentUser?.organization_id || '';
                const isSuperCaller = currentUser?.role === 'super_admin' || currentUser?.role === 'superadmin';
                const isNewTenantProvisioning = creationType === 'new_org' && isSuperCaller;

                if (isNewTenantProvisioning) {
                    const slug = formData.mahadName
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-|-$)/g, '');
                    const { data: rpcOrg, error: rpcOrgErr } = await (supabase as any).rpc(
                        'rpc_create_tenant_with_admin',
                        {
                            p_name: formData.mahadName.trim(),
                            p_slug: slug,
                            p_timezone: 'Asia/Jakarta',
                            p_plan_id: 'standard',
                            p_status: 'provisioning',
                        }
                    );
                    if (rpcOrgErr || !rpcOrg?.id) {
                        throw rpcOrgErr || new Error('Gagal menyiapkan tenant organisasi baru.');
                    }
                    targetOrganizationId = rpcOrg.id;
                }

                if (!targetOrganizationId) {
                    throw new Error("Organisasi tujuan wajib dipilih.");
                }

                const effectiveRequestedRole = !isSuperCaller
                    ? 'musammi'
                    : formData.role === 'super_admin'
                    ? 'superadmin'
                    : formData.role;

                const resp = await fetch('/api/invitations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        email: formData.email.trim(),
                        password: formData.password.trim() || undefined,
                        fullName: formData.fullName.trim(),
                        role: effectiveRequestedRole,
                        organizationId: targetOrganizationId,
                        mahadName: formData.mahadName.trim() || undefined,
                        isTenantProvisioning: isNewTenantProvisioning,
                    })
                });

                const result = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    if (isNewTenantProvisioning && targetOrganizationId) {
                        try {
                            await (supabase as any).rpc('rpc_mark_tenant_provisioning_status', {
                                p_organization_id: targetOrganizationId,
                                p_status: 'provisioning_failed',
                                p_reason: result?.error || 'Undangan Admin gagal',
                            });
                        } catch {
                            // ignore fallback
                        }
                    }
                    throw new Error(result?.error || `Gagal membuat undangan melalui endpoint serverless (/api/invitations status ${resp.status}).`);
                }

                setLastIssuedInvite({
                    email: formData.email.trim().toLowerCase(),
                    invitePath: result?.inviteAcceptPath || `/invite?email=${encodeURIComponent(formData.email.trim().toLowerCase())}&org=${targetOrganizationId}`,
                    temporaryPassword: result?.temporaryPassword || null,
                });
                NotificationStore.addNotification(
                    `Undangan untuk ${formData.fullName} berhasil diterbitkan. Pengguna wajib mengonfirmasi tautan /invite agar akun aktif.`,
                    'success'
                );

            } else {
                // --- EDIT USER FLOW ---
                if (!currentUserId) return;
                const userToEdit = users.find(u => u.id === currentUserId);
                if (!userToEdit) return;

                const isSuperCaller = currentUser?.role === 'super_admin' || currentUser?.role === 'superadmin';
                const targetRole = !isSuperCaller
                    ? 'musammi'
                    : formData.role === 'super_admin'
                    ? 'superadmin'
                    : formData.role;

                // 1. Update identitas profil (non-otorisasi) pada profiles
                let profileUpdateQuery = supabase
                    .from('profiles')
                    .update({ 
                        full_name: formData.fullName
                    })
                    .eq('id', currentUserId);
                if (currentUser && !isSuperCaller && currentUser.organization_id) {
                    profileUpdateQuery = profileUpdateQuery.eq('organization_id', currentUser.organization_id);
                }
                const { error: profileError } = await profileUpdateQuery;
                if (profileError) throw profileError;

                // 2. Perubahan otorisasi (role/grant) wajib melalui fungsi server rpc_manage_access_grant
                const targetOrgId = isSuperCaller ? userToEdit.organization_id : currentUser?.organization_id;
                if (targetOrgId || targetRole === 'superadmin') {
                    const { error: rpcErr } = await (supabase as any).rpc('rpc_manage_access_grant', {
                        p_grant_id: null,
                        p_target_user_id: currentUserId,
                        p_organization_id: targetRole === 'superadmin' ? null : targetOrgId,
                        p_role: targetRole,
                        p_status: 'active',
                        p_reason: `Pembaruan hak akses pengguna (${formData.fullName})`,
                    });
                    if (rpcErr) throw rpcErr;
                }

                // 3. Update Org Name (Only if super_admin and org name actually changed)
                if (isSuperCaller && userToEdit.organization_id && formData.mahadName && formData.mahadName !== userToEdit.organizations?.name) {
                    const { error: orgError } = await supabase
                        .from('organizations')
                        .update({ name: formData.mahadName })
                        .eq('id', userToEdit.organization_id);
                    if (orgError) throw orgError;
                }
                
                NotificationStore.addNotification(`Profil dan hak akses ${formData.fullName} berhasil diperbarui.`, 'success');
            }

            setIsModalOpen(false);
            await fetchData(); // Force Refresh

        } catch (e: any) {
            console.error(e);
            NotificationStore.addNotification(`Gagal: ${e.message}`, 'error');
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
            {lastIssuedInvite && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                        <div className="font-bold text-blue-950">
                            Tautan Aktivasi Undangan Sekali Pakai ({lastIssuedInvite.email})
                        </div>
                        <div className="font-mono text-[11px] text-blue-900 break-all">
                            {window.location.origin}{lastIssuedInvite.invitePath}
                        </div>
                        {lastIssuedInvite.temporaryPassword && (
                            <div className="text-slate-700">
                                Kode Verifikasi Undangan: <span className="font-mono font-bold text-slate-900">{lastIssuedInvite.temporaryPassword}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}${lastIssuedInvite.invitePath}`);
                                NotificationStore.addNotification('Tautan undangan disalin.', 'info');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                        >
                            Salin Tautan /invite
                        </button>
                        <button
                            type="button"
                            onClick={() => setLastIssuedInvite(null)}
                            className="px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-800 hover:bg-blue-100 font-semibold"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            )}

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
                                <Plus size={18} className="mr-2" /> Undang Pengguna Baru
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
                                <th className="px-6 py-3">Role / Status Grant</th>
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
                                    <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${user.role === 'pending' || user.grant_status === 'invited' ? 'bg-yellow-50/50' : ''}`}>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {user.full_name || 'Tanpa Nama'}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">
                                            {user.email || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {user.role === 'super_admin' || user.role === 'superadmin' ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-900 text-white">
                                                        Superadmin Platform
                                                    </span>
                                                ) : user.role === 'pending' ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                                        Menunggu Aktivasi
                                                    </span>
                                                ) : user.role === 'musammi' ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Musammi
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                        Admin Lembaga
                                                    </span>
                                                )}
                                                {user.grant_status && (
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        user.grant_status === 'active'
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : user.grant_status === 'invited'
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-rose-100 text-rose-800'
                                                    }`}>
                                                        {user.grant_status}
                                                    </span>
                                                )}
                                            </div>
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
                                                {(user.role === 'pending' || user.grant_status === 'invited' || user.grant_status === 'suspended' || user.grant_status === 'revoked') && (
                                                    <button 
                                                        onClick={() => handleApproveUser(user.id, user.full_name)}
                                                        className="bg-green-600 text-white hover:bg-green-700 transition-colors p-1.5 rounded-md text-xs font-bold flex items-center mr-2 shadow-sm"
                                                        title="Aktifkan Grant User Ini"
                                                    >
                                                        <CheckCircle size={14} className="mr-1" /> Aktifkan
                                                    </button>
                                                )}
                                                
                                                <button 
                                                    onClick={() => openEditModal(user)}
                                                    className="text-slate-400 hover:text-secondary transition-colors p-1 rounded-full hover:bg-slate-100"
                                                    title="Edit User"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                
                                                {user.role !== 'super_admin' && user.grant_status !== 'revoked' && (
                                                    <button 
                                                        onClick={() => handleDeleteUser(user)}
                                                        className="text-slate-400 hover:text-error transition-colors p-1 rounded-full hover:bg-red-50"
                                                        title="Cabut Akses / Batalkan Undangan (Non-Destruktif)"
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap Pengguna</label>
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role Kanonik (3-Role SaaS)</label>
                        <select 
                            className="block w-full border-slate-300 rounded-md focus:ring-secondary focus:border-secondary sm:text-sm"
                            value={formData.role}
                            onChange={e => setFormData({...formData, role: e.target.value})}
                            disabled={
                                currentUser?.role !== 'super_admin' &&
                                currentUser?.role !== 'superadmin' &&
                                modalMode === 'edit' &&
                                currentUserId === currentUser?.id
                            }
                        >
                            {(currentUser?.role === 'super_admin' ||
                              currentUser?.role === 'superadmin' ||
                              (modalMode === 'edit' && currentUserId === currentUser?.id && formData.role === 'admin')) && (
                                <option value="admin">Admin Lembaga</option>
                            )}
                            <option value="musammi">Musammi (Pengampu Halaqah)</option>
                            {(currentUser?.role === 'super_admin' || currentUser?.role === 'superadmin') && (
                                <option value="super_admin">Superadmin Platform</option>
                            )}
                        </select>
                        <p className="text-xs text-slate-400 mt-1">
                            Sesuai arsitektur keamanan 3-Role SaaS, Admin Lembaga hanya dapat membuat/mengelola akun Musammi. Penunjukan Admin Lembaga hanya dilakukan oleh Superadmin Platform.
                        </p>
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

            <ConfirmDialog
                isOpen={confirmApproveTarget !== null}
                title="Setujui Pendaftaran Pengguna"
                description={`Setujui pendaftaran "${confirmApproveTarget?.name || ''}"? Pengguna ini akan mendapatkan akses sebagai ${
                    currentUser?.role === 'super_admin' || currentUser?.role === 'superadmin'
                        ? 'Admin Lembaga'
                        : 'Musammi'
                }.`}
                confirmLabel="Setujui Akses"
                tone="primary"
                onConfirm={executeApproveUser}
                onCancel={() => setConfirmApproveTarget(null)}
            />

            <ConfirmDialog
                isOpen={confirmDeleteTarget !== null}
                title="Cabut Hak Akses / Batalkan Undangan"
                description={`Anda yakin ingin mencabut hak akses untuk "${confirmDeleteTarget?.name || ''}"? Akses pengguna akan diubah menjadi REVOKED sehingga tidak dapat masuk, namun seluruh histori akademik dan audit log tetap tersimpan utuh.`}
                confirmLabel="Cabut Akses (Revoke)"
                tone="danger"
                onConfirm={executeDeleteUser}
                onCancel={() => setConfirmDeleteTarget(null)}
            />
        </div>
    );
};

export default Users;
