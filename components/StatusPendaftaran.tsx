/** Fase 8 · di layar "menunggu aktivasi": tampilkan status pendaftaran lembaga milik pengguna (bila ada). */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const StatusPendaftaran: React.FC = () => {
  const [p, setP] = useState<{ nama_lembaga: string; status: string; alasan: string | null } | null>(null);
  useEffect(() => {
    (supabase as any).from('pendaftaran_lembaga').select('nama_lembaga,status,alasan').limit(1).maybeSingle()
      .then(({ data }: any) => setP(data || null), () => undefined);
  }, []);
  if (!p) return null;
  if (p.status === 'ditolak') {
    return (
      <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800">
        Pendaftaran <b>{p.nama_lembaga}</b> tidak disetujui{p.alasan ? `: ${p.alasan}` : '.'}
      </div>
    );
  }
  return (
    <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left text-sm text-blue-900">
      Pendaftaran lembaga <b>{p.nama_lembaga}</b> sedang ditinjau pengelola aplikasi. Setelah disetujui, Anda otomatis menjadi Admin lembaga — muat ulang halaman ini.
    </div>
  );
};

export default StatusPendaftaran;
