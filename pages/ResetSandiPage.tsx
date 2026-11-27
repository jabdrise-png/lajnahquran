/**
 * Fase 7 · atur ulang kata sandi mandiri. Pengguna membuka tautan dari email "Lupa sandi?";
 * Supabase membuat sesi pemulihan dari tautan itu, lalu halaman ini memanggil auth.updateUser.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Lock, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { cekSandiBaru } from '../lib/sandi';

const ResetSandiPage: React.FC = () => {
  const navigate = useNavigate();
  const [siap, setSiap] = useState<'cek' | 'ada' | 'tidak'>('cek');
  const [sandi, setSandi] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    let aktif = true;
    const galatUrl = new URLSearchParams(window.location.hash.slice(1) || window.location.search).get('error_description');
    if (galatUrl) { setGalat(galatUrl.replace(/\+/g, ' ')); setSiap('tidak'); return; }
    const { data } = supabase.auth.onAuthStateChange((event: string, s: any) => {
      if (!aktif) return;
      if (event === 'PASSWORD_RECOVERY' || s) setSiap('ada');
    });
    supabase.auth.getSession().then(({ data: d }: any) => { if (aktif && d?.session) setSiap('ada'); });
    // Beri waktu Supabase membaca token dari tautan; bila tetap tanpa sesi, tautan kedaluwarsa/salah.
    const t = window.setTimeout(() => { if (aktif) setSiap((x) => (x === 'cek' ? 'tidak' : x)); }, 6000);
    return () => { aktif = false; window.clearTimeout(t); data?.subscription?.unsubscribe(); };
  }, []);

  const simpan = async (e: React.FormEvent) => {
    e.preventDefault();
    const g = cekSandiBaru(sandi, ulang);
    if (g) { setGalat(g); return; }
    setGalat(null);
    setMenyimpan(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: sandi });
      if (error) throw error;
      setSelesai(true);
      window.setTimeout(() => navigate('/app/dashboard', { replace: true }), 1500);
    } catch (err: any) {
      const m = String(err?.message || err);
      setGalat(/same|different/i.test(m) ? 'Kata sandi baru harus berbeda dari yang lama.'
        : /weak|short/i.test(m) ? 'Kata sandi terlalu lemah.' : `Gagal menyimpan: ${m}`);
    } finally {
      setMenyimpan(false);
    }
  };

  const input = 'block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4"><KeyRound className="text-blue-600" /></div>
        <h1 className="text-xl font-bold text-slate-900">Atur ulang kata sandi</h1>

        {selesai ? (
          <p className="mt-3 text-[15px] text-emerald-700 flex items-center gap-2"><CheckCircle2 size={18} /> Kata sandi tersimpan. Mengalihkan…</p>
        ) : siap === 'cek' ? (
          <p className="mt-3 text-[15px] text-slate-500">Memeriksa tautan…</p>
        ) : siap === 'tidak' ? (
          <div className="mt-3 space-y-4">
            <p className="text-[15px] text-slate-600">{galat || 'Tautan tidak berlaku atau sudah kedaluwarsa.'} Minta tautan baru dari halaman masuk.</p>
            <button type="button" onClick={() => navigate('/login?lupa=1')} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold">Minta tautan baru</button>
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={simpan}>
            <p className="text-sm text-slate-500">Minimal 8 karakter. Jangan pakai sandi bawaan.</p>
            <label className="block text-sm font-medium text-slate-700">Kata sandi baru
              <div className="relative mt-1"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-slate-400" />
                <input type="password" autoComplete="new-password" required value={sandi} onChange={(e) => setSandi(e.target.value)} className={input} /></div>
            </label>
            <label className="block text-sm font-medium text-slate-700">Ulangi kata sandi
              <div className="relative mt-1"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-slate-400" />
                <input type="password" autoComplete="new-password" required value={ulang} onChange={(e) => setUlang(e.target.value)} className={input} /></div>
            </label>
            {galat && <p className="text-sm text-red-600">{galat}</p>}
            <button type="submit" disabled={menyimpan} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60">{menyimpan ? 'Menyimpan…' : 'Simpan kata sandi'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetSandiPage;
