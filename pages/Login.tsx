
import React, { useState } from 'react';
import { KeyRound, Mail, Lock, User, Building, ClipboardCopy, Network, ArrowLeft, ChevronDown, BookOpen, Github, Chrome, Quote } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useLandingPageContent } from '../hooks/useLandingPageContent';

import { LandingPageConfig } from '../types/landingPage';

interface LoginProps {
  onBack?: () => void;
  configOverrides?: LandingPageConfig;
}

const Login: React.FC<LoginProps> = ({ onBack, configOverrides }) => {
  const { publishedConfig: dbConfig } = useLandingPageContent();
  const publishedConfig = configOverrides || dbConfig;
  const [mode, setMode] = useState<'login' | 'register' | 'lupa'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lupa') ? 'lupa' : 'login'));
  const [regType, setRegType] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mahadName, setMahadName] = useState('');
  // Fase 8 · data antrean pendaftaran lembaga + persetujuan kebijakan privasi
  const [noHp, setNoHp] = useState('');
  const [kota, setKota] = useState('');
  const [perkiraanSantri, setPerkiraanSantri] = useState('');
  const [setujuPrivasi, setSetujuPrivasi] = useState(false);
  const [orgId, setOrgId] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // App.tsx handles redirect
    } catch (error: any) {
        setMessage({ type: 'error', text: error.error_description || error.message });
    } finally {
        setLoading(false);
    }
  };

  // Fase 7 · lupa sandi: kirim tautan atur ulang. Pesan sengaja sama untuk email terdaftar/tidak.
  const handleLupa = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (error && !/not found|user/i.test(error.message || '')) throw error;
      setMessage({ type: 'success', text: 'Jika email tersebut terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim. Periksa kotak masuk atau folder spam.' });
    } catch (error: any) {
      const m = String(error?.message || error);
      setMessage({ type: 'error', text: /rate|seconds|too many/i.test(m) ? 'Terlalu sering meminta tautan. Tunggu sebentar lalu coba lagi.' : m });
    } finally {
      setLoading(false);
    }
  };

  // Fase 7 · masuk dengan Google (akun harus sudah diundang/terdaftar di lembaga dengan email yang sama).
  const handleGoogle = async () => {
    setMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/app/dashboard` } });
    if (error) setMessage({ type: 'error', text: /provider is not enabled|unsupported provider/i.test(error.message || '') ? 'Masuk dengan Google belum diaktifkan oleh pengelola aplikasi.' : error.message });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!fullName) {
        setMessage({ type: 'error', text: "Nama Lengkap wajib diisi." });
        return;
    }
    if (regType === 'create' && !mahadName) {
        setMessage({ type: 'error', text: "Nama Ma'had wajib diisi." });
        return;
    }
    if (regType === 'create' && !noHp.trim()) {
        setMessage({ type: 'error', text: "Nomor HP/WA wajib diisi agar pengelola bisa menghubungi Anda." });
        return;
    }
    if (!setujuPrivasi) {
        setMessage({ type: 'error', text: "Centang persetujuan Kebijakan Privasi untuk melanjutkan." });
        return;
    }
    if (password.length < 8) {
        setMessage({ type: 'error', text: "Kata sandi minimal 8 karakter." });
        return;
    }
    if (regType === 'join' && !orgId) {
        setMessage({ type: 'error', text: "ID Organisasi wajib diisi untuk bergabung." });
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
        // Prepare Metadata
        const metaData: any = {
            full_name: fullName,
            role: 'pending' // Always pending until approved
        };

        if (regType === 'create') {
            metaData.mahad_name = mahadName;
            metaData.no_hp = noHp.trim();
            metaData.kota = kota.trim();
            metaData.perkiraan_santri = perkiraanSantri.trim();
        } else {
            metaData.target_organization_id = orgId.trim();
        }

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: metaData
            }
        });

        if (error) throw error;

        setMessage({ 
            type: 'success', 
            text: regType === 'create'
                ? "Pendaftaran terkirim. Periksa email untuk konfirmasi, lalu tunggu persetujuan pengelola aplikasi (biasanya 1×24 jam)."
                : "Pendaftaran terkirim. Periksa email untuk konfirmasi, lalu minta Admin lembaga mengaktifkan akun Anda." 
        });
        
        // Reset form
        setPassword('');
        // Switch back to login after delay
        setTimeout(() => setMode('login'), 4000);

    } catch (error: any) {
        setMessage({ type: 'error', text: error.message });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex selection:bg-blue-100 selection:text-blue-900">
      
      {/* Left Column - Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:flex-none lg:w-1/2 xl:w-[45%] lg:px-16 xl:px-24 border-r border-slate-100 shadow-xs z-10 overflow-y-auto relative">
        
          {/* Back Button */}
          {onBack && (
            <button 
                onClick={onBack}
                className="absolute top-6 left-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all flex items-center justify-center z-20 bg-white shadow-sm border border-slate-100"
                title="Kembali ke Beranda"
            >
                <ArrowLeft size={20} />
            </button>
          )}

        <div className="mx-auto w-full max-w-[400px]">

          {/* Logo */}
          <div className="flex flex-col items-center mb-10 group text-center">
            <div className="flex items-center justify-center p-2 mb-3 bg-slate-50 border border-slate-100 rounded-full shadow-sm">
                <img 
                    src={publishedConfig.theme.logoUrl || "https://i.pinimg.com/736x/a9/ce/9e/a9ce9e3f74b7d47ddd9981d97df26e17.jpg"} 
                    alt="Logo Lajnah" 
                    className="w-16 h-16 object-contain"
                />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">{publishedConfig.theme.appName || 'Lajnah Quran'}</span>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              {mode === 'login' ? 'Selamat datang kembali' : mode === 'lupa' ? 'Lupa kata sandi' : 'Pendaftaran Admin'}
            </h2>
            <p className="mt-2 text-sm text-slate-500 mb-8">
              {mode === 'login' ? 'Silakan masukkan detail akun Anda untuk melanjutkan.' : mode === 'lupa' ? 'Atur ulang kata sandi lewat email.' : 'Lengkapi data di bawah ini untuk membuat akun baru.'}
            </p>
          </div>

          {message && (
              <div className={`mb-6 p-3 rounded-lg text-xs font-medium border flex items-start ${message.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                  {message.text}
              </div>
          )}

          {mode === 'lupa' ? (
            <form className="space-y-4" onSubmit={handleLupa}>
              <p className="text-sm text-slate-600">Masukkan email akun Anda. Kami kirim tautan untuk membuat kata sandi baru.</p>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><Mail className="h-[18px] w-[18px] text-slate-400" /></div>
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@pesantren.com"
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white" />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-70">
                {loading ? 'Mengirim…' : 'Kirim tautan atur ulang'}
              </button>
              <button type="button" onClick={() => { setMode('login'); setMessage(null); }} className="w-full py-2 text-sm font-medium text-slate-600 inline-flex items-center justify-center gap-1.5">
                <ArrowLeft size={14} /> Kembali ke halaman masuk
              </button>
            </form>
          ) : mode === 'login' ? (
            <div className="animate-in fade-in slide-in-from-right duration-300">
              <form className="space-y-4" onSubmit={handleLogin}>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Alamat Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-[18px] w-[18px] text-slate-400" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white transition-all shadow-xs hover:border-slate-300"
                      placeholder="admin@pesantren.com"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                      Kata Sandi
                    </label>
                    <button type="button" onClick={() => { setMode('lupa'); setMessage(null); }} className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors py-1">
                      Lupa sandi?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-[18px] w-[18px] text-slate-400" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white transition-all shadow-xs hover:border-slate-300"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {/* <div className="flex items-center mt-4">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-600/20 border-slate-300 rounded cursor-pointer transition-colors"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer select-none">
                    Ingat saya selama 30 hari
                  </label>
                </div> */}

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {loading ? (
                        <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Memproses...
                        </span>
                    ) : 'Masuk ke Dashboard'}
                  </button>
                </div>
              </form>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200/60" /></div>
                  <div className="relative flex justify-center text-xs"><span className="px-3 bg-white text-slate-400">atau</span></div>
                </div>
                <button type="button" onClick={handleGoogle}
                  className="mt-4 w-full inline-flex justify-center items-center gap-2.5 py-2.5 px-4 border border-slate-200 rounded-xl bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <svg viewBox="0 0 48 48" className="w-[18px] h-[18px]" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                  Masuk dengan Google
                </button>
                <p className="mt-2 text-center text-xs text-slate-400">Gunakan akun Google dengan email yang sama seperti undangan lembaga.</p>
              </div>
              
              <div className="mt-8 text-center border-t border-slate-100 pt-6">
                <p className="text-sm text-slate-500">
                  Belum memiliki akun? <button onClick={() => { setMode('register'); setMessage(null); }} className="font-medium text-blue-600 hover:text-blue-700 transition-colors">Daftar sekarang</button>
                </p>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-left duration-300">
              <form className="space-y-4" onSubmit={handleRegister}>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipe Pendaftaran</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            {regType === 'create' ? <Building className="h-[18px] w-[18px] text-slate-400" /> : <Network className="h-[18px] w-[18px] text-slate-400" />}
                        </div>
                        <select 
                            value={regType}
                            onChange={(e) => setRegType(e.target.value as 'create' | 'join')}
                            className="block w-full rounded-xl border border-slate-200/80 py-2.5 pl-10 pr-8 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white appearance-none hover:border-slate-300 transition-all shadow-xs"
                        >
                            <option value="create">Daftar Ma'had Baru</option>
                            <option value="join">Gabung Ma'had (Sudah Ada)</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                            <ChevronDown className="h-[16px] w-[16px] text-slate-400" />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Lengkap</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><User className="h-[18px] w-[18px] text-slate-400" /></div>
                        <input
                            type="text"
                            required
                            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white transition-all shadow-xs hover:border-slate-300"
                            placeholder="Nama Lengkap Admin"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                        />
                    </div>
                </div>

                {/* Conditional Input based on Type */}
                {regType === 'create' ? (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Ma'had</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><Building className="h-[18px] w-[18px] text-slate-400" /></div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2.5 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white transition-all shadow-xs hover:border-slate-300"
                                placeholder="Nama Ma'had Baru"
                                value={mahadName}
                                onChange={(e) => setMahadName(e.target.value)}
                            />
                        </div>
                    </div>
                ) : null}
                {regType === 'create' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1.5">No HP/WA</span>
                            <input type="tel" className="field" placeholder="08xx" value={noHp} onChange={(e) => setNoHp(e.target.value)} /></label>
                        <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1.5">Kota</span>
                            <input type="text" className="field" placeholder="Kota/kabupaten" value={kota} onChange={(e) => setKota(e.target.value)} /></label>
                        <label className="block sm:col-span-2"><span className="block text-sm font-medium text-slate-700 mb-1.5">Perkiraan jumlah santri</span>
                            <input type="text" inputMode="numeric" className="field" placeholder="mis. 150" value={perkiraanSantri} onChange={(e) => setPerkiraanSantri(e.target.value)} /></label>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">ID Organisasi</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><ClipboardCopy className="h-[18px] w-[18px] text-slate-400" /></div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2.5 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white transition-all shadow-xs hover:border-slate-300"
                                placeholder="ID Organisasi (Minta ke Admin)"
                                value={orgId}
                                onChange={(e) => setOrgId(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Alamat Email</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><Mail className="h-[18px] w-[18px] text-slate-400" /></div>
                        <input
                            type="email"
                            required
                            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white transition-all shadow-xs hover:border-slate-300"
                            placeholder="Email Login"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Kata Sandi</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><KeyRound className="h-[18px] w-[18px] text-slate-400" /></div>
                        <input
                            type="password"
                            required
                            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white transition-all shadow-xs hover:border-slate-300"
                            placeholder="Kata sandi (min. 8 karakter)"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>

                <label className="flex items-start gap-2 text-sm text-slate-600">
                    <input type="checkbox" className="mt-0.5" checked={setujuPrivasi} onChange={(e) => setSetujuPrivasi(e.target.checked)} />
                    <span>Saya menyetujui <a href="/privasi" target="_blank" rel="noopener" className="font-medium text-blue-700 underline">Kebijakan Privasi</a> dan bertanggung jawab memperoleh persetujuan wali sebelum mengunggah data santri.</span>
                </label>

                <div className="pt-3">
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary btn-lg w-full"
                    >
                        {loading ? 'Mendaftarkan...' : 'Daftar Akun'}
                    </button>
                    <p className="text-2xs text-slate-400 mt-4 text-center leading-relaxed px-4">
                        Lembaga baru aktif setelah disetujui pengelola aplikasi. Tidak ada masa uji coba; harga sesuai paket jumlah santri.
                    </p>
                </div>
                
                <div className="mt-8 text-center border-t border-slate-100 pt-6">
                  <p className="text-sm text-slate-500">
                    Sudah memiliki akun? <button type="button" onClick={() => { setMode('login'); setMessage(null); }} className="font-medium text-blue-600 hover:text-blue-700 transition-colors">Masuk sekarang</button>
                  </p>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Image & Context */}
      <div className="hidden lg:flex flex-1 relative bg-slate-900 overflow-hidden items-center justify-center">
        {/* Background Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1607332070811-cd409917e369?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYmx1ZSUyMGFic3RyYWN0JTIwdGV4dHVyZXxlbnwxfHx8fDE3NzgzOTc3NDl8MA&ixlib=rb-4.1.0&q=80&w=1080" 
            alt="Background" 
            className="h-full w-full object-cover opacity-20 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/60 via-slate-900 to-slate-900/90"></div>
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        </div>

        {/* Content Container */}
        <div className="relative z-10 w-full max-w-[560px] p-12">
          {publishedConfig.loginPage?.systemStatusText && (
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs font-medium backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                {publishedConfig.loginPage.systemStatusText}
              </div>
            </div>
          )}

          <Quote className="w-10 h-10 text-blue-400/40 mb-6" />
          
          <h3 className="text-2xl xl:text-3xl font-semibold tracking-tight text-white leading-[1.4] mb-8">
            {publishedConfig.loginPage?.quoteText || '"Platform ini mengubah total cara kami mengelola progres hafalan santri. Sangat intuitif, cepat, dan laporannya luar biasa rapi. Benar-benar memangkas jam kerja admin."'}
          </h3>
          
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full border border-slate-700 overflow-hidden bg-slate-800">
              <img 
                src={publishedConfig.loginPage?.authorAvatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=UstadzBudi"} 
                alt="User Avatar" 
                className="h-full w-full object-cover opacity-90"
              />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{publishedConfig.loginPage?.authorName || 'Ust. Ahmad Fatih'}</div>
              <div className="text-sm text-slate-400">{publishedConfig.loginPage?.authorRole || 'Kepala Tahfidz, PPTQ Al-Ikhlas'}</div>
            </div>
          </div>
          
          {publishedConfig.loginPage?.stats && publishedConfig.loginPage.stats.length > 0 && (
            <div className="grid grid-cols-3 gap-6 mt-16 pt-8 border-t border-slate-700/50">
              {publishedConfig.loginPage.stats.map((stat, idx) => (
                <div key={idx}>
                  <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                  <div className="text-xs text-slate-400 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;

