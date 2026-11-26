/**
 * Fase 4 · Mode pencatatan per halaqah (spesifikasi 6.1).
 * Harian: rekap dijumlah otomatis dari setoran harian. Rekap: musammi' mengisi sekali di akhir periode.
 * Perubahan berlaku mulai periode berikutnya (mode periode berjalan dibekukan di database).
 */
import React, { useMemo, useState } from 'react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import { hariIni } from '../../lib/sesiHalaqah';
import { periodePada } from '../../lib/rekapAdapter';

const ModePencatatanPanel: React.FC = () => {
  const { halaqah, evaluationPeriods, setModeHalaqah, userProfile } = useSupabaseData();
  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(String(userProfile?.role || '').toLowerCase());
  const [busy, setBusy] = useState<number | null>(null);
  const aktif = useMemo(
    () => halaqah.filter((h) => h.is_active !== false && !h.is_archived)
      .sort((a, b) => (a.no_urut || 999) - (b.no_urut || 999) || a.nama.localeCompare(b.nama)),
    [halaqah]
  );
  const berjalan = periodePada(evaluationPeriods, hariIni());
  const jumlah = { harian: aktif.filter((h) => h.recording_mode !== 'rekap').length, rekap: aktif.filter((h) => h.recording_mode === 'rekap').length };

  const ubah = async (id: number, nama: string, mode: 'harian' | 'rekap') => {
    setBusy(id);
    try {
      await setModeHalaqah(id, mode);
      NotificationStore.addNotification(
        `${nama}: ${mode === 'harian' ? 'Mode Harian' : 'Mode Rekap'} berlaku mulai periode berikutnya${berjalan ? ` (periode "${berjalan.name}" tetap memakai mode sebelumnya)` : ''}.`,
        'success'
      );
    } catch (e) { tampilkanError(e, 'Gagal mengubah mode pencatatan'); } finally { setBusy(null); }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Mode Pencatatan Halaqah</h2>
        <p className="text-xs sm:text-sm text-slate-500">
          <b>Mode Harian</b>: musammi' mencatat setiap setoran; rekap periode dijumlah otomatis. <b>Mode Rekap</b>: musammi' mengisi rekap sekali di akhir periode.
          Perubahan berlaku mulai periode berikutnya. Harian {jumlah.harian} · Rekap {jumlah.rekap}.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {aktif.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800 truncate">{h.nama}</div>
              <div className="text-[11px] text-slate-400 truncate">{h.musammi?.nama || '-'}</div>
            </div>
            <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-semibold shrink-0">
              {(['harian', 'rekap'] as const).map((m) => (
                <button key={m} type="button" disabled={!isAdmin || busy === h.id || (h.recording_mode || 'harian') === m}
                  onClick={() => ubah(h.id, h.nama, m)}
                  className={`px-2.5 py-1 ${(h.recording_mode || 'harian') === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:cursor-default`}>
                  {m === 'harian' ? 'Harian' : 'Rekap'}
                </button>
              ))}
            </div>
          </div>
        ))}
        {aktif.length === 0 && <p className="text-sm text-slate-400">Belum ada halaqah aktif.</p>}
      </div>
    </section>
  );
};

export default ModePencatatanPanel;
