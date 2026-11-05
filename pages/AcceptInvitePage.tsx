import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { NotificationStore } from '../lib/NotificationStore';

const AcceptInvitePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        setHasActiveSession(true);
        setSessionEmail(data.session.user.email || null);
      }
    });
  }, []);

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Kata sandi baru minimal harus 8 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      let activeUserId: string | null = null;

      if (!hasActiveSession) {
        if (!email.trim() || !tempPassword.trim()) {
          throw new Error('Masukkan email dan kata sandi sementara dari undangan Anda.');
        }
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password: tempPassword,
        });
        if (signInErr || !signInData.user) {
          throw new Error(signInErr?.message || 'Email atau kata sandi sementara tidak valid.');
        }
        activeUserId = signInData.user.id;
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        activeUserId = userRes?.user?.id || null;
      }

      const { error: updateAuthErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateAuthErr) {
        throw new Error(updateAuthErr.message);
      }

      if (activeUserId) {
        try {
          await (supabase as any)
            .from('access_grants')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('user_id', activeUserId)
            .eq('status', 'invited');
        } catch {
          // Ignore if access_grants table is not yet migrated
        }
      }

      NotificationStore.addNotification(
        'Akun berhasil diaktifkan dan kata sandi baru telah disimpan.',
        'success'
      );
      navigate('/app/dashboard', { replace: true });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal mengaktifkan undangan akun.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Aktivasi Undangan Resmi
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Aktifkan Akun & Atur Kata Sandi
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            {hasActiveSession
              ? `Anda masuk sebagai ${sessionEmail || 'pengguna terundang'}. Silakan tetapkan kata sandi permanen untuk menyelesaikan aktivasi akun.`
              : 'Masukkan email dan kata sandi sementara dari Admin Lembaga, lalu buat kata sandi baru pilihan Anda.'}
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-700">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleActivateAccount} className="space-y-4">
          {!hasActiveSession && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Terdaftar <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@lembaga.id"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi Sementara <span className="text-red-600">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Kata sandi sementara dari undangan"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kata Sandi Baru (Min. 8 Karakter) <span className="text-red-600">*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Konfirmasi Kata Sandi Baru <span className="text-red-600">*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi kata sandi baru"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {submitting ? 'Memproses Aktivasi...' : 'Simpan Kata Sandi & Aktifkan Akun'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-2 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors"
            >
              Sudah Aktif? Masuk ke Halaman Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AcceptInvitePage;
