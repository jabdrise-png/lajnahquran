/**
 * Fase 3 · daftar setoran (sudah sah) dengan aksi Admin: koreksi (alasan), batalkan (alasan), riwayat revisi.
 * Tidak ada lagi tombol validasi.
 */
import React, { useState } from 'react';
import { History, Pencil, XCircle } from 'lucide-react';
import type { Halaqah, Santri } from '../../types';
import type { SetoranRow } from '../../lib/v2Adapter';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { tampilkanError } from '../../lib/pesanError';
import { NotificationStore } from '../../lib/NotificationStore';
import Modal from '../Modal';
import AlasanDialog from '../ui/AlasanDialog';
import FormSetoranRingkas from './FormSetoranRingkas';

interface Props {
  rows: SetoranRow[];
  isAdmin: boolean;
  halaqahOptions: Halaqah[];
  santriList: Santri[];
  showDate?: boolean;
  emptyText?: string;
}

const rentang = (r: SetoranRow) =>
  r.surat_mulai === r.surat_selesai ? `${r.surat_mulai} ${r.ayat_mulai}–${r.ayat_selesai}` : `${r.surat_mulai} ${r.ayat_mulai} – ${r.surat_selesai} ${r.ayat_selesai}`;

const DaftarSetoran: React.FC<Props> = ({ rows, isAdmin, halaqahOptions, santriList, showDate, emptyText }) => {
  const { deleteSetoranHarianRecord } = useSupabaseData();
  const [koreksi, setKoreksi] = useState<SetoranRow | null>(null);
  const [batal, setBatal] = useState<SetoranRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [riwayat, setRiwayat] = useState<{ row: SetoranRow; items: any[] } | null>(null);

  const nama = (id: number) => santriList.find((s) => Number(s.id) === id)?.nama || `Santri ${id}`;
  const halaqahNama = (id: number | null) => halaqahOptions.find((h) => h.id === id)?.nama || '';

  const bukaRiwayat = async (row: SetoranRow) => {
    const { data, error } = await (supabase as any)
      .from('recitation_revisions').select('*').eq('entry_id', row.v2_id).order('revision_no', { ascending: true });
    if (error) { tampilkanError(error, 'Gagal memuat riwayat'); return; }
    setRiwayat({ row, items: data || [] });
  };

  if (rows.length === 0) return <p className="text-xs text-slate-500 py-3">{emptyText || 'Belum ada setoran.'}</p>;

  return (
    <>
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {nama(r.santri_id)} <span className="font-normal text-slate-500">· {r.skema}</span>
              </div>
              <div className="text-[12px] text-slate-600">
                {showDate && <>{r.tanggal} {r.waktu} · </>}{rentang(r)} · {r.jumlah_halaman} hal · K{r.kesalahan_kabir}/S{r.kesalahan_shoghir}
                {halaqahNama(r.halaqah_id) && showDate && <> · {halaqahNama(r.halaqah_id)}</>}
              </div>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${r.is_repeat ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {r.nilai || '-'}{r.is_repeat ? ' · Ulang' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" title="Riwayat revisi" onClick={() => bukaRiwayat(r)} className="p-1.5 text-slate-400 hover:text-slate-700"><History size={15} /></button>
              {/* Koreksi: Admin & musammi' halaqah itu (server memeriksa); pembatalan hanya Admin */}
              <button type="button" title="Koreksi" onClick={() => setKoreksi(r)} className="p-1.5 text-slate-400 hover:text-blue-600"><Pencil size={15} /></button>
              {isAdmin && (
                <button type="button" title="Batalkan" onClick={() => setBatal(r)} className="p-1.5 text-slate-400 hover:text-red-600"><XCircle size={15} /></button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Modal isOpen={Boolean(koreksi)} onClose={() => setKoreksi(null)} title="Koreksi setoran" maxWidth="lg">
        {koreksi && (
          <FormSetoranRingkas
            halaqahOptions={halaqahOptions}
            initialHalaqahId={koreksi.halaqah_id}
            editEntry={koreksi}
            onDone={() => setKoreksi(null)}
          />
        )}
      </Modal>

      <AlasanDialog
        isOpen={Boolean(batal)}
        title="Batalkan setoran"
        danger
        busy={busy}
        description={batal ? <>Setoran <b>{nama(batal.santri_id)}</b> ({rentang(batal)}, {batal.tanggal}) dibatalkan dan tidak dihitung lagi. Tindakan ini tercatat di riwayat.</> : null}
        confirmLabel="Batalkan setoran"
        onCancel={() => setBatal(null)}
        onConfirm={async (alasan) => {
          if (!batal) return;
          setBusy(true);
          try {
            await deleteSetoranHarianRecord(batal.id, alasan);
            NotificationStore.addNotification('Setoran dibatalkan.', 'info');
            setBatal(null);
          } catch (e) {
            tampilkanError(e, 'Gagal membatalkan setoran');
          } finally {
            setBusy(false);
          }
        }}
      />

      <Modal isOpen={Boolean(riwayat)} onClose={() => setRiwayat(null)} title="Riwayat revisi setoran" maxWidth="lg">
        {riwayat && (
          <ol className="space-y-2 text-sm">
            {riwayat.items.length === 0 && <li className="text-slate-500 text-xs">Belum ada riwayat.</li>}
            {riwayat.items.map((it) => (
              <li key={it.id} className="border border-slate-200 rounded-lg px-3 py-2">
                <div className="font-semibold text-slate-800">
                  #{it.revision_no} · {it.action === 'create' || it.action?.startsWith('create') ? 'Dicatat' : it.action === 'void' ? 'Dibatalkan' : it.action === 'correct' ? 'Dikoreksi' : it.action}
                  <span className="font-normal text-slate-500"> · {new Date(it.created_at).toLocaleString('id-ID')}</span>
                </div>
                {it.reason && <div className="text-xs text-slate-600">Alasan: {it.reason}</div>}
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </>
  );
};

export default DaftarSetoran;
