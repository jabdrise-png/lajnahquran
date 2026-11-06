import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { NotificationStore } from '../lib/NotificationStore';
import { formatCanonicalRoleLabel } from '../lib/permissions';

type InvitationTokenState = 'loading' | 'pending' | 'accepted' | 'expired' | 'revoked' | 'invalid' | 'legacy_no_token';

interface InspectedInvitation {
  valid: boolean;
  invitation_id?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked' | 'invalid';
  email?: string;
  full_name?: string;
  role?: 'superadmin' | 'admin' | 'musammi' | string;
  organization_id?: string | null;
  organization_name?: string;
  expires_at?: string;
  accepted_at?: string;
  revoked_at?: string;
  message?: string;
}

export const AcceptInvitePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenParam = (searchParams.get('token') || '').trim();
  const emailParam = (searchParams.get('email') || '').trim().toLowerCase();
  const orgParam = (searchParams.get('org') || '').trim();

  const [tokenState, setTokenState] = useState<InvitationTokenState>(
    tokenParam ? 'loading' : 'legacy_no_token'
  );
  const [inspectedInvite, setInspectedInvite] = useState<InspectedInvitation | null>(null);

  const [email, setEmail] = useState(emailParam);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);

  const inspectToken = useCallback(async () => {
    if (!tokenParam) {
      setTokenState('legacy_no_token');
      return;
    }

    setTokenState('loading');
    try {
      const { data, error } = await (supabase as any).rpc('rpc_inspect_invitation_token', {
        p_token: tokenParam,
      });

      if (error || !data) {
        setInspectedInvite({
          valid: false,
          status: 'invalid',
          message: error?.message || 'Token undangan tidak dapat diverifikasi.',
        });
        setTokenState('invalid');
        return;
      }

      const info = data as InspectedInvitation;
      setInspectedInvite(info);
      if (info.email) {
        setEmail(info.email.trim().toLowerCase());
      }
      setTokenState(info.status || 'invalid');
    } catch (err: any) {
      setInspectedInvite({
        valid: false,
        status: 'invalid',
        message: err?.message || 'Gagal memeriksa status token undangan.',
      });
      setTokenState('invalid');
    }
  }, [tokenParam]);

  useEffect(() => {
    inspectToken();
  }, [inspectToken]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setHasActiveSession(true);
        const activeUserEmail = (session.user.email || '').trim().toLowerCase();
        setSessionEmail(activeUserEmail || null);
        if (!emailParam && !inspectedInvite?.email && activeUserEmail) {
          setEmail(activeUserEmail);
        }
      } else {
        setHasActiveSession(false);
        setSessionEmail(null);
      }
    });
  }, [emailParam, inspectedInvite?.email]);

  const targetInvitedEmail = (inspectedInvite?.email || emailParam || email).trim().toLowerCase();
  const isSessionEmailMismatch =
    hasActiveSession &&
    Boolean(sessionEmail) &&
    Boolean(targetInvitedEmail) &&
    sessionEmail !== targetInvitedEmail;

  const handleSignOutCurrentSession = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setHasActiveSession(false);
      setSessionEmail(null);
      if (inspectedInvite?.email || emailParam) {
        setEmail((inspectedInvite?.email || emailParam).trim().toLowerCase());
      }
      NotificationStore.addNotification(
        'Sesi akun sebelumnya telah dikeluarkan. Silakan lanjutkan aktivasi undangan.',
        'info'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tokenParam && tokenState !== 'pending') {
      NotificationStore.addNotification(
        inspectedInvite?.message || 'Undangan ini sudah tidak berlaku dan tidak dapat diaktifkan.',
        'error'
      );
      return;
    }

    if (isSessionEmailMismatch) {
      NotificationStore.addNotification(
        `Sesi aktif saat ini (${sessionEmail}) tidak cocok dengan email tujuan undangan (${targetInvitedEmail}). Silakan keluar terlebih dahulu.`,
        'error'
      );
      return;
    }

    if (newPassword.length < 8) {
      NotificationStore.addNotification('Kata sandi baru minimal 8 karakter.', 'error');
      return;
    }
    if (newPassword.trim().toLowerCase() === 'mahad123!') {
      NotificationStore.addNotification(
        'Demi keamanan, dilarang menggunakan kata sandi default Mahad123!.',
        'error'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      NotificationStore.addNotification('Konfirmasi kata sandi baru tidak cocok.', 'error');
      return;
    }

    const effectiveEmail = (inspectedInvite?.email || email).trim().toLowerCase();
    if (!effectiveEmail) {
      NotificationStore.addNotification('Alamat email tujuan undangan wajib diisi.', 'error');
      return;
    }

    if (inspectedInvite?.email && effectiveEmail !== inspectedInvite.email.trim().toLowerCase()) {
      NotificationStore.addNotification(
        'Email tidak boleh diubah dari email tujuan undangan.',
        'error'
      );
      return;
    }

    setLoading(true);
    try {
      let userId: string | undefined;

      if (!hasActiveSession) {
        if (!currentPassword) {
          throw new Error('Masukkan kode/sandi verifikasi undangan yang Anda terima.');
        }
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: effectiveEmail,
          password: currentPassword,
        });
        if (signInErr) throw signInErr;
        userId = signInData.user?.id;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const loggedInEmail = (userData.user?.email || '').trim().toLowerCase();
        if (loggedInEmail && loggedInEmail !== effectiveEmail) {
          throw new Error(
            `Email sesi aktif (${loggedInEmail}) berbeda dengan email tujuan undangan (${effectiveEmail}).`
          );
        }
        userId = userData.user?.id;
      }

      if (!userId) {
        throw new Error('Sesi pengguna tidak ditemukan.');
      }

      // 1. Perbarui kata sandi pengguna secara permanen terlebih dahulu
      const { error: updatePassErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updatePassErr) throw updatePassErr;

      // 2. Aktifkan status undangan di access_grants, tenant_invitations & organizations secara atomik via RPC
      const resolvedOrgId =
        inspectedInvite?.organization_id ||
        (orgParam && orgParam.length === 36 ? orgParam : null);

      const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc('rpc_accept_invitation', {
        p_organization_id: resolvedOrgId,
        p_token: tokenParam || null,
      });

      if (rpcErr || !rpcResult || rpcResult.status !== 'active') {
        throw new Error(
          rpcErr?.message ||
            'Gagal mengaktifkan status keanggotaan (access_grants). Silakan hubungi Admin Lembaga.'
        );
      }

      NotificationStore.addNotification(
        'Undangan berhasil dikonfirmasi! Akun Anda kini aktif dan kata sandi baru telah disimpan.',
        'success'
      );

      const activatedRole = String(rpcResult.role || '').toLowerCase();
      if (activatedRole === 'superadmin') {
        navigate('/platform/dashboard', { replace: true });
      } else if (activatedRole === 'musammi') {
        navigate('/app/sessions', { replace: true });
      } else {
        navigate('/app/dashboard', { replace: true });
      }
    } catch (err: any) {
      NotificationStore.addNotification(err.message || 'Gagal mengaktifkan undangan.', 'error');
      if (tokenParam) {
        await inspectToken();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200/80 sm:px-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
              <i className="fas fa-user-check text-xl"></i>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Aktivasi Undangan Akun
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Konfirmasi undangan resmi dan tetapkan kata sandi baru untuk ruang kerja Lajnah Al-Qur&apos;an Anda.
            </p>
          </div>

          {tokenState === 'loading' && (
            <div className="py-8 text-center text-xs text-slate-500 space-y-2">
              <i className="fas fa-circle-notch fa-spin text-blue-600 text-lg"></i>
              <p>Memverifikasi keabsahan token undangan...</p>
            </div>
          )}

          {(tokenState === 'expired' ||
            tokenState === 'revoked' ||
            tokenState === 'accepted' ||
            tokenState === 'invalid') && (
            <div
              data-testid={`invitation-state-${tokenState}`}
              className={`p-4 rounded-xl border mb-6 ${
                tokenState === 'accepted'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : tokenState === 'expired'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-3">
                <i
                  className={`fas ${
                    tokenState === 'accepted'
                      ? 'fa-check-circle text-emerald-600'
                      : tokenState === 'expired'
                      ? 'fa-clock text-amber-600'
                      : 'fa-ban text-rose-600'
                  } text-base mt-0.5`}
                ></i>
                <div className="text-xs space-y-1.5">
                  <p className="font-bold uppercase tracking-wider">
                    {tokenState === 'accepted' && 'Undangan Sudah Digunakan (Sekali Pakai)'}
                    {tokenState === 'expired' && 'Undangan Kedaluwarsa (Expired)'}
                    {tokenState === 'revoked' && 'Undangan Dibatalkan (Revoked)'}
                    {tokenState === 'invalid' && 'Token Undangan Tidak Sah (Invalid)'}
                  </p>
                  <p className="leading-relaxed">
                    {inspectedInvite?.message ||
                      'Tautan undangan ini tidak dapat digunakan untuk mengaktifkan akun.'}
                  </p>
                  {inspectedInvite?.email && (
                    <p className="text-[11px] opacity-80">
                      Target: <span className="font-mono font-semibold">{inspectedInvite.email}</span>
                      {inspectedInvite.organization_name
                        ? ` • ${inspectedInvite.organization_name}`
                        : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-black/10 flex justify-end">
                <Link
                  to="/login"
                  className="px-3.5 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800"
                >
                  Ke Halaman Login
                </Link>
              </div>
            </div>
          )}

          {(tokenState === 'pending' || tokenState === 'legacy_no_token') && (
            <>
              {inspectedInvite && tokenState === 'pending' && (
                <div className="mb-5 p-3.5 rounded-xl bg-blue-50/80 border border-blue-200/80 text-xs text-slate-700 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-900">Detail Undangan Resmi</span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] uppercase">
                      {formatCanonicalRoleLabel(inspectedInvite.role)}
                    </span>
                  </div>
                  {inspectedInvite.organization_name && (
                    <p>
                      Lembaga:{' '}
                      <span className="font-semibold text-slate-900">
                        {inspectedInvite.organization_name}
                      </span>
                    </p>
                  )}
                  {inspectedInvite.full_name && (
                    <p>
                      Penerima:{' '}
                      <span className="font-semibold text-slate-900">
                        {inspectedInvite.full_name}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {isSessionEmailMismatch && (
                <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2.5">
                  <p className="font-bold">
                    Peringatan: Sesi Akun Saat Ini Berbeda dengan Email Undangan
                  </p>
                  <p className="leading-relaxed">
                    Anda sedang login sebagai{' '}
                    <span className="font-mono font-bold">{sessionEmail}</span>, sedangkan undangan
                    ini ditujukan khusus untuk{' '}
                    <span className="font-mono font-bold">{targetInvitedEmail}</span>. Anda tidak
                    dapat mengaktifkan undangan ini menggunakan akun lain.
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOutCurrentSession}
                    disabled={loading}
                    className="w-full py-2 px-3 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Keluar dari {sessionEmail} &amp; Lanjutkan Aktivasi
                  </button>
                </div>
              )}

              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Alamat Email Undangan
                  </label>
                  <input
                    type="email"
                    value={inspectedInvite?.email || email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={hasActiveSession || Boolean(inspectedInvite?.email) || Boolean(emailParam)}
                    required
                    placeholder="nama@lembaga.id"
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white disabled:bg-slate-100 text-slate-800 font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                {!hasActiveSession && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Kode Verifikasi / Sandi Sementara Undangan
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="Masukkan sandi verifikasi dari Admin"
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Kata Sandi Baru (Minimal 8 Karakter)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Buat kata sandi baru yang kuat"
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || isSessionEmailMismatch}
                  className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  {loading ? (
                    <span>
                      <i className="fas fa-spinner fa-spin mr-1.5"></i> Mengaktifkan Akun...
                    </span>
                  ) : (
                    'Konfirmasi Undangan & Aktifkan Akun'
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <Link to="/login" className="font-semibold text-blue-700 hover:underline">
              &larr; Kembali ke Halaman Login
            </Link>
            <Link to="/verify" className="text-slate-500 hover:text-slate-700">
              Verifikasi Raport
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitePage;
