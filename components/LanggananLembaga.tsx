/**
 * Fase 8 · kartu "Langganan" untuk Admin lembaga (Pengaturan) dan peringatan kuota santri (Data Santri).
 * Data dari rpc_langganan_saya; pembayaran dicatat Superadmin (transfer manual).
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { LABEL_STATUS_LANGGANAN, rupiah, tanggalId, type LanggananSaya } from '../lib/bisnis';
import { StatusBadge, type BadgeTone } from './ui/SaaSPrimitives';

const NADA: Record<string, BadgeTone> = { aktif: 'success', segera_habis: 'warning', lewat: 'danger', belum_bayar: 'neutral' };

export function useLanggananSaya() {
  const { getOrgId } = useSupabaseData();
  const [data, setData] = useState<LanggananSaya | null>(null);
  useEffect(() => {
    let aktif = true;
    (async () => {
      const org = await getOrgId();
      if (!org) return;
      const { data: r, error } = await (supabase as any).rpc('rpc_langganan_saya', { p_org: org });
      if (aktif && !error) setData(r as LanggananSaya);
    })();
    return () => { aktif = false; };
  }, [getOrgId]);
  return data;
}

export const KartuLangganan: React.FC = () => {
  const l = useLanggananSaya();
  if (!l) return null;
  return (
    <section className="card">
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><CreditCard size={18} className="text-blue-600" /><h2 className="text-base font-bold text-slate-900">Langganan</h2></div>
        <StatusBadge label={LABEL_STATUS_LANGGANAN[l.status_langganan]} tone={NADA[l.status_langganan]} />
      </div>
      <dl className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div><dt className="text-xs text-slate-500">Paket</dt><dd className="font-semibold text-slate-900">{l.nama_paket || l.plan_id}</dd></div>
        <div><dt className="text-xs text-slate-500">Santri aktif</dt>
          <dd className={`font-semibold ${l.melebihi_kuota ? 'text-red-700' : 'text-slate-900'}`}>{l.santri_aktif}{l.batas_santri != null ? ` dari ${l.batas_santri}` : ' (tanpa batas)'}</dd></div>
        <div><dt className="text-xs text-slate-500">Berlaku sampai</dt><dd className="font-semibold text-slate-900">{tanggalId(l.langganan_sampai)}</dd></div>
        <div><dt className="text-xs text-slate-500">Harga</dt><dd className="font-semibold text-slate-900">
          {l.harga_tahunan ? `${rupiah(l.harga_tahunan)}/tahun` : l.harga_bulanan ? `${rupiah(l.harga_bulanan)}/bulan` : '-'}</dd></div>
      </dl>
      <p className="px-4 sm:px-5 pb-4 text-sm text-slate-500">
        Pembayaran melalui transfer; konfirmasi ke pengelola aplikasi agar masa langganan diperpanjang.
        {l.melebihi_kuota && ' Jumlah santri aktif melebihi batas paket — hubungi pengelola untuk pindah paket.'}
      </p>
    </section>
  );
};

/** Pita peringatan singkat (dipakai di Data Santri). Muncul hanya bila melebihi kuota atau langganan lewat/segera habis. */
export const PeringatanLangganan: React.FC = () => {
  const l = useLanggananSaya();
  if (!l) return null;
  const pesan: string[] = [];
  if (l.melebihi_kuota) pesan.push(`Santri aktif (${l.santri_aktif}) melebihi batas paket ${l.nama_paket || ''} (${l.batas_santri}).`);
  if (l.status_langganan === 'lewat') pesan.push(`Masa langganan berakhir ${tanggalId(l.langganan_sampai)}.`);
  if (l.status_langganan === 'segera_habis') pesan.push(`Masa langganan berakhir ${tanggalId(l.langganan_sampai)}.`);
  if (!pesan.length) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{pesan.join(' ')} Hubungi pengelola aplikasi.</span>
    </div>
  );
};
